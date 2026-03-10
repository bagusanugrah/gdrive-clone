import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = "CLIENT_ID_GOOGLE_KAMU.apps.googleusercontent.com"; // Ganti dengan Client ID milikmu

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Ambil daftar file saat token tersedia
  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (error) {
      console.error('Gagal mengambil file', error);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/google`, {
        token: credentialResponse.credential
      });
      setToken(res.data.token);
      setUser(res.data.user);
    } catch (error) {
      console.error('Login gagal', error);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      // Update UI daftar file tanpa refresh
      setFiles([response.data, ...files]);
      setUploadProgress(0); 
    } catch (error) {
      console.error('Upload error', error);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/files/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(files.filter(file => file.id !== id));
    } catch (error) {
      console.error('Delete error', error);
    }
  };

  // Fungsi pembantu untuk format ukuran file
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: 'auto' }}>
        <h1>G-Drive Clone 📁</h1>
        
        {!user ? (
          <GoogleLogin 
            onSuccess={handleGoogleSuccess} 
            onError={() => console.log('Login Gagal')} 
          />
        ) : (
          <div>
            <p>Halo, <strong>{user.name}</strong></p>
            
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
    </GoogleOAuthProvider>
  );
}

export default App;