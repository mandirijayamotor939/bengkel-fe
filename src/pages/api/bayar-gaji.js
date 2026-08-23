import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }
        
        const body = await request.json();
        const { mekanik_id, nama_mekanik, periode_mulai, periode_selesai, nominal_thp, id_kasbon_pending, deskripsi, sumber_dana } = body;

        // 1. Validasi: Cek Overlap (Irisan) Tanggal
        const cekRiwayat = await getWithAuth(
            `/items/riwayat_penggajian?filter[mekanik_id][_eq]=${mekanik_id}&filter[periode_mulai][_lte]=${periode_selesai}&filter[periode_selesai][_gte]=${periode_mulai}`,
            token
        );

        if (cekRiwayat.data.data && cekRiwayat.data.data.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                message: "DITOLAK: Rentang tanggal ini bertabrakan dengan periode gaji yang sudah dibayarkan sebelumnya!"
            }), { status: 400 });
        }

        // 2. Buat Data Pengeluaran Kas DULU (Jika THP > 0) untuk mendapatkan ID-nya
        const parsedThp = parseInt(nominal_thp, 10) || 0;
        let idPengeluaran = null;
        if (parsedThp > 0) {
            const tanggalWIB = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            const resPengeluaran = await postWithAuth('/items/pengeluaran', {
                tanggal_pengeluaran: tanggalWIB, 
                keterangan: `Pembayaran THP ${nama_mekanik} (${periode_mulai} s.d ${periode_selesai})`,
                nominal: parsedThp,
                kategori: "gaji", 
                sumber_dana: sumber_dana
            }, token);
            
            // Tangkap ID pengeluaran yang baru dibuat
            idPengeluaran = resPengeluaran.data.data.id; 
        }

        // 3. Buat Data Riwayat Penggajian (Sertakan pengeluaran_id)
        await postWithAuth('/items/riwayat_penggajian', {
            mekanik_id: mekanik_id,
            periode_mulai: periode_mulai,
            periode_selesai: periode_selesai,
            nominal_thp: parsedThp,
            deskripsi: deskripsi,
            pengeluaran_id: idPengeluaran // <--- Data dihubungkan di sini
        }, token);

        // 4. Update Status Kasbon menjadi Lunas (Jika ada)
        if (id_kasbon_pending && id_kasbon_pending.length > 0) {
            await patchWithAuth('/items/kasbon_mekanik', {
                keys: id_kasbon_pending,
                data: { status_potong: "lunas_gajian" }
            }, token);
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Pembayaran gaji berhasil diproses dan dicatat!"
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("API Error (Bayar Gaji):", error.response?.data || error.message);
        return new Response(JSON.stringify({
            success: false,
            message: "Terjadi kesalahan pada server saat memproses pembayaran."
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}