require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_aman';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Fungsi untuk membuat tabel otomatis jika belum ada
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        s3_key VARCHAR(255) NOT NULL,
        file_url VARCHAR(512) NOT NULL,
        file_size INT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    connection.release();
    console.log('Tabel database berhasil diverifikasi/dibuat.');
  } catch (error) {
    console.error('Gagal menginisialisasi database:', error);
  }
};

const upload = multer({ storage: multer.memoryStorage() });

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).send('Token diperlukan');
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send('Token tidak valid');
    req.user = decoded;
    next();
  });
};

app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub: googleId, email, name } = ticket.getPayload();

    const [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    let userId;

    if (rows.length === 0) {
      const [result] = await pool.query(
        'INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)',
        [googleId, email, name]
      );
      userId = result.insertId;
    } else {
      userId = rows[0].id;
    }

    const customJwt = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token: customJwt, user: { id: userId, email, name } });
  } catch (error) {
    res.status(401).send('Verifikasi Google gagal.');
  }
});

app.get('/api/files', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM files WHERE user_id = ? ORDER BY upload_date DESC', [req.user.id]);
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).send('Gagal mengambil daftar file.');
  }
});

app.post('/api/upload', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('Tidak ada file yang diunggah.');

  const fileKey = `${uuidv4()}-${req.file.originalname}`;
  const fileSize = req.file.size;
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    const [result] = await pool.query(
      'INSERT INTO files (user_id, file_name, s3_key, file_url, file_size) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.file.originalname, fileKey, fileUrl, fileSize]
    );

    const [newFile] = await pool.query('SELECT * FROM files WHERE id = ?', [result.insertId]);
    res.status(200).json(newFile[0]);
  } catch (error) {
    res.status(500).send('Gagal mengunggah file.');
  }
});

app.delete('/api/files/:id', verifyToken, async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user.id;

  try {
    const [rows] = await pool.query('SELECT s3_key FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (rows.length === 0) return res.status(404).send('File tidak ditemukan atau akses ditolak.');
    
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: rows[0].s3_key,
    }));

    await pool.query('DELETE FROM files WHERE id = ?', [fileId]);
    res.status(200).send('File berhasil dihapus.');
  } catch (error) {
    res.status(500).send('Gagal menghapus file.');
  }
});

// Jalankan inisialisasi database sebelum server mulai berjalan
initializeDatabase().then(() => {
  app.listen(5000, () => console.log('Backend berjalan di port 5000'));
});