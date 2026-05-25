// tools/tests/test-aulas.js
import { pool } from '../../scripts/db.js';
import { obtener_aulas_disponibles } from '../consulta/obtener_aulas_disponibles.js';

async function test() {
    try {
        const franjasEjemplo = await pool.query(`
            SELECT f.id, f.dia, b.codigo as bloque
            FROM franjas_horarias f
            JOIN bloques_horarios b ON b.id = f.bloque_id
            JOIN periodos_academicos p ON p.id = f.periodo_id
            WHERE p.activo = true
            LIMIT 5;
        `);

        if (franjasEjemplo.rows.length === 0) {
            console.error("No hay franjas en el periodo activo. Ejecuta los seeds primero.");
            return;
        }

        console.log("📋 Probando obtener_aulas_disponibles...\n");

        for (const franja of franjasEjemplo.rows) {
            console.log(`--- Buscando aulas para Franja ID: ${franja.id} (${franja.dia} - ${franja.bloque}) ---`);
            
            const aulas1 = await obtener_aulas_disponibles({
                franja_id: franja.id,
                cupo_minimo: 30,
                tipo_aula: 'cualquiera'
            });
            console.log(`✅ Tipo 'cualquiera', cupo >=30: ${aulas1.length} aulas encontradas.`);
            if (aulas1.length > 0) {
                console.log(`   Ejemplo: ${aulas1[0].codigo} (Cap: ${aulas1[0].capacidad}, Tipo: ${aulas1[0].tipo})`);
            }

            const aulas2 = await obtener_aulas_disponibles({
                franja_id: franja.id,
                cupo_minimo: 25,
                tipo_aula: 'laboratorio'
            });
            console.log(` Tipo 'laboratorio', cupo >=25: ${aulas2.length} aulas encontradas.`);
            if (aulas2.length > 0) {
                console.log(`   Ejemplo: ${aulas2[0].codigo} (Cap: ${aulas2[0].capacidad}, Tipo: ${aulas2[0].tipo})`);
            }
            console.log('');
        }

    } catch (error) {
        console.error(" Error en la prueba:", error);
    } finally {
        await pool.end();
    }
}

test();