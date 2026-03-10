import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // State untuk form otentikasi
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authData, setAuthData] = useState({ name: '', email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (error) {
      console.error('Gagal mengambil file', error);
    }
  };

  const handleAuthChange = (e) => {
    setAuthData({ ...authData, [e.target.name]: e.target.value });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    
    try {
      if (isLoginMode) {
        // Proses Login
        const res = await axios.post(`${API_URL}/api/auth/login`, {
          email: authData.email,
          password: authData.password
        });
        setToken(res.data.token);
        setUser(res.data.user);
      } else {
        // Proses Register
        await axios.post(`${API_URL}/api/auth/register`, authData);
        setAuthMessage('Registrasi berhasil! Silakan login.');
        setIsLoginMode(true);
        setAuthData({ name: '', email: '', password: '' });
      }
    } catch (error) {
      setAuthMessage(error.response?.data || 'Terjadi kesalahan');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setFiles([]);
  };

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      setFiles([response.data, ...files]);
      setUploadProgress(0); 
    } catch (error) {
      console.error('Upload error', error);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/files/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(files.filter(file => file.id !== id));
    } catch (error) {
      console.error('Delete error', error);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: 'auto' }}>
      <h1>G-Drive Clone 📁</h1>
      
      {!user ? (
        <div style={{ maxWidth: '400px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>{isLoginMode ? 'Login' : 'Register'}</h2>
          {authMessage && <p style={{ color: isLoginMode ? 'green' : 'red' }}>{authMessage}</p>}
          
          <form onSubmit={handleAuthSubmit}>
            {!isLoginMode && (
              <div style={{ marginBottom: '10px' }}>
                <label>Nama:</label><br/>
                <input type="text" name="name" value={authData.name} onChange={handleAuthChange} required style={{ width: '100%', padding: '8px' }} />
              </div>
            )}
            <div style={{ marginBottom: '10px' }}>
              <label>Email:</label><br/>
              <input type="email" name="email" value={authData.email} onChange={handleAuthChange} required style={{ width: '100%', padding: '8px' }} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Password:</label><br/>
              <input type="password" name="password" value={authData.password} onChange={handleAuthChange} required style={{ width: '100%', padding: '8px' }} />
            </div>
            <button type="submit" style={{ padding: '10px 15px', width: '100%', cursor: 'pointer' }}>
              {isLoginMode ? 'Masuk' : 'Daftar'}
            </button>
          </form>
          
          <p style={{ marginTop: '15px', textAlign: 'center', cursor: 'pointer', color: 'blue' }} onClick={() => { setIsLoginMode(!isLoginMode); setAuthMessage(''); }}>
            {isLoginMode ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Login di sini'}
          </p>
        </div>
      ) : (
        <div>
          <p>Halo, <strong>{user.name}</strong> <button onClick={handleLogout} style={{ marginLeft: '10px', cursor: 'pointer' }}>Logout</button></p>
          
          <div style={{ margin: '20px 0', padding: '20px', border: '2px dashed #ccc', borderRadius: '8px' }}>
            <h3>Upload File</h3>
            <input type="file" onChange={handleUpload} />
            {uploadProgress > 0 && (
              <div style={{ marginTop: '10px' }}>
                <progress value={uploadProgress} max="100" style={{ width: '100%' }}></progress>
                <p>{uploadProgress}%</p>
              </div>
            )}
          </div>

          <h3>Daftar File</h3>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th>Nama File</th>
                <th>Tanggal Upload</th>
                <th>Ukuran</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '8px 0' }}>{file.file_name}</td>
                  <td>{new Date(file.upload_date).toLocaleDateString('id-ID')}</td>
                  <td>{formatBytes(file.file_size)}</td>
                  <td>
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer" download>
                      <button style={{ marginRight: '8px', cursor: 'pointer' }}>Download</button>
                    </a>
                    <button onClick={() => handleDelete(file.id)} style={{ color: 'red', cursor: 'pointer' }}>Hapus</button>
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Belum ada file.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;