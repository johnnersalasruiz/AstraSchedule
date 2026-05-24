import { pool } from '../../scripts/db.js';

export async function proponer_horario({ grupo_id, excluir_docentes = [], salon_recomendado = null }) {
    // Obtener información del grupo
    const grupoInfo = await pool.query(`
    SELECT g.id, g.cupo_max, g.jornada_id, g.modalidad, g.sede_id,
           m.horas_semana, m.tipo_aula_requerida, j.codigo AS jornada
    FROM grupos g
    JOIN materias m ON m.id = g.materia_id
    JOIN jornadas j ON j.id = g.jornada_id
    WHERE g.id = $1
  `, [grupo_id]);

    if (grupoInfo.rows.length === 0) throw new Error('Grupo no encontrado');
    const grupo = grupoInfo.rows[0];

    const numBloques = Math.ceil(grupo.horas_semana / 3); // bloques de 3h

    // Obtener franjas horarias compatibles con la jornada del grupo
    const franjasQuery = `
    SELECT f.id, b.codigo, f.dia, b.hora_inicio, b.hora_fin, b.jornada_id
    FROM franjas_horarias f
    JOIN bloques_horarios b ON b.id = f.bloque_id
    JOIN periodos_academicos p ON p.id = f.periodo_id AND p.activo = true
    WHERE b.jornada_id = $1
    ORDER BY f.id
  `;
    const franjas = await pool.query(franjasQuery, [grupo.jornada_id]);

    if (franjas.rows.length === 0) {
        return { horarios_propuestos: [], docente_sugerido: null, mensaje: 'No hay franjas disponibles para esta jornada' };
    }

    // Para cada franja, verificar disponibilidad de docentes (excluyendo los indicados)
    // y disponibilidad de aulas (si no se pasa salon_recomendado)
    const horariosPropuestos = [];
    let docenteSugerido = null;

    for (const franja of franjas.rows.slice(0, numBloques * 2)) { // probar hasta 2*necesarios
        // Buscar docentes disponibles en esa franja
        let queryDocentes = `
      SELECT d.id, d.nombre, d.tipo
      FROM docentes d
      WHERE d.activo = true
        AND d.disponibilidad IN ('Ambas', $1)
        AND EXISTS (
          SELECT 1 FROM disponibilidad_docente dd
          WHERE dd.docente_id = d.id AND dd.franja_id = $2
        )
    `;
        const params = [grupo.jornada, franja.id];
        if (excluir_docentes.length > 0) {
            queryDocentes += ` AND d.id NOT IN (${excluir_docentes.map((_, i) => `$${i + 3}`).join(',')})`;
            params.push(...excluir_docentes);
        }
        queryDocentes += ` LIMIT 1`;
        const docentes = await pool.query(queryDocentes, params);
        if (docentes.rows.length === 0) continue;

        // Buscar aula disponible (si no hay recomendada)
        let aulaId = null;
        if (salon_recomendado) {
            const salonValido = await pool.query(`
        SELECT id FROM salones WHERE id = $1 AND disponible = true
      `, [salon_recomendado]);
            if (salonValido.rows.length > 0) aulaId = salon_recomendado;
        }
        if (!aulaId) {
            const aulaQuery = `
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
            const aulaRes = await pool.query(aulaQuery, [grupo.cupo_max, grupo.tipo_aula_requerida, franja.id]);
            if (aulaRes.rows.length === 0) continue;
            aulaId = aulaRes.rows[0].id;
        }

        horariosPropuestos.push({
            franja_id: franja.id,
            dia: franja.dia,
            bloque: franja.codigo,
            hora_inicio: franja.hora_inicio,
            hora_fin: franja.hora_fin,
            aula_id: aulaId,
            docente_sugerido: docentes.rows[0]
        });
        if (!docenteSugerido) docenteSugerido = docentes.rows[0];
        if (horariosPropuestos.length >= numBloques) break;
    }

    return {
        grupo_id,
        jornada: grupo.jornada,
        bloques_necesarios: numBloques,
        horarios_propuestos: horariosPropuestos,
        docente_sugerido: docenteSugerido
    };
}