// tools/tests/test-solicitar-aprobacion.js
import { pool } from '../../scripts/db.js';
import { solicitar_aprobacion } from '../gestion/solicitar_aprobacion.js';

async function test() {
    try {
        console.log(' Probando solicitar_aprobacion...\n');

        // 1. Crear una asignación de prueba CON FILTROS CORRECTOS
        console.log('--- Creando asignación de prueba ---');
        
        const datos = await pool.query(`
            SELECT 
                g.id AS grupo_id,
                d.id AS docente_id,
                s.id AS salon_id,
                f.id AS franja_id,
                m.codigo AS materia_codigo,
                g.jornada_id AS grupo_jornada,
                b.jornada_id AS franja_jornada,
                d.disponibilidad AS docente_disp
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.activo = true
            JOIN salones s ON s.disponible = true
            JOIN franjas_horarias f ON f.periodo_id = (SELECT id FROM periodos_academicos WHERE activo = true)
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE m.codigo = 'IS-101'
              AND g.jornada_id = b.jornada_id  -- Grupo y franja misma jornada
              AND (
                  d.disponibilidad = 'Ambas' 
                  OR (d.disponibilidad = 'Diurna' AND b.jornada_id = 1)
                  OR (d.disponibilidad = 'Nocturna' AND b.jornada_id = 2)
              )  -- Disponibilidad compatible con jornada de la franja
            LIMIT 1
        `);

        if (datos.rows.length === 0) {
            console.error(' No hay datos para crear asignación');
            console.log('   Verifica que existan docentes con disponibilidad compatible');
            return;
        }

        const { grupo_id, docente_id, salon_id, franja_id, materia_codigo, docente_disp, franja_jornada } = datos.rows[0];

        console.log(`   Docente ID ${docente_id} (${docente_disp})`);
        console.log(`   Franja ID ${franja_id} (jornada: ${franja_jornada === 1 ? 'Diurna' : 'Nocturna'})`);
        console.log(`   Compatible:  Sí`);

        // Insertar asignación de prueba
        const insertRes = await pool.query(`
            INSERT INTO horario_asignado (grupo_id, docente_id, salon_id, franja_id, estado)
            VALUES ($1, $2, $3, $4, 'propuesto')
            RETURNING id
        `, [grupo_id, docente_id, salon_id, franja_id]);

        const horario_id = insertRes.rows[0].id;
        console.log(` Asignación creada con ID: ${horario_id}\n`);

        // 2. Solicitar aprobación
        console.log('--- Solicitando aprobación ---');
        const resultado = await solicitar_aprobacion({
            horario_id: horario_id,
            comentarios: 'Esta asignación cumple con todos los requisitos'
        });

        console.log(` Success: ${resultado.success}`);
        console.log(`   Estado actual: ${resultado.estado_actual}`);
        console.log(`   Mensaje: ${resultado.mensaje}`);
        console.log(`   Notificación: ${resultado.notificacion_enviada ? '✅ Enviada' : '❌'}`);
        console.log('');

        // 3. Verificar que el estado NO cambió
        console.log('--- Verificando estado en BD ---');
        const estadoRes = await pool.query(`
            SELECT estado FROM horario_asignado WHERE id = $1
        `, [horario_id]);
        console.log(`   Estado actual: ${estadoRes.rows[0].estado} (debe ser 'propuesto')\n`);

        // 4. Limpiar
        console.log('--- Limpiando ---');
        await pool.query(`DELETE FROM conflictos_detectados WHERE horario_id = $1`, [horario_id]);
        await pool.query(`DELETE FROM horario_asignado WHERE id = $1`, [horario_id]);
        console.log(` Asignación eliminada`);

        console.log('\n Prueba completada!');
    } catch (error) {
        console.error(' Error:', error.message);
    } finally {
        await pool.end();
    }
}

test();