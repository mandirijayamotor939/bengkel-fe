// middleware.ts
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
    const { url, cookies } = context;

    // 1. Abaikan pengecekan untuk halaman login agar tidak infinite loop
    if (url.pathname === '/login') {
        return next();
    }

    let token = cookies.get("directus_token")?.value;
    const refreshToken = cookies.get("directus_refresh_token")?.value;
    const userRole = cookies.get("user_role")?.value; // Role: 'kasir', 'admin', 'superadmin'

    // 2. JIKA TOKEN UTAMA HABIS, TAPI ADA REFRESH TOKEN
    if (!token && refreshToken) {
        try {
            const res = await fetch(`${import.meta.env.PUBLIC_DIRECTUS_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (res.ok) {
                const data = await res.json();
                token = data.data.access_token;

                cookies.set("directus_token", token, { path: "/", maxAge: 1800 });
                
                if (data.data.refresh_token) {
                    cookies.set("directus_refresh_token", data.data.refresh_token, { path: "/", maxAge: 604800 }); 
                }
            } else {
                cookies.delete("directus_token", { path: '/' });
                cookies.delete("directus_refresh_token", { path: '/' });
                cookies.delete("user_role", { path: '/' });
                token = undefined;
            }
        } catch (error) {
            console.error("Gagal refresh token:", error);
            cookies.delete("directus_token", { path: '/' });
            cookies.delete("directus_refresh_token", { path: '/' });
            cookies.delete("user_role", { path: '/' });
            token = undefined;
        }
    }

    // 3. Proteksi Endpoint API
    if (url.pathname.startsWith('/api/') && !token) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Akses API ditolak: Sesi habis atau belum login." 
        }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    // 4. Lempar ke login jika tidak ada token
    if (!token && !url.pathname.startsWith('/api/')) {
        return context.redirect('/login');
    }

    // 5. RESTRIKSI HALAMAN KHUSUS KASIR (Role Guard)
    if (userRole === "kasir") {
        // Halaman yang BISA diakses oleh kasir
        const allowedPathsForKasir = [
            "/transaksi/baru",
            "/api",
            "/login"
        ];

        const isAllowed = allowedPathsForKasir.some(path => url.pathname.startsWith(path));

        // Jika Kasir mencoba buka halaman lain (contoh: /pengeluaran, /penggajian, /produk, dll)
        if (!isAllowed) {
            return context.redirect('/transaksi/baru');
        }
    }

    return next();
});