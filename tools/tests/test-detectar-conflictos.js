// tools/tests/test-detectar-conflictos.js
import { pool } from '../../scripts/db.js';
import { detectar_conflictos } from '../generacion/detectar_conflictos.js';
import { asignar_clase } from '../generacion/asignar_clase.js';

async function test() {
    try {
        console.log(' Probando detectar_conflictos...\n');

        // Limpiar datos previos
        await pool.query(`DELETE FROM horario_asignado`);
        await pool.query(`DELETE FROM conflictos_detectados`);
        console.log(' Datos limpiados\n');

        // 1. Crear asignaciones con DIFERENTES docentes o franjas
        console.log('--- Creando asignaciones de prueba ---');
        
        // Primera asignación: Docente 3 (Nocturna) en franja 56
        const datos1 = await pool.query(`
            SELECT g.id AS grupo_id, d.id AS docente_id, s.id AS salon_id, f.id AS franja_id
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.activo = true
            JOIN salones s ON s.disponible = true
            JOIN franjas_horarias f ON f.periodo_id = (SELECT id FROM periodos_academicos WHERE activo = true)
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE m.codigo = 'IS-101' 
              AND g.jornada_id = b.jornada_id
              AND d.id = 3
              AND f.id = 56
              AND NOT EXISTS (SELECT 1 FROM horario_asignado ha WHERE ha.docente_id = d.id AND ha.franja_id = f.id)
            LIMIT 1
        `);

        if (datos1.rows.length > 0) {
            const row = datos1.rows[0];
            const resultado = await asignar_clase({
                grupo_id: row.grupo_id,
                docente_id: row.docente_id,
                aula_id: row.salon_id,
                franja_id: row.franja_id,
                es_definitiva: false
            });
            console.log(`    Asignación 1: ID ${resultado.id} (docente ${row.docente_id}, franja ${row.franja_id})`);
        }

        // Segunda asignación: Docente 10 (Ambas) en franja 41 (D1 - Diurna)
        const datos2 = await pool.query(`
            SELECT g.id AS grupo_id, d.id AS docente_id, s.id AS salon_id, f.id AS franja_id
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.activo = true
            JOIN salones s ON s.disponible = true
            JOIN franjas_horarias f ON f.periodo_id = (SELECT id FROM periodos_academicos WHERE activo = true)
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE m.codigo = 'IS-101' 
              AND g.jornada_id = b.jornada_id
              AND d.id = 10
              AND f.id = 41
              AND NOT EXISTS (SELECT 1 FROM horario_asignado ha WHERE ha.docente_id = d.id AND ha.franja_id = f.id)
            LIMIT 1
        `);

        if (datos2.rows.length > 0) {
            const row = datos2.rows[0];
            const resultado = await asignar_clase({
                grupo_id: row.grupo_id,
                docente_id: row.docente_id,
                aula_id: row.salon_id,
                franja_id: row.franja_id,
                es_definitiva: false
            });
            console.log(`    Asignación 2: ID ${resultado.id} (docente ${row.docente_id}, franja ${row.franja_id})`);
        }

        console.log(`\n Asignaciones creadas\n`);

        // 2. Detectar conflictos
        console.log('--- Detectando conflictos ---');
        const resultado = await detectar_conflictos({});
        
        console.log(`Total conflictos: ${resultado.total_conflictos}`);
        console.log(`Resumen:`, resultado.resumen);
        
        if (resultado.conflictos && resultado.conflictos.length > 0) {
            console.log('\nConflictos encontrados:');
            resultado.conflictos.forEach((c, i) => {
                console.log(`   ${i + 1}. ${c.tipo}: ${c.descripcion.substring(0, 80)}...`);
            });
        }
        console.log('');

        // 3. Limpiar
        console.log('--- Limpiando ---');
        await pool.query(`DELETE FROM horario_asignado`);
        await pool.query(`DELETE FROM conflictos_detectados`);
        console.log(' Datos limpiados');

        console.log('\n Prueba completada!');
    } catch (error) {
        console.error(' Error:', error.message);
    } finally {
        await pool.end();
    }
}

test();