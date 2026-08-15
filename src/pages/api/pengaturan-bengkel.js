// src/pages/api/pengaturan-bengkel.js

// 1. GET: Untuk mengambil data pengaturan bengkel dari Directus
export const GET = async ({ cookies }) => {
    const token = cookies.get("directus_token")?.value;
    const directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055";

    if (!token) {
        return new Response(JSON.stringify({ success: false, message: "Akses ditolak. Sesi tidak valid." }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const res = await fetch(`${directusUrl}/items/pengaturan_bengkel`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();

        return new Response(JSON.stringify(json), {
            status: res.status,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

// 2. PATCH: Untuk mengupdate data pengaturan bengkel ke Directus
export const PATCH = async ({ request, cookies }) => {
    const token = cookies.get("directus_token")?.value;
    const directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055";

    if (!token) {
        return new Response(JSON.stringify({ success: false, message: "Akses ditolak. Sesi tidak valid." }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json();

        const res = await fetch(`${directusUrl}/items/pengaturan_bengkel`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const json = await res.json();

        return new Response(JSON.stringify({ success: res.ok, data: json.data }), {
            status: res.status,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};