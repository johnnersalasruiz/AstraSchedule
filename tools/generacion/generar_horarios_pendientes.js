// tools/generacion/generar_horarios_pendientes.js
import { pool } from '../../scripts/db.js';
import { listar_grupos_sin_horario } from '../consulta/listar_grupos_sin_horario.js';
import { asignar_clase } from './asignar_clase.js';
import { notificar_docente, notificar_director } from '../notificaciones/index.js';

// Función auxiliar: obtener todas las franjas del periodo activo para una jornada
async function obtenerFranjasPorJornada(jornada_id) {
    const res = await pool.query(`
    SELECT f.id, b.codigo, f.dia, b.hora_inicio, b.hora_fin
    FROM franjas_horarias f
    JOIN bloques_horarios b ON b.id = f.bloque_id
    JOIN periodos_academicos p ON p.id = f.periodo_id AND p.activo = true
    WHERE b.jornada_id = $1
    ORDER BY f.id
  `, [jornada_id]);
    return res.rows;
}

// Buscar docente disponible en una franja, excluyendo ciertos IDs
async function buscarDocenteDisponible(franja_id, docentesExcluidos = []) {
    let query = `
    SELECT d.id, d.nombre
    FROM docentes d
    WHERE d.activo = true
      AND EXISTS (SELECT 1 FROM disponibilidad_docente dd WHERE dd.docente_id = d.id AND dd.franja_id = $1)
  `;
    const params = [franja_id];
    if (docentesExcluidos.length > 0) {
        const placeholders = docentesExcluidos.map((_, i) => `$${i + 2}`).join(',');
        query += ` AND d.id NOT IN (${placeholders})`;
        params.push(...docentesExcluidos);
    }
    query += ` LIMIT 1`;
    const res = await pool.query(query, params);
    return res.rows[0] || null;
}

// Buscar aula disponible en una franja
async function buscarAulaDisponible(capacidad_min, tipo_aula_requerida, franja_id) {
    const query = `
    SELECT s.id
    FROM salones s
    WHERE s.disponible = true
      AND s.capacidad >= $1
      AND (s.tipo = $2 OR $2 = 'cualquiera')
      AND NOT EXISTS (
        SELECT 1 FROM horario_asignado h
        WHERE h.salon_id = s.id AND h.franja_id = $3 AND h.estado <> 'cancelado'
      )
    LIMIT 1
  `;
    const res = await pool.query(query, [capacidad_min, tipo_aula_requerida, franja_id]);
    return res.rows[0] || null;
}

export async function generar_horarios_pendientes({ programa_id, jornada, modalidad, sede = null }) {
    console.log(`🚀 Iniciando generación para: ${programa_id}, ${jornada}, ${modalidad}, sede=${sede}`);

    // 1. Obtener grupos sin horario (todos los semestres)
    // Nota: listar_grupos_sin_horario debe devolver jornada_id y tipo_aula_requerida
    const grupos = await listar_grupos_sin_horario({
        programa_id,
        semestre: Array.from({ length: 12 }, (_, i) => i + 1),
        jornada,
        modalidad,
        sede
    });

    console.log(`📊 Grupos sin horario: ${grupos.length}`);
    if (grupos.length === 0) {
        return { mensaje: 'No hay grupos pendientes.', asignaciones: [] };
    }

    // 2. Obtener la jornada_id a partir del primer grupo (todos deberían tener la misma)
    // Si por alguna razón no viene, forzar diurna (1) como fallback
    const jornada_id = grupos[0]?.jornada_id || 1;
    const todasLasFranjas = await obtenerFranjasPorJornada(jornada_id);
    console.log(`📅 Franjas encontradas para jornada ${jornada_id}: ${todasLasFranjas.map(f => f.id).join(', ')}`);

    if (todasLasFranjas.length === 0) {
        return { mensaje: `No hay franjas horarias para la jornada especificada.`, asignaciones: [] };
    }

    const resultados = [];
    const franjasUsadas = new Set();   // IDs de franjas ya asignadas
    const docentesUsados = new Set();  // IDs de docentes ya asignados

    for (const grupo of grupos) {
        let exito = false;
        // Recorrer franjas en orden (no usar las ya usadas)
        for (const franja of todasLasFranjas) {
            if (franjasUsadas.has(franja.id)) continue;

            const docente = await buscarDocenteDisponible(franja.id, [...docentesUsados]);
            if (!docente) continue;

            const aula = await buscarAulaDisponible(grupo.cupo_max, grupo.tipo_aula_requerida, franja.id);
            if (!aula) continue;

            // Intentar asignar la clase
            try {
                const asignacion = await asignar_clase({
                    grupo_id: grupo.id,
                    docente_id: docente.id,
                    aula_id: aula.id,
                    franja_id: franja.id,
                    es_definitiva: false
                });
                exito = true;
                resultados.push({
                    grupo_id: grupo.id,
                    estado: 'asignado',
                    horario: {
                        dia: franja.dia,
                        hora_inicio: franja.hora_inicio,
                        hora_fin: franja.hora_fin,
                        franja_id: franja.id,
                        aula_id: aula.id,
                        docente_sugerido: docente
                    },
                    docente_id: docente.id,
                    salon_id: aula.id,
                    asignacion_id: asignacion.id
                });
                franjasUsadas.add(franja.id);
                docentesUsados.add(docente.id);
                // Notificar al docente
                await notificar_docente({
                    docente_id: docente.id,
                    asunto: 'Nueva asignación de horario',
                    mensaje: `Se te ha asignado el grupo ${grupo.numero} de la materia ${grupo.materia_codigo} en ${franja.dia} de ${franja.hora_inicio} a ${franja.hora_fin}. Por favor revisa y confirma.`
                });
                break; // grupo asignado, pasar al siguiente grupo
            } catch (error) {
                console.error(`❌ Error asignando grupo ${grupo.id} en franja ${franja.id}:`, error.message);
                // Si el error es por docente solapado, agregarlo a excluidos y reintentar en otra franja
                if (error.message.includes('SOLAPAMIENTO_DOCENTE')) {
                    const match = error.message.match(/docente (\d+)/);
                    if (match) docentesUsados.add(parseInt(match[1]));
                }
                // Si es por otro conflicto, simplemente continuar con la siguiente franja
            }
        } // fin for franjas

        if (!exito) {
            resultados.push({
                grupo_id: grupo.id,
                estado: 'error',
                motivo: 'No se encontró franja con docente y aula disponibles después de múltiples intentos'
            });
        }
    } // fin for grupos

    const asignados = resultados.filter(r => r.estado === 'asignado').length;
    const errores = resultados.filter(r => r.estado === 'error').length;
    console.log(`✅ Asignados: ${asignados}, ❌ Errores: ${errores}`);

    // Notificar al director
    await notificar_director({
        director_email: 'director.ingenieria@uniajc.edu.co',
        asunto: 'Generación de horarios completada',
        mensaje: `Se generaron ${asignados} horarios para los grupos pendientes. Errores: ${errores}.`
    });

    return {
        mensaje: `Proceso completado. Se asignaron ${asignados} horarios. Errores: ${errores}.`,
        asignaciones: resultados
    };
}