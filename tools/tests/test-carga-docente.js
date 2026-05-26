// tools/tests/test-carga-docente.js
import { pool } from '../../scripts/db.js';
import { obtener_carga_docente } from '../consulta/obtener_carga_docente.js';

async function test() {
    try {
        console.log("📋 Probando obtener_carga_docente...\n");

        // Probar con diferentes docentes
        const docentesTest = [1, 3, 10];

        for (const docente_id of docentesTest) {
            console.log(`--- Docente ID: ${docente_id} ---`);
            const carga = await obtener_carga_docente({ docente_id });
            
            console.log(`   Nombre: ${carga.docente_nombre}`);
            console.log(`   Tipo: ${carga.docente_tipo} (máx: ${carga.carga_max_horas}h)`);
            console.log(`   Horas asignadas: ${carga.horas_asignadas}h`);
            console.log(`   Horas disponibles: ${carga.horas_disponibles}h`);
            console.log(`   Número de clases: ${carga.numero_clases}`);
            console.log(`   Porcentaje de uso: ${carga.porcentaje_uso}%`);
            console.log(`   ¿Puede asignar más? ${carga.puede_asignar_mas ? '✅ Sí' : '❌ No'}`);
            console.log('');
        }

        // Probar con un docente que no existe (debe dar error)
        console.log("--- Prueba de error: Docente inexistente ---");
        try {
            await obtener_carga_docente({ docente_id: 999 });
        } catch (error) {
            console.log(`    Error capturado correctamente: ${error.message}`);
        }

        console.log("\n Prueba completada!");

    } catch (error) {
        console.error(" Error en la prueba:", error.message);
    } finally {
        await pool.end();
    }
}

test();