// ════════════════════════════════════════════════════════════════
// seed-reglas.js — Reglas configurables del motor de horarios.
// Las leen los triggers (fn_regla_*) y la UI puede modificarlas en runtime.
// ════════════════════════════════════════════════════════════════
import { withTransaction, pool } from '../scripts/db.js';

const REGLAS = [
  // Aforo / cupos
  { clave: 'capacidad_tolerancia',      valor: '1.0',  tipo: 'decimal',
    descripcion: 'Factor sobre capacidad del salón (1.0 estricto, 1.10 admite 10% extra)' },
  { clave: 'min_estudiantes_por_grupo', valor: '8',    tipo: 'integer',
    descripcion: 'Cupo mínimo para abrir un grupo' },

  // Validación de inscripción
  { clave: 'requiere_paz_y_salvo',      valor: 'true', tipo: 'boolean',
    descripcion: 'Bloquea inscripción si el estudiante no tiene paz y salvo' },
  { clave: 'validar_prerequisitos',     valor: 'true', tipo: 'boolean',
    descripcion: 'Bloquea inscripción si faltan materias prerequisito (estado=aprobada)' },

  // Modalidad virtual desde semestre N (regla del spec: ≥7° virtual).
  // Es CONFIGURABLE — cambiarla a 8 sólo requiere UPDATE de esta fila.
  { clave: 'umbral_semestre_virtual',   valor: '7',    tipo: 'integer',
    descripcion: 'Desde este semestre la materia se dicta en modalidad virtual' },

  // Carga docente (TC / MT). El check real usa docentes.carga_max_horas;
  // estos son los defaults sugeridos cuando se crea un docente nuevo.
  { clave: 'carga_default_TC',          valor: '40',   tipo: 'integer',
    descripcion: 'Horas semanales máximas por defecto para docentes TC' },
  { clave: 'carga_default_MT',          valor: '20',   tipo: 'integer',
    descripcion: 'Horas semanales máximas por defecto para docentes MT' },
  { clave: 'permitir_clases_consecutivas', valor: 'true', tipo: 'boolean',
    descripcion: 'Permite a un docente franjas seguidas el mismo día (misma sede)' },

  // Motor de optimización
  { clave: 'estrategia_asignacion',     valor: '"greedy_disponibilidad"', tipo: 'json',
    descripcion: 'Estrategia del agente IA: greedy_disponibilidad | round_robin | min_conflictos' },
  { clave: 'reintentos_max',            valor: '3',    tipo: 'integer',
    descripcion: 'Veces que el agente reintenta una asignación antes de marcar conflicto' },

  // Edición manual (RF-04)
  { clave: 'permitir_edicion_manual',   valor: 'true', tipo: 'boolean',
    descripcion: 'Habilita mover clases desde la UI' },
  { clave: 'requiere_confirmacion_manual', valor: 'true', tipo: 'boolean',
    descripcion: 'Cambios manuales quedan en estado=propuesto hasta confirmación' },
];

async function run() {
  await withTransaction(async (c) => {
    for (const r of REGLAS) {
      await c.query(
        `INSERT INTO reglas_configurables (clave,valor,tipo,descripcion)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (clave) DO UPDATE
           SET valor          = EXCLUDED.valor,
               tipo           = EXCLUDED.tipo,
               descripcion    = EXCLUDED.descripcion,
               actualizado_en = NOW()
         WHERE reglas_configurables.modificable = TRUE`,
        [r.clave, r.valor, r.tipo, r.descripcion]
      );
    }
    const { rows } = await c.query(
      `SELECT clave, valor, tipo FROM reglas_configurables ORDER BY clave`
    );
    console.log(`✓ ${rows.length} reglas configurables registradas:`);
    rows.forEach((r) => console.log(`   • ${r.clave.padEnd(34)} = ${r.valor}  (${r.tipo})`));
  });
}

run()
  .catch((e) => { console.error('✗ seed-reglas falló:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
