import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { tanggal_pembelian, sumber_dana, items } = body;

        // 1. Validasi Input
        if (!tanggal_pembelian || !sumber_dana || !items || items.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Tanggal, Sumber Dana, dan minimal 1 barang wajib diisi!" 
            }), { status: 400 });
        }

        // 2. Hitung Total Biaya Keseluruhan (Modal)
        let total_biaya = 0;
        for (const item of items) {
            total_biaya += (item.qty_masuk * item.harga_modal_baru);
        }

        // 3. Catat Induk Nota ke 'pembelian_stok'
        const resPembelian = await postWithAuth('/items/pembelian_stok', {
            tanggal_pembelian: tanggal_pembelian,
            total_biaya: total_biaya
        }, token);
        const pembelianId = resPembelian.data.data.id;

        // 4. Eksekusi Detail Barang & Update Stok + Harga Produk
        for (const item of items) {
            await postWithAuth('/items/detail_pembelian_stok', {
                pembelian_id: pembelianId,
                produk_id: item.produk_id,
                qty_masuk: item.qty_masuk,
                harga_modal_baru: item.harga_modal_baru,
                harga_jual_baru: item.harga_jual_baru
            }, token);

            const resProduk = await getWithAuth(`/items/produk/${item.produk_id}`, token);
            const stokLama = resProduk.data.data.stok_qty || 0;

            await patchWithAuth(`/items/produk/${item.produk_id}`, {
                stok_qty: stokLama + item.qty_masuk,
                harga_modal: item.harga_modal_baru,
                harga_jual: item.harga_jual_baru
            }, token);
        }

        // 5. Catat ke Pengeluaran (TANGKAP ID PENGELUARANNYA)
        const resPengeluaran = await postWithAuth('/items/pengeluaran', {
            tanggal_pengeluaran: tanggal_pembelian,
            keterangan: `Restok Grosir ${items.length} macam barang (Ref Nota: #${pembelianId})`,
            nominal: total_biaya,
            kategori: "restok",
            sumber_dana: sumber_dana
        }, token);
        
        // Simpan ID Pengeluaran yang baru saja jadi
        const pengeluaranId = resPengeluaran.data.data.id;

        // 6. PERBAIKAN: Update (PATCH) nota pembelian stok tadi agar terhubung dengan pengeluaran
        await patchWithAuth(`/items/pembelian_stok/${pembelianId}`, {
            pengeluaran_id: pengeluaranId
        }, token);

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Restok berhasil dicatat! Stok fisik dan harga jual produk telah diperbarui." 
        }), { status: 200 });

    } catch (error) {
        console.error("API Error (Restok):", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Terjadi kesalahan pada server saat memproses restok." 
        }), { status: 500 });
    }
}