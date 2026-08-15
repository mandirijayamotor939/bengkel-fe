import { postWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { nama_produk, stok_qty, harga_modal, harga_jual } = body;

        if (!nama_produk || harga_modal === undefined || harga_jual === undefined) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Nama produk, harga modal, dan harga jual wajib diisi!" 
            }), { status: 400 });
        }

        // Simpan ke Directus
        await postWithAuth('/items/produk', {
            nama_produk: nama_produk,
            stok_qty: stok_qty || 0,
            harga_modal: harga_modal,
            harga_jual: harga_jual
        }, token);

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Produk baru berhasil ditambahkan ke katalog." 
        }), { status: 200 });

    } catch (error) {
        console.error("API Error (Tambah Produk):", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Terjadi kesalahan pada server saat menyimpan produk." 
        }), { status: 500 });
    }
}