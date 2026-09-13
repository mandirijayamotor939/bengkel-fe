export const POST = async ({ request, cookies }) => {
    const token = cookies.get("directus_token")?.value;
    const directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055";
    const adminToken = import.meta.env.DIRECTUS_ADMIN_TOKEN;

    if (!token) {
        return new Response(JSON.stringify({ success: false, message: "Sesi tidak valid." }), { status: 401 });
    }

    try {
        const body = await request.json();
        const { payloadTransaksi, keranjang, metodePembayaran, statusPembayaran, waktuSekarang } = body;

        const authHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
        const adminHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` };

        // 1. Ambil ID User yang sedang login dari Directus
        const resUser = await fetch(`${directusUrl}/users/me`, { headers: authHeaders });
        let currentUserId = null;
        if (resUser.ok) {
            const userData = await resUser.json();
            currentUserId = userData.data.id;
        }

        // 2. Sisipkan ID tersebut ke payload transaksi utama
        payloadTransaksi.user_created = currentUserId;

        // Hitung Modal & Profit di Server
        let totalProfitTransaksi = 0;
        const keranjangTerproses = [];

        for (const item of keranjang) {
            let itemModal = item.harga_modal_snapshot || 0;
            let itemProfit = 0;

            if (item.tipe_item === "sparepart" && item.produk_id) {
                const resProd = await fetch(`${directusUrl}/items/produk/${item.produk_id}?fields=harga_modal`, { headers: adminHeaders });
                if (resProd.ok) {
                    const dataProd = await resProd.json();
                    itemModal = dataProd.data?.harga_modal || 0;
                }
                itemProfit = (item.harga_jual_snapshot - itemModal) * item.qty;
            } else if (item.tipe_item === "ulakan") {
                itemModal = item.harga_modal_snapshot;
                itemProfit = (item.harga_jual_snapshot - itemModal) * item.qty;
            } else if (item.tipe_item === "jasa") {
                itemProfit = (item.harga_jual_snapshot * item.qty) - item.total_komisi_jasa;
            }

            totalProfitTransaksi += itemProfit;
            keranjangTerproses.push({ ...item, harga_modal_snapshot: itemModal });
        }

        // Simpan Transaksi Induk
        payloadTransaksi.total_profit = totalProfitTransaksi;
        const resTrx = await fetch(`${directusUrl}/items/transaksi`, {
            method: "POST", headers: authHeaders, body: JSON.stringify(payloadTransaksi),
        });

        if (!resTrx.ok) throw new Error("Gagal membuat nota.");
        const dataTrx = await resTrx.json();
        const newTransaksiId = dataTrx.data.id;

        // Looping Keranjang Terproses ke Database
        for (const item of keranjangTerproses) {
            let createdPengeluaranId = null;

            if (item.tipe_item === "ulakan") {
                const nominalPengeluaran = item.harga_modal_snapshot * item.qty;
                const sumberDana = metodePembayaran === "cash" ? "laci_kasir" : "transfer_bank";

                const resPengeluaran = await fetch(`${directusUrl}/items/pengeluaran`, {
                    method: "POST", headers: authHeaders,
                    body: JSON.stringify({
                        tanggal_pengeluaran: waktuSekarang.split("T")[0],
                        keterangan: `Beli Ulakan: ${item.nama_item} (Ref: #${newTransaksiId})`,
                        nominal: nominalPengeluaran,
                        kategori: "aset/ulakan",
                        sumber_dana: sumberDana,
                        modal_terjual: statusPembayaran === "lunas" ? nominalPengeluaran : 0
                    }),
                });

                if (resPengeluaran.ok) {
                    createdPengeluaranId = (await resPengeluaran.json()).data.id;
                }
            }

            const resDetail = await fetch(`${directusUrl}/items/detail_transaksi`, {
                method: "POST", headers: authHeaders,
                body: JSON.stringify({
                    transaksi_id: newTransaksiId,
                    user_created: currentUserId,
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
                }),
            });

            const newDetailId = (await resDetail.json()).data.id;

            if (item.tipe_item === "jasa" && item.mekanik_ids.length > 0) {
                const komisi = Math.round(item.total_komisi_jasa / item.mekanik_ids.length);
                for (const mekanikId of item.mekanik_ids) {
                    await fetch(`${directusUrl}/items/detail_transaksi_mekanik`, {
                        method: "POST", headers: authHeaders,
                        body: JSON.stringify({ detail_transaksi_id: newDetailId, mekanik_id: mekanikId, nominal_komisi_per_orang: komisi }),
                    });
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
    }
};