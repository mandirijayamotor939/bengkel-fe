import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api";

export async function POST({ request, cookies }) {
    try {
        const token = cookies.get("directus_token")?.value;
        if (!token) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        const dataAbsensi = body.absensi; 

        if (!dataAbsensi || dataAbsensi.length === 0) {
            return new Response(JSON.stringify({ success: false, message: "Data absensi kosong." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const tanggalForm = dataAbsensi[0].tanggal;

        // 1. CEK KE DATABASE
        const resCek = await getWithAuth(`/items/absensi_mekanik?filter[tanggal][_eq]=${tanggalForm}`, token);
        const dataSudahAda = resCek.data.data || [];

        const dataBaruDibuat = [];
        const dataDiperbarui = [];

        // 2. LOGIKA PILAH DATA (Insert vs Update)
        for (const input of dataAbsensi) {
            const absenDb = dataSudahAda.find(a => {
                const idMekanikDb = typeof a.mekanik_id === 'object' ? a.mekanik_id.id : a.mekanik_id;
                return parseInt(idMekanikDb) === parseInt(input.mekanik_id);
            });

            if (!absenDb) {
                dataBaruDibuat.push(input);
            } else {
                if (absenDb.status !== input.status) {
                    dataDiperbarui.push({
                        id: absenDb.id, 
                        status: input.status
                    });
                }
            }
        }

        if (dataBaruDibuat.length === 0 && dataDiperbarui.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `Tidak ada perubahan. Semua data sudah sesuai dengan database.` 
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 3. EKSEKUSI DATABASE
        if (dataBaruDibuat.length > 0) {
            await postWithAuth("/items/absensi_mekanik", dataBaruDibuat, token);
        }

        if (dataDiperbarui.length > 0) {
            await patchWithAuth("/items/absensi_mekanik", dataDiperbarui, token);
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Sukses! ${dataBaruDibuat.length} absen baru disimpan, ${dataDiperbarui.length} absen dikoreksi.` 
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Error Simpan Absensi:", error.response?.data || error.message);
        return new Response(JSON.stringify({ 
            success: false, 
            message: error.response?.data?.errors?.[0]?.message || "Gagal menyimpan data ke database." 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}