import { postWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { tanggal_pengeluaran, keterangan, nominal, kategori, sumber_dana } = body;

        if (!tanggal_pengeluaran || !keterangan || !nominal || !kategori || !sumber_dana) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Semua kolom wajib diisi!" 
            }), { status: 400 });
        }

        // Post data ke koleksi 'pengeluaran'
        await postWithAuth('/items/pengeluaran', {
            tanggal_pengeluaran,
            keterangan,
            nominal: parseInt(nominal),
            kategori,
            sumber_dana
        }, token);

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Pengeluaran berhasil dicatat." 
        }), { status: 200 });

    } catch (error) {
        console.error("API Error (Pengeluaran Baru):", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Terjadi kesalahan server saat mencatat pengeluaran." 
        }), { status: 500 });
    }
}