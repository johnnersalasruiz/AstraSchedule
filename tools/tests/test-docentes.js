// tools/tests/test-docentes.js
import { pool } from '../../scripts/db.js';
import { obtener_docentes_disponibles } from '../consulta/obtener_docentes_disponibles.js';

async function test() {
    try {
        const franjasEjemplo = await pool.query(`
            SELECT f.id, f.dia, b.codigo as bloque, j.codigo as jornada
            FROM franjas_horarias f
            JOIN bloques_horarios b ON b.id = f.bloque_id
            JOIN jornadas j ON j.id = b.jornada_id
            JOIN periodos_academicos p ON p.id = f.periodo_id
            WHERE p.activo = true
            LIMIT 3;
        `);

        if (franjasEjemplo.rows.length === 0) {
            console.error("No hay franjas en el periodo activo. Ejecuta los seeds primero.");
            return;
        }

        console.log(" Probando obtener_docentes_disponibles...\n");

        for (const franja of franjasEjemplo.rows) {
            const jornada = franja.jornada;
            console.log(`--- Buscando docentes para Franja ID: ${franja.id} (${franja.dia} - ${franja.bloque} - Jornada: ${jornada}) ---`);
            
            const docentes1 = await obtener_docentes_disponibles({
                franja_id: franja.id,
                jornada: jornada,
                excluir_docentes: []
            });
            console.log(` Docentes disponibles (todos): ${docentes1.length} encontrados.`);
            if (docentes1.length > 0) {
                console.log(`   Ejemplo: ${docentes1[0].nombre} (${docentes1[0].tipo}, disp: ${docentes1[0].disponibilidad})`);
                console.log(`   Carga: ${docentes1[0].horas_asignadas}/${docentes1[0].carga_max_horas}h (${docentes1[0].horas_disponibles}h disponibles)`);
            }

            if (docentes1.length > 0) {
                const docenteAExcluir = docentes1[0].id;
                const docentes2 = await obtener_docentes_disponibles({
                    franja_id: franja.id,
                    jornada: jornada,
                    excluir_docentes: [docenteAExcluir]
                });
                console.log(` Docentes disponibles (excluyendo ID ${docenteAExcluir}): ${docentes2.length} encontrados.`);
            }
            
            console.log('');
        }

        const primeraFranja = franjasEjemplo.rows[0];
        if (primeraFranja) {
            const docentesConCarga = await obtener_docentes_disponibles({
                franja_id: primeraFranja.id,
                jornada: primeraFranja.jornada,
                excluir_docentes: []
            });
            
            const docentesConCapacidad = docentesConCarga.filter(d => d.puede_asignarse);
            console.log(` Docentes con al menos 3h disponibles: ${docentesConCapacidad.length} de ${docentesConCarga.length}`);
        }

    } catch (error) {
        console.error(" Error en la prueba:", error);
    } finally {
        await pool.end();
    }
}

test();