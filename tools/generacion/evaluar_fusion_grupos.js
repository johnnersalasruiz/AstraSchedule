import { pool } from '../../scripts/db.js';

export async function evaluar_fusion_grupos({ grupos_ids }) {
    if (!grupos_ids || grupos_ids.length < 2) {
        throw new Error('Se requieren al menos dos IDs de grupos para evaluar fusión');
    }

    // Obtener información de los grupos: materia, cupo_max, jornada, modalidad
    const grupos = await pool.query(`
    SELECT g.id, g.cupo_max, m.nombre AS materia, j.codigo AS jornada, g.modalidad, g.sede_id
    FROM grupos g
    JOIN materias m ON m.id = g.materia_id
    JOIN jornadas j ON j.id = g.jornada_id
    WHERE g.id = ANY($1::int[])
  `, [grupos_ids]);

    if (grupos.rows.length < 2) throw new Error('No se encontraron todos los grupos');

    const total_estudiantes = grupos.rows.reduce((sum, g) => sum + g.cupo_max, 0);
    const jornada = grupos.rows[0].jornada;
    const modalidad = grupos.rows[0].modalidad;
    const misma_materia = grupos.rows.every(g => g.materia === grupos.rows[0].materia);
    const misma_jornada = grupos.rows.every(g => g.jornada === jornada);
    const misma_modalidad = grupos.rows.every(g => g.modalidad === modalidad);

    if (!misma_materia || !misma_jornada || !misma_modalidad) {
        return { fusion_posible: false, motivo: 'Los grupos no comparten materia, jornada o modalidad' };
    }

    // Buscar un salón que pueda albergar a todos los estudiantes juntos
    const salon = await pool.query(`
    SELECT id, codigo, capacidad, tipo, sede_id
    FROM salones
    WHERE capacidad >= $1
      AND ($2 = 'virtual' OR tipo = 'presencial')
      AND disponible = true
    ORDER BY capacidad ASC
    LIMIT 1
  `, [total_estudiantes, modalidad]);

    if (salon.rows.length === 0) {
        return { fusion_posible: false, motivo: 'No hay salón con capacidad suficiente' };
    }

    return {
        fusion_posible: true,
        total_estudiantes,
        salon_sugerido: salon.rows[0],
        jornada,
        modalidad,
        observacion: `Los grupos pueden unirse en el salón ${salon.rows[0].codigo} (capacidad ${salon.rows[0].capacidad})`
    };
}