// middleware.ts
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
    const { url, cookies } = context;

    // 1. Abaikan pengecekan untuk halaman login agar tidak terjadi infinite loop
    if (url.pathname === '/login') {
        return next();
    }

    let token = cookies.get("directus_token")?.value;
    const refreshToken = cookies.get("directus_refresh_token")?.value;

    // 2. JIKA TOKEN UTAMA HABIS, TAPI ADA REFRESH TOKEN (Berlaku untuk semua halaman)
    if (!token && refreshToken) {
        try {
            const res = await fetch(`${import.meta.env.PUBLIC_DIRECTUS_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (res.ok) {
                const data = await res.json();
                token = data.data.access_token; // Dapat token baru!

                // Update cookie dengan token yang baru (30 menit)
                cookies.set("directus_token", token, { path: "/", maxAge: 1800 });
                
                // Update refresh token jika Directus memberikan yang baru
                if (data.data.refresh_token) {
                    cookies.set("directus_refresh_token", data.data.refresh_token, { path: "/", maxAge: 604800 }); 
                }
            } else {
                // Jika refresh token ditolak (misal sudah expired 7 hari atau dicabut)
                cookies.delete("directus_token", { path: '/' });
                cookies.delete("directus_refresh_token", { path: '/' });
                token = undefined; // Pastikan token di-reset
            }
        } catch (error) {
            console.error("Gagal refresh token:", error);
            cookies.delete("directus_token", { path: '/' });
            cookies.delete("directus_refresh_token", { path: '/' });
            token = undefined;
        }
    }

    // 3. Proteksi Khusus untuk Endpoint /api/ bawaan Astro
    if (url.pathname.startsWith('/api/') && !token) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Akses API ditolak: Sesi habis atau belum login." 
        }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    // 4. Lempar ke login jika tidak ada token dan mengakses halaman web
    if (!token && !url.pathname.startsWith('/api/')) {
        return context.redirect('/login');
    }

    return next();
});