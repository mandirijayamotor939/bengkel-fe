import { api } from "../../lib/api";

export async function GET({ request, cookies }) {
    // 1. Cek Token dari Cookies
    const token = cookies.get("directus_token")?.value;

    if (!token) {
        return new Response(JSON.stringify({ success: false, message: "Akses ditolak! Silakan login ulang." }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Config header untuk setiap request API
    const authConfig = {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    const url = new URL(request.url);

    // 2. Set default tanggal hari ini jika tidak ada parameter
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const startDate = url.searchParams.get("start") || todayStr;
    const endDate = url.searchParams.get("end") || todayStr;

    // Inisialisasi Variabel Kalkulasi
    let omzetCash = 0;
    let omzetQris = 0;
    let pendapatanProduk = 0;
    let modalProdukTerjual = 0;
    let profitProduk = 0;
    let pendapatanJasa = 0;
    let komisiMekanik = 0;
    let profitJasaBengkel = 0;
    let totalBiayaTetap = 0;
    let saldoAwalKas = 0;
    let totalSetoranBank = 0;
    let listPengeluaranCash = [];
    let listPengeluaranBank = [];
    let totalPengeluaranCashSemua = 0;
    let totalPengeluaranBankSemua = 0;
    let rincianKomisiMekanik = {};

    try {
        // 1. Tarik Data Operasional (Saldo Awal & Setoran)
        const resOperasionalRange = await api.get(`/items/operasional_harian?filter[tanggal][_between]=[${startDate},${endDate}]`, authConfig);
        const dataOperasional = resOperasionalRange.data.data || [];

        const operasionalAwal = dataOperasional.find(d => d.tanggal === startDate);
        saldoAwalKas = Number(operasionalAwal?.saldo_awal_kas || 0);

        for (const hari of dataOperasional) {
            totalSetoranBank += Number(hari.total_setoran_bank || 0);
            if (hari.status_buka === "buka") {
                totalBiayaTetap += Number(hari.biaya_tetap_snapshot || 0);
            }
        }

        // 2. Tarik Data Transaksi (Omzet)
        const resTrx = await api.get(`/items/transaksi?filter[tanggal_transaksi][_between]=[${startDate}T00:00:00,${endDate}T23:59:59]&filter[status_nota][_eq]=lunas`, authConfig);
        const semuaTrx = resTrx.data.data || [];

        for (const trx of semuaTrx) {
            if (trx.metode_pembayaran === "cash") omzetCash += Number(trx.total_harga || 0);
            if (trx.metode_pembayaran === "qris") omzetQris += Number(trx.total_harga || 0);
        }

        // 3. Tarik Detail Transaksi Lunas (Profit Produk & Jasa)
        // PERBAIKAN: Tambahkan 'id' ke dalam parameter fields
        const resDetailLunas = await api.get(`/items/detail_transaksi?filter[transaksi_id][tanggal_transaksi][_between]=[${startDate}T00:00:00,${endDate}T23:59:59]&filter[transaksi_id][status_nota][_eq]=lunas&fields=id,tipe_item,qty,harga_modal_snapshot,harga_jual_snapshot,total_komisi_jasa`, authConfig);
        const detailLunas = resDetailLunas.data.data || [];

        // Buat wadah untuk menampung ID detail_transaksi khusus Jasa
        let validDetailJasaIds = [];

        for (const item of detailLunas) {
            const qty = Number(item.qty || 1);
            const modal = Number(item.harga_modal_snapshot || 0);
            const jual = Number(item.harga_jual_snapshot || 0);

            if (item.tipe_item === "sparepart" || item.tipe_item === "ulakan") {
                modalProdukTerjual += modal * qty;
                pendapatanProduk += jual * qty;
                profitProduk += (jual - modal) * qty;
            } else if (item.tipe_item === "jasa") {
                pendapatanJasa += jual * qty;
                const komisi = Number(item.total_komisi_jasa || 0);
                komisiMekanik += komisi;
                profitJasaBengkel += (jual * qty) - komisi;

                // Masukkan ID ke wadah jika item ini adalah Jasa
                if (item.id) validDetailJasaIds.push(item.id);
            }
        }

        // 3.5 Tarik Rincian Komisi per Mekanik
        try {
            // Hanya fetch jika ada transaksi jasa yang valid
            if (validDetailJasaIds.length > 0) {
                const idsString = validDetailJasaIds.join(",");
                // PERBAIKAN: Gunakan filter [_in] berdasarkan ID yang sudah terbukti valid
                const resKomisi = await api.get(`/items/detail_transaksi_mekanik?filter[detail_transaksi_id][_in]=${idsString}&fields=mekanik_id.nama_mekanik,nominal_komisi_per_orang`, authConfig);
                const dataKomisi = resKomisi.data.data || [];

                for (const k of dataKomisi) {
                    const namaMekanik = k.mekanik_id?.nama_mekanik || "Mekanik (Tanpa Nama)";
                    const nomKomisi = Number(k.nominal_komisi_per_orang || 0);
                    rincianKomisiMekanik[namaMekanik] = (rincianKomisiMekanik[namaMekanik] || 0) + nomKomisi;
                }
            }
        } catch (e) {
            console.warn("Gagal menarik rincian komisi:", e.message);
        }
        // 4. Tarik Data Pengeluaran Umum (Gaji, Restok, Operasional)
        const resPengeluaran = await api.get(`/items/pengeluaran?filter[tanggal_pengeluaran][_gte]=${startDate}&filter[tanggal_pengeluaran][_lte]=${endDate}`, authConfig);
        const dataPengeluaran = resPengeluaran.data.data || [];

        for (const out of dataPengeluaran) {
            const nominal = Number(out.nominal || 0);
            const kategori = out.kategori ? out.kategori.toUpperCase() : "LAINNYA";
            const keterangan = out.keterangan ? out.keterangan.trim() : "Tanpa Keterangan";
            const teksPengeluaran = ` - [${kategori}] ${keterangan}`;

            if (out.sumber_dana === "transfer_bank") {
                totalPengeluaranBankSemua += nominal;
                listPengeluaranBank.push({ Keterangan: teksPengeluaran, Nominal: nominal });
            } else {
                totalPengeluaranCashSemua += nominal;
                listPengeluaranCash.push({ Keterangan: teksPengeluaran, Nominal: nominal });
            }
        }

        // // 4.5 Tarik Data Kasbon Khusus
        // try {
        //     const resKasbon = await api.get(`/items/kasbon_mekanik?filter[tanggal][_gte]=${startDate}&filter[tanggal][_lte]=${endDate}&fields=mekanik_id.nama_mekanik,nominal,keterangan,sumber_dana`, authConfig);
        //     const dataKasbon = resKasbon.data.data || [];

        //     for (const kb of dataKasbon) {
        //         const nominal = Number(kb.nominal || 0);
        //         const nama = kb.mekanik_id?.nama_mekanik || "Tanpa Nama";
        //         const ket = kb.keterangan ? kb.keterangan.trim() : "Kasbon";
        //         const teksKasbon = ` - [KASBON] ${nama} (${ket})`;

        //         if (kb.sumber_dana === "transfer_bank") {
        //             totalPengeluaranBankSemua += nominal;
        //             listPengeluaranBank.push({ Keterangan: teksKasbon, Nominal: nominal });
        //         } else {
        //             totalPengeluaranCashSemua += nominal;
        //             listPengeluaranCash.push({ Keterangan: teksKasbon, Nominal: nominal });
        //         }
        //     }
        // } catch (e) {
        //     console.warn("Gagal menarik rincian kasbon:", e.message);
        // }

        // 5. Tarik Data Absensi
        let uniqueMekanikHadir = [];
        try {
            const resAbsensi = await api.get(`/items/absensi_mekanik?filter[tanggal][_gte]=${startDate}&filter[tanggal][_lte]=${endDate}&filter[status][_eq]=hadir&fields=mekanik_id.nama_mekanik`, authConfig);
            uniqueMekanikHadir = [...new Set((resAbsensi.data.data || []).map(a => a.mekanik_id?.nama_mekanik).filter(Boolean))];
        } catch (e) {
            console.warn("Tabel absensi error:", e.message);
        }

        // 6. Kalkulasi Akhir
        const totalOmzet = omzetCash + omzetQris;
        const totalPendapatanKotor = pendapatanProduk + pendapatanJasa;
        const totalProfitGabungan = profitProduk + profitJasaBengkel;
        const profitBersih = totalProfitGabungan - totalBiayaTetap;
        const sisaCashSebelumSetor = saldoAwalKas + omzetCash - totalPengeluaranCashSemua;
        const sisaKasBuatBesok = sisaCashSebelumSetor - totalSetoranBank;

        // 7. Susun Format Excel
        let excelExportData = [
            { Keterangan: "=== RINCIAN OMZET ===", Nominal: "" },
            { Keterangan: "Omzet Cash", Nominal: omzetCash },
            { Keterangan: "Omzet QRIS/Transfer", Nominal: omzetQris },
            { Keterangan: "TOTAL OMZET KESELURUHAN", Nominal: totalOmzet },
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== PENDAPATAN & JASA ===", Nominal: "" },
            { Keterangan: "Total Pendapatan Part & Ulakan", Nominal: pendapatanProduk },
            { Keterangan: "Total Pendapatan Jasa", Nominal: pendapatanJasa },
            { Keterangan: "TOTAL PENDAPATAN KOTOR", Nominal: totalPendapatanKotor },
            { Keterangan: "Total Uang Komisi Mekanik", Nominal: komisiMekanik }
        ];

        // Looping Rincian Komisi Mekanik
        if (Object.keys(rincianKomisiMekanik).length > 0) {
            for (const [nama, nom] of Object.entries(rincianKomisiMekanik)) {
                excelExportData.push({ Keterangan: `   -> Hak Komisi: ${nama}`, Nominal: nom });
            }
        } else {
            excelExportData.push({ Keterangan: `   -> Tidak ada pembagian komisi`, Nominal: 0 });
        }

        excelExportData.push(
            { Keterangan: "Profit Jasa untuk Bengkel", Nominal: profitJasaBengkel },
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== RINCIAN SPAREPART ===", Nominal: "" },
            { Keterangan: "Modal Sparepart & Ulakan", Nominal: modalProdukTerjual },
            { Keterangan: "Penjualan Sparepart & Ulakan", Nominal: pendapatanProduk },
            { Keterangan: "Profit Sparepart", Nominal: profitProduk },
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== KEUNTUNGAN ===", Nominal: "" },
            { Keterangan: "Total Profit (Sparepart + Jasa Bengkel)", Nominal: totalProfitGabungan },
            { Keterangan: "Total Pengeluaran Fix Harian", Nominal: totalBiayaTetap },
            { Keterangan: "PROFIT BERSIH (Profit - Pengeluaran Fix)", Nominal: profitBersih },
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== BELANJA / PENGELUARAN CASH ===", Nominal: "" }
        );

        if (listPengeluaranCash.length > 0) {
            excelExportData = excelExportData.concat(listPengeluaranCash);
        } else {
            excelExportData.push({ Keterangan: " - Tidak ada pengeluaran cash", Nominal: 0 });
        }
        excelExportData.push({ Keterangan: "TOTAL PENGELUARAN CASH", Nominal: totalPengeluaranCashSemua });

        excelExportData.push(
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== PENGELUARAN BANK ===", Nominal: "" }
        );

        if (listPengeluaranBank.length > 0) {
            excelExportData = excelExportData.concat(listPengeluaranBank);
        } else {
            excelExportData.push({ Keterangan: " - Tidak ada pengeluaran bank", Nominal: 0 });
        }
        excelExportData.push({ Keterangan: "TOTAL PENGELUARAN VIA BANK", Nominal: totalPengeluaranBankSemua });

        excelExportData.push(
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== ARUS KAS FISIK (LACI) & SETORAN ===", Nominal: "" },
            { Keterangan: "Saldo Awal Kasir", Nominal: saldoAwalKas },
            { Keterangan: "Omzet Cash Masuk", Nominal: omzetCash },
            { Keterangan: "Total Potongan Pengeluaran Cash", Nominal: totalPengeluaranCashSemua },
            { Keterangan: "SISA CASH FISIK (SEBELUM SETOR)", Nominal: sisaCashSebelumSetor },
            { Keterangan: "Disetorkan ke Bank (Setoran)", Nominal: totalSetoranBank },
            { Keterangan: "SISA KAS FISIK UNTUK BESOK", Nominal: sisaKasBuatBesok },
            { Keterangan: "", Nominal: "" },
            { Keterangan: "=== DAFTAR HADIR ===", Nominal: "" }
        );

        if (uniqueMekanikHadir.length > 0) {
            uniqueMekanikHadir.forEach(nama => {
                excelExportData.push({ Keterangan: ` - ${nama}`, Nominal: "Hadir" });
            });
        } else {
            excelExportData.push({ Keterangan: " - Tidak ada data absen mekanik", Nominal: "-" });
        }

        return new Response(JSON.stringify({ success: true, data: excelExportData }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}