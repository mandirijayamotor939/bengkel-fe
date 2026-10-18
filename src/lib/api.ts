// api.ts
import axios from 'axios';

// Konfigurasi instance axios global
export const api = axios.create({
  baseURL: import.meta.env.PUBLIC_DIRECTUS_URL || 'http://localhost:8055' || 'https://api.mjmbersama.cloud' ,
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

// Interceptor untuk otomatis silent refresh token jika error 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (typeof window !== 'undefined') {
        const getCookie = (name: string) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
        };

        const refreshToken = getCookie('directus_refresh_token');

        if (refreshToken) {
          try {
            const baseUrl = import.meta.env.PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
            const res = await fetch(`${baseUrl}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (res.ok) {
              const data = await res.json();
              const newToken = data.data.access_token;
              const newRefreshToken = data.data.refresh_token;

              const TEN_YEARS = 315360000;
              document.cookie = `directus_token=${newToken}; path=/; max-age=${TEN_YEARS}; samesite=strict;`;
              if (newRefreshToken) {
                document.cookie = `directus_refresh_token=${newRefreshToken}; path=/; max-age=${TEN_YEARS}; samesite=strict;`;
              }

              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              return api(originalRequest);
            }
          } catch (e) {
            console.error("Gagal refresh token otomatis:", e);
          }
        }

        // Jika refresh token gagal/kadaluarsa total, baru arahkan ke login
        document.cookie = "directus_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        document.cookie = "directus_refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        document.cookie = "user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);