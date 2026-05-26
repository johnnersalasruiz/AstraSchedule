import { pool } from '../../scripts/db.js';

export async function obtener_resumen_estado({ programa_id, jornada, modalidad, sede = null }) {
    if (!programa_id || !jornada || !modalidad) {
        throw new Error('Faltan parámetros obligatorios: programa_id, jornada y modalidad');
    }
    if (modalidad === 'presencial' && !sede) {
        throw new Error('Para modalidad presencial, sede es obligatoria');
    }
    if (modalidad === 'virtual') {
        sede = null; // Los grupos virtuales no tienen sede física
    }

    const query = `
  WITH grupos_filtrados AS (
    SELECT 
      g.id,
      h.id AS horario_id,
      h.estado AS horario_estado
    FROM grupos g
    JOIN materias m ON m.id = g.materia_id
    JOIN jornadas j ON j.id = g.jornada_id
    LEFT JOIN sedes s ON s.id = g.sede_id
    LEFT JOIN horario_asignado h ON h.grupo_id = g.id AND h.estado <> 'cancelado'
    WHERE m.programa_id = (SELECT id FROM programas WHERE codigo = $1)
      AND j.codigo ILIKE $2
      AND g.modalidad = $3
      AND ($4::text IS NULL OR s.codigo ILIKE $4::text)
      AND g.estado = 'abierto'
  )
  SELECT
    COUNT(*) AS total_grupos,
    COALESCE(ROUND(100.0 * COUNT(horario_id) / NULLIF(COUNT(*), 0), 2), 0.00) AS porcentaje_completitud,
    jsonb_build_object(
      'sin_horario', COUNT(*) FILTER (WHERE horario_id IS NULL),
      'propuesto',   COUNT(*) FILTER (WHERE horario_estado = 'propuesto'),
      'confirmado',  COUNT(*) FILTER (WHERE horario_estado = 'confirmado'),
      'conflicto',   COUNT(*) FILTER (WHERE horario_estado = 'conflicto')
    ) AS por_estado
  FROM grupos_filtrados
`;

    const values = [programa_id, jornada, modalidad, sede];
    const result = await pool.query(query, values);

    if (result.rows.length === 0 || result.rows[0].total_grupos === 0) {
        throw new Error('No se encontraron grupos con los criterios especificados');
    }

    return {
        ...result.rows[0],
        programa_id,
        jornada,
        modalidad,
        sede: sede || (modalidad === 'virtual' ? 'virtual' : null)
    };
}