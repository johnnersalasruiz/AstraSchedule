// tools/tests/test-aprobar-horario.js
import { pool } from '../../scripts/db.js';
import { aprobar_horario } from '../gestion/aprobar_horario.js';
import { asignar_clase } from '../generacion/asignar_clase.js';

async function test() {
    try {
        console.log(' Probando aprobar_horario...\n');

        // 1. Crear una asignación en estado 'propuesto'
        console.log('--- Creando asignación en estado propuesto ---');
        
        const datos = await pool.query(`
            SELECT g.id AS grupo_id, d.id AS docente_id, s.id AS salon_id, f.id AS franja_id
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.activo = true
            JOIN salones s ON s.disponible = true
            JOIN franjas_horarias f ON f.periodo_id = (SELECT id FROM periodos_academicos WHERE activo = true)
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE m.codigo = 'IS-101'
              AND g.jornada_id = b.jornada_id
              AND (d.disponibilidad = 'Ambas' OR (d.disponibilidad = 'Nocturna' AND b.jornada_id = 2))
              AND NOT EXISTS (SELECT 1 FROM horario_asignado ha WHERE ha.docente_id = d.id AND ha.franja_id = f.id)
            LIMIT 1
        `);

        if (datos.rows.length === 0) {
            console.error(' No hay datos');
            return;
        }

        const asignacion = await asignar_clase({
            grupo_id: datos.rows[0].grupo_id,
            docente_id: datos.rows[0].docente_id,
            aula_id: datos.rows[0].salon_id,
            franja_id: datos.rows[0].franja_id,
            es_definitiva: false
        });

        console.log(` Asignación creada: ID ${asignacion.id} (${asignacion.estado})\n`);

        // 2. Aprobar el horario
        console.log('--- Aprobando horario ---');
        const resultado = await aprobar_horario({
            horario_id: asignacion.id,
            comentarios: 'Horario aprobado por director'
        });

        console.log(`   Success: ${resultado.success}`);
        console.log(`   Estado: ${resultado.estado_anterior} → ${resultado.estado_nuevo}`);
        console.log(`   Mensaje: ${resultado.mensaje}\n`);

        // 3. Verificar estado en BD
        console.log('--- Verificando estado ---');
        const estadoRes = await pool.query(`
            SELECT estado FROM horario_asignado WHERE id = $1
        `, [asignacion.id]);
        console.log(`   Estado actual: ${estadoRes.rows[0].estado} (debe ser 'confirmado')\n`);

        // 4. Limpiar
        console.log('--- Limpiando ---');
        await pool.query(`DELETE FROM conflictos_detectados WHERE horario_id = $1`, [asignacion.id]);
        await pool.query(`DELETE FROM horario_asignado WHERE id = $1`, [asignacion.id]);
        console.log(` Asignación eliminada`);

        console.log('\n  Prueba completada!');
    } catch (error) {
        console.error(' Error:', error.message);
    } finally {
        await pool.end();
    }
}

test();