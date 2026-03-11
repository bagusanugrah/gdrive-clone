require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(cors());
app.use(express.json());

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

// Inisialisasi Database dengan skema baru (menggunakan password)
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL
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

// Endpoint: Register Klasik
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send('Semua data wajib diisi.');

  try {
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) return res.status(400).send('Email sudah terdaftar.');

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    res.status(201).send('Registrasi berhasil. Silakan login.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Terjadi kesalahan pada server.');
  }
});

// Endpoint: Login Klasik
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send('Email dan password wajib diisi.');

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).send('Email atau password salah.');

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).send('Email atau password salah.');

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).send('Terjadi kesalahan pada server.');
  }
});

app.get('/api/files', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM files WHERE user_id = ? ORDER BY upload_date DESC', [req.user.id]);
    
    // Looping untuk membuat Presigned URL (Tiket VIP 1 Jam) untuk setiap file
    const filesWithPresignedUrls = await Promise.all(rows.map(async (file) => {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: file.s3_key,
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // Valid 3600 detik (1 jam)
      
      return { ...file, file_url: signedUrl }; // Timpa URL mentah dengan URL VIP
    }));

    res.status(200).json(filesWithPresignedUrls);
  } catch (error) {
    console.error('Error saat fetch file:', error);
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
    
    // Buat tiket VIP langsung untuk file yang baru di-upload ini
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    });
    newFile[0].file_url = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

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

initializeDatabase().then(() => {
  app.listen(5000, () => console.log('Backend berjalan di port 5000'));
});