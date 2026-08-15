import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const payload = await request.json();
        const { trxId, tipe, payloadItem, subtotal, profit } = payload;

        // 1. Jika Ulakan, otomatis buat data pengeluaran terlebih dahulu
        if (tipe === "ulakan") {
            const waktuWIB = new Intl.DateTimeFormat('sv-SE', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(new Date()).replace(' ', 'T');
            const pengeluaranRes = await postWithAuth('/items/pengeluaran', {
                tanggal_pengeluaran: waktuWIB,
                keterangan: `Susulan Ulakan: ${payloadItem.nama_item} (Ref Trx: #${trxId})`,
                nominal: payloadItem.harga_modal_snapshot * payloadItem.qty,
                kategori: "aset/ulakan",
                sumber_dana: "laci_kasir"
            }, token);
            payloadItem.pengeluaran_id = pengeluaranRes.data.data.id;
        }

        const mekanikIds = payloadItem.mekanik_ids_temp;
        delete payloadItem.mekanik_ids_temp;

        // 2. Simpan Item ke Detail Transaksi
        const detailRes = await postWithAuth('/items/detail_transaksi', payloadItem, token);
        const newDetailId = detailRes.data.data.id;

        // 3. Jika Jasa, simpan komisi mekanik
        if (tipe === "jasa" && mekanikIds && mekanikIds.length > 0) {
            const komisiPerOrang = Math.round(payloadItem.total_komisi_jasa / mekanikIds.length);

            const mekanikPromises = mekanikIds.map(mId =>
                postWithAuth('/items/detail_transaksi_mekanik', {
                    detail_transaksi_id: newDetailId,
                    mekanik_id: mId,
                    nominal_komisi_per_orang: komisiPerOrang
                }, token)
            );
            await Promise.all(mekanikPromises);
        }

        // 4. Ambil transaksi saat ini dan Update Total Harga & Profit
        const getTrx = await getWithAuth(`/items/transaksi/${trxId}`, token);
        const currentTrx = getTrx.data.data;

        await patchWithAuth(`/items/transaksi/${trxId}`, {
            total_harga: (currentTrx.total_harga || 0) + subtotal,
            total_profit: (currentTrx.total_profit || 0) + profit
        }, token);

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        console.error("Error API Tambah Susulan:", error);
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
    }
}