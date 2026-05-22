// ════════════════════════════════════════════════════════════════
// validate-integrity.js — Verifica integridad de la base contra el spec
// del Módulo 2. Cubre catálogos, reglas duras y reglas de coherencia.
// Sale con código != 0 si encuentra problemas críticos.
// ════════════════════════════════════════════════════════════════
import { pool } from './db.js';

const checks = [];
const check = (nombre, sql, critico = false, esperado = 'cero') =>
  checks.push({ nombre, sql, critico, esperado });

// ── Catálogos base ─────────────────────────────────────────────
check('Hay exactamente 1 periodo activo',
  `SELECT COUNT(*)::INT AS n FROM periodos_academicos WHERE activo = TRUE`,
  true, 'igual_1');

check('Jornadas del spec presentes (diurna, nocturna)',
  `SELECT COUNT(*)::INT AS n FROM jornadas WHERE codigo IN ('diurna','nocturna')`,
  true, 'igual_2');

check('Bloques del spec presentes (D1, D2, D3, N1)',
  `SELECT COUNT(*)::INT AS n FROM bloques_horarios WHERE codigo IN ('D1','D2','D3','N1')`,
  true, 'igual_4');

check('Bloques diurnos son de 3 horas exactas',
  `SELECT COUNT(*)::INT AS n FROM bloques_horarios
   WHERE codigo IN ('D1','D2','D3')
     AND EXTRACT(EPOCH FROM (hora_fin - hora_inicio))/3600 = 3`,
  true, 'igual_3');

check('Bloque N1 es 18:30-21:30 (3h)',
  `SELECT COUNT(*)::INT AS n FROM bloques_horarios
   WHERE codigo='N1' AND hora_inicio='18:30' AND hora_fin='21:30'`,
  true, 'igual_1');

check('Franjas del periodo activo cubren 4 bloques × 5 días',
  `SELECT COUNT(*)::INT AS n FROM franjas_horarias f
   JOIN periodos_academicos p ON p.id = f.periodo_id WHERE p.activo`,
  true, 'igual_20');

check('Sedes Norte y Sur presentes',
  `SELECT COUNT(*)::INT AS n FROM sedes WHERE codigo IN ('NORTE','SUR')`,
  true, 'igual_2');

check('Programas IS e IE presentes',
  `SELECT COUNT(*)::INT AS n FROM programas WHERE codigo IN ('IS','IE')`,
  true, 'igual_2');

check('Reglas configurables clave presentes',
  `SELECT COUNT(*)::INT AS n FROM reglas_configurables
   WHERE clave IN ('capacidad_tolerancia','requiere_paz_y_salvo','validar_prerequisitos','umbral_semestre_virtual')`,
  true, 'minimo_4');

// ── Integridad relacional ──────────────────────────────────────
check('Materias sin programa válido',
  `SELECT COUNT(*)::INT AS n FROM materias m
   LEFT JOIN programas p ON p.id = m.programa_id WHERE p.id IS NULL`);

check('Prerequisitos auto-referenciales',
  `SELECT COUNT(*)::INT AS n FROM prerequisitos WHERE materia_id = prerequisito_id`);

check('Salones sin sede',
  `SELECT COUNT(*)::INT AS n FROM salones s
   LEFT JOIN sedes se ON se.id = s.sede_id WHERE se.id IS NULL`);

check('Docentes sin disponibilidad en periodo activo',
  `SELECT COUNT(*)::INT AS n FROM docentes d
   WHERE d.activo AND NOT EXISTS (
     SELECT 1 FROM disponibilidad_docente dd
     JOIN franjas_horarias f ON f.id = dd.franja_id
     JOIN periodos_academicos p ON p.id = f.periodo_id AND p.activo
     WHERE dd.docente_id = d.id
   )`);

check('Carga docente TC = 40h',
  `SELECT COUNT(*)::INT AS n FROM docentes WHERE tipo='TC' AND carga_max_horas <> 40`);

check('Carga docente MT = 20h',
  `SELECT COUNT(*)::INT AS n FROM docentes WHERE tipo='MT' AND carga_max_horas <> 20`);

// ── Reglas de coherencia del spec ──────────────────────────────
check('Grupos virtuales con sede asignada (deben ser NULL)',
  `SELECT COUNT(*)::INT AS n FROM grupos WHERE modalidad='virtual' AND sede_id IS NOT NULL`);

check('Grupos presenciales sin sede',
  `SELECT COUNT(*)::INT AS n FROM grupos WHERE modalidad='presencial' AND sede_id IS NULL`);

check('Materias ≥ umbral_semestre_virtual con grupo no-virtual',
  `WITH umbral AS (
     SELECT COALESCE(valor::INT, 7) AS u FROM reglas_configurables
     WHERE clave = 'umbral_semestre_virtual'
   )
   SELECT COUNT(*)::INT AS n FROM grupos g
   JOIN materias m ON m.id = g.materia_id
   CROSS JOIN umbral
   WHERE m.semestre >= umbral.u AND g.modalidad <> 'virtual'`);

check('Grupos C virtuales sin autorización del decano',
  `SELECT COUNT(*)::INT AS n FROM grupos
   WHERE modalidad='virtual' AND UPPER(numero)='C' AND requiere_autorizacion=FALSE`);

check('Inscripciones con jornada incompatible (estudiante vs grupo)',
  `SELECT COUNT(*)::INT AS n FROM inscripciones i
   JOIN estudiantes e ON e.id = i.estudiante_id
   JOIN grupos g       ON g.id = i.grupo_id
   WHERE i.estado='activa' AND e.jornada_id <> g.jornada_id`);

check('Inscripciones cruzando sede sin excepción ni virtual',
  `SELECT COUNT(*)::INT AS n FROM inscripciones i
   JOIN estudiantes e ON e.id = i.estudiante_id
   JOIN grupos g       ON g.id = i.grupo_id
   WHERE i.estado='activa'
     AND g.modalidad <> 'virtual'
     AND i.es_excepcion = FALSE
     AND g.sede_id IS DISTINCT FROM e.sede_id`);

// ── Reglas de inscripción ──────────────────────────────────────
check('Estudiantes sin paz y salvo con inscripción activa',
  `SELECT COUNT(*)::INT AS n FROM inscripciones i
   JOIN estudiantes e ON e.id = i.estudiante_id
   WHERE i.estado = 'activa' AND e.paz_y_salvo = FALSE`);

check('Grupos sobre-inscritos vs cupo_max × tolerancia',
  `WITH tol AS (
     SELECT COALESCE(valor::NUMERIC, 1.0) AS t FROM reglas_configurables
     WHERE clave='capacidad_tolerancia'
   )
   SELECT COUNT(*)::INT AS n FROM (
     SELECT g.id, g.cupo_max, COUNT(i.id) AS inscritos
     FROM grupos g LEFT JOIN inscripciones i ON i.grupo_id = g.id AND i.estado='activa'
     CROSS JOIN tol
     GROUP BY g.id, g.cupo_max, tol.t
     HAVING COUNT(i.id) > FLOOR(g.cupo_max * (SELECT t FROM tol))
   ) sub`);

check('Inscripciones activas sin prerequisitos aprobados',
  `SELECT COUNT(*)::INT AS n FROM inscripciones i
   JOIN grupos g ON g.id = i.grupo_id
   JOIN prerequisitos p ON p.materia_id = g.materia_id
   WHERE i.estado = 'activa'
     AND NOT EXISTS (
       SELECT 1 FROM inscripciones i2
       JOIN grupos g2 ON g2.id = i2.grupo_id
       WHERE i2.estudiante_id = i.estudiante_id
         AND g2.materia_id    = p.prerequisito_id
         AND i2.estado        = 'aprobada'
     )`);

// ── Horarios asignados (cuando empiece a llenarse) ─────────────
check('Horarios con docente sin disponibilidad en la franja',
  `SELECT COUNT(*)::INT AS n FROM horario_asignado h
   WHERE NOT EXISTS (
     SELECT 1 FROM disponibilidad_docente dd
     WHERE dd.docente_id = h.docente_id AND dd.franja_id = h.franja_id
   )`);

check('Horarios con salón incompatible',
  `SELECT COUNT(*)::INT AS n FROM horario_asignado h
   JOIN grupos g   ON g.id = h.grupo_id
   JOIN materias m ON m.id = g.materia_id
   JOIN salones s  ON s.id = h.salon_id
   WHERE m.tipo_aula_requerida <> 'cualquiera'
     AND m.tipo_aula_requerida <> s.tipo`);

check('Horarios con jornada del bloque ≠ jornada del grupo',
  `SELECT COUNT(*)::INT AS n FROM horario_asignado h
   JOIN grupos g           ON g.id = h.grupo_id
   JOIN franjas_horarias f ON f.id = h.franja_id
   JOIN bloques_horarios b ON b.id = f.bloque_id
   WHERE h.estado <> 'cancelado' AND g.jornada_id <> b.jornada_id`);

check('Solapamientos de salón',
  `SELECT COUNT(*)::INT AS n FROM (
     SELECT salon_id, franja_id FROM horario_asignado
     WHERE estado <> 'cancelado'
     GROUP BY salon_id, franja_id HAVING COUNT(*) > 1
   ) sub`);

check('Solapamientos de docente',
  `SELECT COUNT(*)::INT AS n FROM (
     SELECT docente_id, franja_id FROM horario_asignado
     WHERE estado <> 'cancelado'
     GROUP BY docente_id, franja_id HAVING COUNT(*) > 1
   ) sub`);

check('Traslado de docente entre sedes en bloques consecutivos',
  `SELECT COUNT(*)::INT AS n
   FROM horario_asignado h1
   JOIN salones          s1 ON s1.id = h1.salon_id
   JOIN franjas_horarias f1 ON f1.id = h1.franja_id
   JOIN bloques_horarios b1 ON b1.id = f1.bloque_id
   JOIN horario_asignado h2 ON h2.docente_id = h1.docente_id AND h2.id > h1.id
   JOIN salones          s2 ON s2.id = h2.salon_id
   JOIN franjas_horarias f2 ON f2.id = h2.franja_id
   JOIN bloques_horarios b2 ON b2.id = f2.bloque_id
   WHERE h1.estado <> 'cancelado' AND h2.estado <> 'cancelado'
     AND f1.dia = f2.dia
     AND ABS(b1.orden - b2.orden) = 1
     AND s1.sede_id IS NOT NULL AND s2.sede_id IS NOT NULL
     AND s1.sede_id <> s2.sede_id`);

check('Conflictos detectados sin resolver',
  `SELECT COUNT(*)::INT AS n FROM conflictos_detectados WHERE NOT resuelto`);

// ── Resumen ────────────────────────────────────────────────────
async function resumen() {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM sedes)                  AS sedes,
      (SELECT COUNT(*) FROM programas)              AS programas,
      (SELECT COUNT(*) FROM materias)               AS materias,
      (SELECT COUNT(*) FROM prerequisitos)          AS prerequisitos,
      (SELECT COUNT(*) FROM bloques_horarios)       AS bloques,
      (SELECT COUNT(*) FROM franjas_horarias)       AS franjas,
      (SELECT COUNT(*) FROM salones WHERE capacidad=30) AS salones_30,
      (SELECT COUNT(*) FROM salones WHERE capacidad=60) AS salones_60,
      (SELECT COUNT(*) FROM docentes WHERE tipo='TC') AS docentes_TC,
      (SELECT COUNT(*) FROM docentes WHERE tipo='MT') AS docentes_MT,
      (SELECT COUNT(*) FROM disponibilidad_docente) AS disponibilidades,
      (SELECT COUNT(*) FROM estudiantes)            AS estudiantes,
      (SELECT COUNT(*) FROM estudiantes WHERE paz_y_salvo) AS con_paz_y_salvo,
      (SELECT COUNT(*) FROM grupos WHERE modalidad='presencial') AS grupos_pres,
      (SELECT COUNT(*) FROM grupos WHERE modalidad='virtual')    AS grupos_virt,
      (SELECT COUNT(*) FROM inscripciones WHERE estado='activa')   AS activas,
      (SELECT COUNT(*) FROM inscripciones WHERE estado='aprobada') AS aprobadas,
      (SELECT COUNT(*) FROM horario_asignado)       AS horarios_asignados,
      (SELECT COUNT(*) FROM conflictos_detectados WHERE NOT resuelto) AS conflictos_abiertos
  `);
  console.log('\n📊 RESUMEN DE LA BASE DE DATOS');
  console.log('─'.repeat(50));
  Object.entries(r.rows[0]).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}`)
  );
}

function pasaCheck(esperado, n) {
  switch (esperado) {
    case 'cero':      return n === 0;
    case 'igual_1':   return n === 1;
    case 'igual_2':   return n === 2;
    case 'igual_3':   return n === 3;
    case 'igual_4':   return n === 4;
    case 'igual_20':  return n === 20;
    case 'minimo_4':  return n >= 4;
    default:          return n === 0;
  }
}

async function ejecutar() {
  console.log('🔍 Validando integridad contra spec Módulo 2...\n');
  let ok = 0, warn = 0, fail = 0;

  for (const c of checks) {
    const { rows } = await pool.query(c.sql);
    const n = Number(rows[0].n);
    const pasa = pasaCheck(c.esperado, n);
    if (pasa) {
      console.log(`  ✓ ${c.nombre}  (${n})`);
      ok++;
    } else if (c.critico) {
      console.log(`  ✗ ${c.nombre}  (${n}) ← CRÍTICO`);
      fail++;
    } else {
      console.log(`  ⚠ ${c.nombre}  (${n})`);
      warn++;
    }
  }
  await resumen();
  console.log('\n' + '─'.repeat(50));
  console.log(`Total: ${ok} ok, ${warn} advertencias, ${fail} críticos`);
  if (fail > 0) process.exitCode = 1;
}

ejecutar()
  .catch((e) => { console.error('✗ validate falló:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
