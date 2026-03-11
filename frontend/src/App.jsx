import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // State Loading & Auth
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authData, setAuthData] = useState({ name: '', email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const fileInputRef = useRef(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    if (token) fetchFiles();
  }, [token]);

  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await axios.get(`${API_URL}/api/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (error) {
      console.error('Gagal mengambil file', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleAuthChange = (e) => setAuthData({ ...authData, [e.target.name]: e.target.value });

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    setIsLoadingAuth(true);
    
    try {
      if (isLoginMode) {
        const res = await axios.post(`${API_URL}/api/auth/login`, {
          email: authData.email, password: authData.password
        });
        setToken(res.data.token);
        setUser(res.data.user);
      } else {
        await axios.post(`${API_URL}/api/auth/register`, authData);
        setAuthMessage('Registrasi berhasil! Silakan login.');
        setIsLoginMode(true);
        setAuthData({ name: '', email: '', password: '' });
      }
    } catch (error) {
      setAuthMessage(error.response?.data || 'Terjadi kesalahan');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = () => {
    setUser(null); setToken(null); setFiles([]);
  };

  const handleUploadClick = () => fileInputRef.current.click();

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
    } catch (error) {
      console.error('Upload error', error);
    } finally {
      setUploadProgress(0);
      event.target.value = ''; // Reset input
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm('Yakin ingin menghapus file ini?')) return;
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
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Komponen Spinner Loading Mungil
  const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  // --- TAMPILAN AUTH (LOGIN/REGISTER) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
          <div className="flex justify-center mb-6 text-blue-600">
            <span className="material-icons-outlined text-6xl">cloud_done</span>
          </div>
          <h2 className="text-2xl font-semibold text-center text-gray-800 mb-6">
            {isLoginMode ? 'Login ke G-Drive Clone' : 'Buat Akun Baru'}
          </h2>
          
          {authMessage && (
            <div className={`p-3 mb-4 rounded-lg text-sm ${isLoginMode && authMessage.includes('berhasil') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {authMessage}
            </div>
          )}
          
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {!isLoginMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                <input type="text" name="name" value={authData.name} onChange={handleAuthChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" name="email" value={authData.email} onChange={handleAuthChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" name="password" value={authData.password} onChange={handleAuthChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <button type="submit" disabled={isLoadingAuth} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex justify-center items-center">
              {isLoadingAuth ? <Spinner /> : (isLoginMode ? 'Masuk' : 'Daftar')}
            </button>
          </form>
          
          <p className="mt-6 text-center text-sm text-gray-600">
            {isLoginMode ? 'Belum punya akun? ' : 'Sudah punya akun? '}
            <button onClick={() => { setIsLoginMode(!isLoginMode); setAuthMessage(''); }} className="text-blue-600 font-semibold hover:underline">
              {isLoginMode ? 'Daftar di sini' : 'Login di sini'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // --- TAMPILAN DASHBOARD UTAMA ---
  return (
    <div className="min-h-screen text-gray-800 flex flex-col">
      {/* Navbar Atas */}
      <header className="bg-white flex items-center justify-between px-6 py-3 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-2 text-gray-600">
          <span className="material-icons-outlined text-blue-600 text-3xl">add_to_drive</span>
          <span className="text-xl font-medium text-gray-700">Drive Clone</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-block text-sm text-gray-600">Halo, <strong>{user.name}</strong></span>
          <button onClick={handleLogout} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors" title="Logout">
            <span className="material-icons-outlined">logout</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Kiri */}
        <aside className="w-64 bg-[#f8fafd] p-4 hidden md:flex flex-col border-r border-transparent">
          <button onClick={handleUploadClick} className="bg-white hover:bg-blue-50 hover:shadow-md text-gray-700 border border-gray-200 font-medium py-3 px-6 rounded-2xl flex items-center gap-3 w-fit transition-all shadow-sm mb-6">
            <span className="material-icons-outlined text-blue-600">add</span>
            Baru
          </button>
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />
          
          <nav className="flex flex-col gap-1">
            <div className="flex items-center gap-4 px-4 py-2 bg-blue-100 text-blue-800 rounded-r-full font-medium cursor-pointer">
              <span className="material-icons-outlined">hard_drive</span> Drive Saya
            </div>
            <div className="flex items-center gap-4 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-r-full font-medium cursor-pointer">
              <span className="material-icons-outlined">delete</span> Sampah
            </div>
          </nav>
        </aside>

        {/* Konten Utama (List File) */}
        <main className="flex-1 bg-white md:m-4 md:rounded-2xl md:shadow-sm border border-gray-200 overflow-y-auto p-4 md:p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-medium text-gray-800">Drive Saya</h1>
            {/* Tombol Upload versi Mobile */}
            <button onClick={handleUploadClick} className="md:hidden bg-blue-600 text-white p-2 rounded-full shadow-lg">
              <span className="material-icons-outlined">add</span>
            </button>
          </div>

          {/* Progress Bar Muncul Saat Upload Saja */}
          {uploadProgress > 0 && (
            <div className="mb-6 bg-blue-50 border border-blue-200 p-4 rounded-xl">
              <div className="flex justify-between text-sm text-blue-800 font-medium mb-2">
                <span>Mengunggah file...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          {/* Tabel File */}
          {isLoadingFiles ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p>Memuat file...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-sm">
                    <th className="pb-3 font-medium px-4">Nama</th>
                    <th className="pb-3 font-medium px-4">Diubah Terakhir</th>
                    <th className="pb-3 font-medium px-4">Ukuran</th>
                    <th className="pb-3 font-medium px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {files.map((file) => (
                    <tr key={file.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                      <td className="py-3 px-4 flex items-center gap-3">
                        <span className="material-icons-outlined text-gray-400">insert_drive_file</span>
                        <span className="font-medium text-gray-700 truncate max-w-[200px] md:max-w-xs">{file.file_name}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-500">{new Date(file.upload_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="py-3 px-4 text-gray-500">{formatBytes(file.file_size)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={file.file_url} target="_blank" rel="noopener noreferrer" download className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-colors flex items-center" title="Download">
                            <span className="material-icons-outlined text-xl">download</span>
                          </a>
                          <button onClick={() => handleDelete(file.id)} className="text-gray-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-colors flex items-center" title="Hapus">
                            <span className="material-icons-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td colSpan="4" className="text-center py-16 text-gray-500">
                        <span className="material-icons-outlined text-6xl text-gray-300 mb-4 block">folder_open</span>
                        Belum ada file di Drive kamu.<br/>Klik tombol "Baru" untuk mulai mengunggah.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;