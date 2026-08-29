// src/pages/api/simpan-transaksi.js

export const POST = async ({ request, cookies }) => {
    // 1. Ambil token dari cookie (akan selalu aman karena lewat middleware)
    const token = cookies.get("directus_token")?.value;
    const directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055";

    if (!token) {
        return new Response(JSON.stringify({ success: false, message: "Sesi tidak valid atau kadaluarsa." }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json();
        const { payloadTransaksi, keranjang, metodePembayaran, statusPembayaran, waktuSekarang } = body;

        const authHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };

        // 2. Simpan Transaksi Induk
        const resTrx = await fetch(`${directusUrl}/items/transaksi`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(payloadTransaksi),
        });

        if (!resTrx.ok) throw new Error("Gagal membuat nomor nota baru.");
        const dataTrx = await resTrx.json();
        const newTransaksiId = dataTrx.data.id;

        // 3. Looping Keranjang dan Eksekusi ke Directus
        for (const item of keranjang) {
            let createdPengeluaranId = null;

            if (item.tipe_item === "ulakan") {
                const nominalPengeluaran = item.harga_modal_snapshot * item.qty;
                const sumberDanaUlakan = metodePembayaran === "cash" ? "laci_kasir" : "transfer_bank";

                const payloadPengeluaran = {
                    tanggal_pengeluaran: waktuSekarang.split("T")[0],
                    keterangan: `Beli Ulakan: ${item.nama_item} (Ref Trx: #${newTransaksiId})`,
                    nominal: nominalPengeluaran,
                    kategori: "aset/ulakan",
                    sumber_dana: sumberDanaUlakan,
                    modal_terjual: statusPembayaran === "lunas" ? nominalPengeluaran : 0
                };

                const resPengeluaran = await fetch(`${directusUrl}/items/pengeluaran`, {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify(payloadPengeluaran),
                });

                if (resPengeluaran.ok) {
                    const dataPengeluaran = await resPengeluaran.json();
                    createdPengeluaranId = dataPengeluaran.data.id;
                } else {
                    console.warn(`Gagal mencatat pengeluaran untuk ulakan: ${item.nama_item}`);
                }
            }

            const payloadDetail = {
                transaksi_id: newTransaksiId,
                tipe_item: item.tipe_item,
                produk_id: item.produk_id,
                nama_item: item.nama_item,
                qty: item.qty,
                harga_modal_snapshot: item.harga_modal_snapshot,
                harga_jual_snapshot: item.harga_jual_snapshot,
                persentase_komisi: item.persentase_komisi,
                total_komisi_jasa: item.total_komisi_jasa,
                pengeluaran_id: createdPengeluaranId,
                keterangan: item.keterangan
            };

            const resDetail = await fetch(`${directusUrl}/items/detail_transaksi`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify(payloadDetail),
            });
            if (!resDetail.ok) throw new Error("Gagal mencatat rincian item.");
            const dataDetail = await resDetail.json();
            const newDetailId = dataDetail.data.id;

            if (item.tipe_item === "jasa" && item.mekanik_ids.length > 0) {
                const komisiPerOrang = Math.round(item.total_komisi_jasa / item.mekanik_ids.length);

                for (const mekanikId of item.mekanik_ids) {
                    await fetch(`${directusUrl}/items/detail_transaksi_mekanik`, {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({
                            detail_transaksi_id: newDetailId,
                            mekanik_id: mekanikId,
                            nominal_komisi_per_orang: komisiPerOrang,
                        }),
                    });
                }
            }
        }

        // 4. Sukses
        return new Response(JSON.stringify({ success: true, transaksi_id: newTransaksiId }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("API Error: ", error);
        return new Response(JSON.stringify({ success: false, message: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};