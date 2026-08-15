import { getWithAuth, postWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { mekanik_id, nama_mekanik, tanggal, nominal, sumber_dana, keterangan } = body;

        // 1. Validasi Input Dasar
        if (!mekanik_id || !tanggal || !nominal || !sumber_dana) {
            return new Response(JSON.stringify({
                success: false,
                message: "Data Mekanik, Tanggal, Nominal, dan Sumber Dana wajib diisi!"
            }), { status: 400 });
        }
        
        // 2. VALIDASI KEAMANAN: CEK PERIODE GAJI
        const cekGaji = await getWithAuth(`/items/riwayat_penggajian?filter[mekanik_id][_eq]=${mekanik_id}&sort=-periode_selesai&limit=1`, token);

        if (cekGaji.data.data && cekGaji.data.data.length > 0) {
            const gajiTerakhir = cekGaji.data.data[0];
            const tanggalAkhirGaji = gajiTerakhir.periode_selesai;

            if (tanggal <= tanggalAkhirGaji) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `Gaji mekanik sampai tanggal ${tanggalAkhirGaji} sudah dikunci/dibayar. Tidak bisa mundur membuat kasbon di periode tersebut.`
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // 3. Catat Arus Kas Keluar di pengeluaran TERLEBIH DAHULU
        const resPengeluaran = await postWithAuth('/items/pengeluaran', {
            tanggal_pengeluaran: tanggal,
            keterangan: keterangan || `Pencairan Kasbon untuk Mekanik: ${nama_mekanik}`,
            nominal: nominal,
            // Pastikan kamu menambahkan opsi "kasbon" di Dropdown kategori tabel pengeluaran
            kategori: "kasbon", 
            sumber_dana: sumber_dana
        }, token);

        // Tangkap ID pengeluaran yang baru dibuat
        const idPengeluaran = resPengeluaran.data.data.id;

        // 4. Buat Catatan Utang di kasbon_mekanik (Sertakan pengeluaran_id)
        await postWithAuth('/items/kasbon_mekanik', {
            mekanik_id: mekanik_id,
            tanggal: tanggal,
            nominal: nominal,
            sumber_dana: sumber_dana,
            keterangan: keterangan || `Kasbon Mekanik - ${nama_mekanik}`,
            status_potong: "belum_lunas",
            pengeluaran_id: idPengeluaran // <--- Data dihubungkan di sini
        }, token);

        return new Response(JSON.stringify({
            success: true,
            message: "Kasbon berhasil dicatat dan arus kas telah disesuaikan."
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("API Error (Tambah Kasbon):", error.response?.data || error.message);
        return new Response(JSON.stringify({
            success: false,
            message: "Terjadi kesalahan pada server saat mencatat kasbon."
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}