// tools/tests/test-registrar-rechazo-docente.js
import { pool } from '../../scripts/db.js';
import { registrar_rechazo_docente } from '../gestion/registrar_rechazo_docente.js';
import { asignar_clase } from '../generacion/asignar_clase.js';

async function test() {
    try {
        console.log(' Probando registrar_rechazo_docente...\n');

        // 1. Crear una asignación en estado 'propuesto'
        console.log('--- Creando asignación en estado propuesto ---');
        
        const datos = await pool.query(`
            SELECT 
                g.id AS grupo_id,
                d.id AS docente_id,
                s.id AS salon_id,
                f.id AS franja_id,
                m.codigo AS materia_codigo,
                g.numero AS grupo_numero,
                d.nombre AS docente_nombre
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.activo = true
            JOIN salones s ON s.disponible = true
            JOIN franjas_horarias f ON f.periodo_id = (SELECT id FROM periodos_academicos WHERE activo = true)
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE m.codigo = 'IS-101'
              AND g.jornada_id = b.jornada_id
              AND (d.disponibilidad = 'Ambas' OR (d.disponibilidad = 'Nocturna' AND b.jornada_id = 2))
              AND NOT EXISTS (
                  SELECT 1 FROM horario_asignado ha 
                  WHERE ha.docente_id = d.id AND ha.franja_id = f.id AND ha.estado != 'cancelado'
              )
            LIMIT 1
        `);

        if (datos.rows.length === 0) {
            console.error(' No hay datos para crear asignación');
            return;
        }

        const { grupo_id, docente_id, salon_id, franja_id, materia_codigo, grupo_numero, docente_nombre } = datos.rows[0];

        const asignacion = await asignar_clase({
            grupo_id: grupo_id,
            docente_id: docente_id,
            aula_id: salon_id,
            franja_id: franja_id,
            es_definitiva: false
        });

        console.log(`   Asignación creada: ID ${asignacion.id} (${asignacion.estado})`);
        console.log(`   Materia: ${materia_codigo} - Grupo ${grupo_numero}`);
        console.log(`   Docente: ${docente_nombre}\n`);

        // 2. Registrar rechazo del docente
        console.log('--- Registrando rechazo del docente ---');
        const rechazo = await registrar_rechazo_docente({
            horario_id: asignacion.id,
            motivo: 'Conflicto de horario con otra asignación'
        });

        console.log(`   Success: ${rechazo.success}`);
        console.log(`   Estado: ${rechazo.estado_anterior} → ${rechazo.estado_nuevo}`);
        console.log(`   Mensaje: ${rechazo.mensaje}`);
        console.log(`   Docente: ${rechazo.docente}`);
        console.log(`   Materia: ${rechazo.materia}\n`);

        // 3. Verificar estado en BD
        console.log('--- Verificando estado en BD ---');
        const estadoRes = await pool.query(`
            SELECT estado FROM horario_asignado WHERE id = $1
        `, [asignacion.id]);
        console.log(`   Estado actual: ${estadoRes.rows[0].estado} (debe ser 'cancelado')\n`);

        // 4. Verificar que se registró en conflictos_detectados
        console.log('--- Verificando registro en conflictos ---');
        const conflictosRes = await pool.query(`
            SELECT tipo, descripcion FROM conflictos_detectados WHERE horario_id = $1
        `, [asignacion.id]);
        
        if (conflictosRes.rows.length > 0) {
            console.log(`      Registro encontrado:`);
            console.log(`      Tipo: ${conflictosRes.rows[0].tipo}`);
            console.log(`      Descripción: ${conflictosRes.rows[0].descripcion.substring(0, 100)}...`);
        } else {
            console.log(`    No se encontró registro en conflictos_detectados`);
        }
        console.log('');

        // 5. Intentar rechazar nuevamente (debe fallar)
        console.log('--- Intentar rechazar nuevamente (debe fallar) ---');
        try {
            await registrar_rechazo_docente({ horario_id: asignacion.id });
        } catch (error) {
            console.log(`    Error capturado: ${error.message}\n`);
        }

        // 6. Limpiar
        console.log('--- Limpiando ---');
        await pool.query(`DELETE FROM conflictos_detectados WHERE horario_id = $1`, [asignacion.id]);
        await pool.query(`DELETE FROM horario_asignado WHERE id = $1`, [asignacion.id]);
        console.log(` Asignación eliminada`);

        console.log('\n Prueba completada!');
    } catch (error) {
        console.error(' Error:', error.message);
    } finally {
        await pool.end();
    }
}

test();