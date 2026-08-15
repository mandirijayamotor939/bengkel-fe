import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const { nominal, keterangan, tanggal_input } = body;

        // 1. Validasi Input Dasar
        if (!nominal || nominal <= 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Nominal setoran wajib diisi dan harus lebih dari 0!" 
            }), { status: 400 });
        }

        // 2. Kunci Waktu ke WIB
        let tanggalSetoran = tanggal_input;
        if (!tanggalSetoran) {
            tanggalSetoran = new Date().toLocaleString("en-CA", { 
                timeZone: "Asia/Jakarta" 
            }).split(",")[0];
        }

        // 3. Cari Data Operasional
        const cekOperasional = await getWithAuth(`/items/operasional_harian?filter[tanggal][_eq]=${tanggalSetoran}`, token);
        
        if (!cekOperasional.data.data || cekOperasional.data.data.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `Data operasional untuk tanggal ${tanggalSetoran} belum dibuka/tidak ditemukan. Silakan buka bengkel terlebih dahulu.` 
            }), { status: 400 });
        }

        const dataOperasional = cekOperasional.data.data[0];
        const idOperasional = dataOperasional.id;
        const setoranBankSaatIni = dataOperasional.total_setoran_bank || 0;

        // 4. Catat ke Collection setoran_kas
        await postWithAuth('/items/setoran_kas', {
            tanggal: tanggalSetoran,
            nominal: parseInt(nominal),
            keterangan: keterangan || "Setoran kasir ke bank",
            status_setoran: "Sudah disetor"
        }, token);

        // 5. Update total_setoran_bank 
        const updateSetoranBank = setoranBankSaatIni + parseInt(nominal);
        
        await patchWithAuth(`/items/operasional_harian/${idOperasional}`, {
            total_setoran_bank: updateSetoranBank
        }, token);

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Uang berhasil disetorkan dan saldo kasir telah disesuaikan." 
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("API Error (Tambah Setoran):", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Terjadi kesalahan pada server saat memproses setoran bank." 
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}