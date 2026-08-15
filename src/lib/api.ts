// api.ts
import axios from 'axios';

// Konfigurasi instance axios global
export const api = axios.create({
  baseURL: import.meta.env.PUBLIC_DIRECTUS_URL || 'http://localhost:8055',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getWithAuth = (endpoint: string, token: string) => {
  return api.get(endpoint, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const postWithAuth = (endpoint: string, data: any, token: string) => {
  return api.post(endpoint, data, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// Fungsi helper untuk PATCH (Update data)
export const patchWithAuth = async (endpoint: string, data: any, token: string) => {
    return await api.patch(endpoint, data, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
};

// Fungsi helper untuk DELETE (Hapus data)
export const deleteWithAuth = async (endpoint: string, token: string) => {
    return await api.delete(endpoint, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
};

// Interceptor untuk otomatis logout jika error 401 (Unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Pastikan kode ini berjalan di browser (Client-side)
      if (typeof window !== 'undefined') {
        document.cookie = "directus_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        document.cookie = "directus_refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);