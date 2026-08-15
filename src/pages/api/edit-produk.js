import { patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { id, nama_produk, stok_qty, harga_modal, harga_jual } = body;

        if (!id || !nama_produk || harga_modal === undefined || harga_jual === undefined) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Data tidak lengkap!" 
            }), { status: 400 });
        }

        // Update data ke Directus menggunakan PATCH dengan Token
        await patchWithAuth(`/items/produk/${id}`, {
            nama_produk: nama_produk,
            stok_qty: stok_qty,
            harga_modal: harga_modal,
            harga_jual: harga_jual
        }, token);

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Data produk berhasil diperbarui." 
        }), { status: 200 });

    } catch (error) {
        console.error("API Error (Edit Produk):", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Terjadi kesalahan server saat memperbarui produk." 
        }), { status: 500 });
    }
}