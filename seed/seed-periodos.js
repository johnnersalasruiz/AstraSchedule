// ════════════════════════════════════════════════════════════════
// seed-periodos.js — Parametrización temporal del Módulo 2.
//   • Periodos: 2025-1 / 2025-2 (cerrados) y 2026-1 (activo)
//   • Jornadas: diurna, nocturna  (sin sabatina, según spec)
//   • Bloques maestros: D1, D2, D3 (3h diurnas), N1 (3h nocturna)
//   • Franjas = (bloque, día) Lun–Vie para cada periodo
// El catálogo de bloques es escalable: añadir D4 / N2 es 1 INSERT.
// ════════════════════════════════════════════════════════════════
import { withTransaction, pool } from '../scripts/db.js';

const PERIODOS = [
  { codigo: '2025-1', nombre: 'Primer semestre 2025',  inicio: '2025-01-27', fin: '2025-06-14', activo: false },
  { codigo: '2025-2', nombre: 'Segundo semestre 2025', inicio: '2025-07-21', fin: '2025-11-29', activo: false },
  { codigo: '2026-1', nombre: 'Primer semestre 2026',  inicio: '2026-01-26', fin: '2026-06-13', activo: true  },
];

const JORNADAS = [
  { codigo: 'diurna',   nombre: 'Diurna',   descripcion: 'Bloques D1–D3 entre 07:00 y 17:00 (Lun–Vie)' },
  { codigo: 'nocturna', nombre: 'Nocturna', descripcion: 'Bloque N1 18:30–21:30 (Lun–Vie)' },
];

// Bloques del spec. Para agregar uno nuevo (p.ej. D4 14:00-17:00 con
// duración 4h) basta con añadir la fila — el resto del sistema lo recoge.
const BLOQUES = [
  { codigo: 'D1', nombre: 'Mañana 1',  jornada: 'diurna',   inicio: '07:00', fin: '10:00', orden: 1 },
  { codigo: 'D2', nombre: 'Mañana 2',  jornada: 'diurna',   inicio: '10:00', fin: '13:00', orden: 2 },
  { codigo: 'D3', nombre: 'Tarde',     jornada: 'diurna',   inicio: '14:00', fin: '17:00', orden: 3 },
  { codigo: 'N1', nombre: 'Nocturno',  jornada: 'nocturna', inicio: '18:30', fin: '21:30', orden: 4 },
];

const DIAS = ['Lunes','Martes','Miercoles','Jueves','Viernes'];

async function run() {
  await withTransaction(async (c) => {
    for (const p of PERIODOS) {
      await c.query(
        `INSERT INTO periodos_academicos (codigo,nombre,fecha_inicio,fecha_fin,activo)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (codigo) DO UPDATE
           SET nombre=EXCLUDED.nombre,
               fecha_inicio=EXCLUDED.fecha_inicio,
               fecha_fin=EXCLUDED.fecha_fin,
               activo=EXCLUDED.activo`,
        [p.codigo, p.nombre, p.inicio, p.fin, p.activo]
      );
    }

    for (const j of JORNADAS) {
      await c.query(
        `INSERT INTO jornadas (codigo,nombre,descripcion)
         VALUES ($1,$2,$3)
         ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion`,
        [j.codigo, j.nombre, j.descripcion]
      );
    }

    const jornadas = Object.fromEntries(
      (await c.query(`SELECT id, codigo FROM jornadas`)).rows.map((r) => [r.codigo, r.id])
    );

    await c.query(`DELETE FROM bloques_horarios`);
    for (const b of BLOQUES) {
      await c.query(
        `INSERT INTO bloques_horarios (codigo,nombre,jornada_id,hora_inicio,hora_fin,orden)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [b.codigo, b.nombre, jornadas[b.jornada], b.inicio, b.fin, b.orden]
      );
    }

    const bloques = (await c.query(`SELECT id, codigo FROM bloques_horarios`)).rows;
    const periodos = (await c.query(`SELECT id, codigo FROM periodos_academicos`)).rows;

    await c.query(`DELETE FROM franjas_horarias`);
    for (const per of periodos) {
      for (const b of bloques) {
        for (const dia of DIAS) {
          await c.query(
            `INSERT INTO franjas_horarias (periodo_id,bloque_id,dia)
             VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`,
            [per.id, b.id, dia]
          );
        }
      }
    }

    const totales = await c.query(`
      SELECT
        (SELECT COUNT(*) FROM periodos_academicos) AS periodos,
        (SELECT COUNT(*) FROM jornadas)            AS jornadas,
        (SELECT COUNT(*) FROM bloques_horarios)    AS bloques,
        (SELECT COUNT(*) FROM franjas_horarias)    AS franjas
    `);
    console.log('✓ Periodos parametrizados:', totales.rows[0]);
  });
}

run()
  .catch((e) => { console.error('✗ seed-periodos falló:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
