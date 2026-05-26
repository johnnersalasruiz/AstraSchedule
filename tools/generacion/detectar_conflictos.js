// tools/generacion/detectar_conflictos.js
import { pool } from '../../scripts/db.js';

export async function detectar_conflictos({ periodo_id = null, grupo_id = null }) {
    try {
        // Si no se especifica periodo, usar el activo
        let periodoActivoId = periodo_id;
        if (!periodoActivoId) {
            const periodoRes = await pool.query(`
                SELECT id FROM periodos_academicos WHERE activo = true LIMIT 1
            `);
            if (periodoRes.rows.length === 0) {
                throw new Error('No hay periodo académico activo');
            }
            periodoActivoId = periodoRes.rows[0].id;
        }

        let conflictos = [];

        // 1. Detectar solapamiento de docentes
        const docentesSolapados = await pool.query(`
            SELECT ha.docente_id, d.nombre AS docente_nombre, 
                   STRING_AGG(DISTINCT ha.id::text, ', ') AS horarios_ids,
                   STRING_AGG(DISTINCT CONCAT(f.dia, ' ', b.codigo), ', ') AS franjas
            FROM horario_asignado ha
            JOIN docentes d ON d.id = ha.docente_id
            JOIN franjas_horarias f ON f.id = ha.franja_id
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE ha.estado != 'cancelado'
              AND f.periodo_id = $1
              ${grupo_id ? `AND ha.grupo_id = $2` : ''}
            GROUP BY ha.docente_id, d.nombre
            HAVING COUNT(*) > 1
        `, grupo_id ? [periodoActivoId, grupo_id] : [periodoActivoId]);

        for (const d of docentesSolapados.rows) {
            conflictos.push({
                tipo: 'docente_solapado',
                descripcion: `Docente ${d.docente_nombre} tiene múltiples clases en: ${d.franjas}`,
                entidad_id: d.docente_id,
                horarios_ids: d.horarios_ids.split(', ')
            });
        }

        // 2. Detectar solapamiento de aulas
        const aulasSolapadas = await pool.query(`
            SELECT ha.salon_id, s.codigo AS salon_codigo,
                   STRING_AGG(DISTINCT ha.id::text, ', ') AS horarios_ids,
                   STRING_AGG(DISTINCT CONCAT(f.dia, ' ', b.codigo), ', ') AS franjas
            FROM horario_asignado ha
            JOIN salones s ON s.id = ha.salon_id
            JOIN franjas_horarias f ON f.id = ha.franja_id
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE ha.estado != 'cancelado'
              AND f.periodo_id = $1
              ${grupo_id ? `AND ha.grupo_id = $2` : ''}
            GROUP BY ha.salon_id, s.codigo
            HAVING COUNT(*) > 1
        `, grupo_id ? [periodoActivoId, grupo_id] : [periodoActivoId]);

        for (const a of aulasSolapadas.rows) {
            conflictos.push({
                tipo: 'aula_solapada',
                descripcion: `Aula ${a.salon_codigo} tiene múltiples clases en: ${a.franjas}`,
                entidad_id: a.salon_id,
                horarios_ids: a.horarios_ids.split(', ')
            });
        }

        // 3. Detectar grupos sin horario
        const gruposSinHorario = await pool.query(`
            SELECT g.id, m.codigo AS materia_codigo, g.numero
            FROM grupos g
            JOIN materias m ON m.id = g.materia_id
            WHERE g.periodo_id = $1
              AND g.estado = 'abierto'
              AND NOT EXISTS (
                  SELECT 1 FROM horario_asignado ha 
                  WHERE ha.grupo_id = g.id AND ha.estado != 'cancelado'
              )
              ${grupo_id ? `AND g.id = $2` : ''}
        `, grupo_id ? [periodoActivoId, grupo_id] : [periodoActivoId]);

        for (const g of gruposSinHorario.rows) {
            conflictos.push({
                tipo: 'grupo_sin_horario',
                descripcion: `Grupo ${g.materia_codigo} - ${g.numero} no tiene horario asignado`,
                entidad_id: g.id,
                horarios_ids: []
            });
        }

        // 4. Detectar docentes con carga excedida
        const cargaExcedida = await pool.query(`
            SELECT d.id, d.nombre, d.carga_max_horas,
                   COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600), 0) AS horas_asignadas
            FROM docentes d
            JOIN horario_asignado ha ON ha.docente_id = d.id AND ha.estado != 'cancelado'
            JOIN franjas_horarias f ON f.id = ha.franja_id
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE f.periodo_id = $1
            ${grupo_id ? `AND ha.grupo_id = $2` : ''}
            GROUP BY d.id, d.nombre, d.carga_max_horas
            HAVING COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600), 0) > d.carga_max_horas
        `, grupo_id ? [periodoActivoId, grupo_id] : [periodoActivoId]);

        for (const d of cargaExcedida.rows) {
            conflictos.push({
                tipo: 'carga_docente_excedida',
                descripcion: `Docente ${d.nombre} tiene ${d.horas_asignadas}h asignadas (máx: ${d.carga_max_horas}h)`,
                entidad_id: d.id,
                horarios_ids: []
            });
        }

        return {
            success: true,
            periodo_id: periodoActivoId,
            total_conflictos: conflictos.length,
            conflictos: conflictos,
            resumen: {
                docente_solapado: docentesSolapados.rows.length,
                aula_solapada: aulasSolapadas.rows.length,
                grupo_sin_horario: gruposSinHorario.rows.length,
                carga_docente_excedida: cargaExcedida.rows.length
            }
        };
    } catch (error) {
        throw new Error(`Error al detectar conflictos: ${error.message}`);
    }
}