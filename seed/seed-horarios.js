// ════════════════════════════════════════════════════════════════
// seed-horarios.js — Carga de datos UNIAJC alineada con el spec del Módulo 2.
//   • 2 sedes (Norte / Sur)
//   • 2 programas: Ing. Sistemas (IS, 10 sem) y Ing. Electrónica (IE, 9 sem)
//   • Pénsum IS y IE según el spec, con prerequisitos
//   • Salones con aforos 30 y 60 (más laboratorios y aulas virtuales)
//   • 10 docentes TC=40h / MT=20h con disponibilidad Diurna/Nocturna/Ambas
//   • 55 estudiantes (28 IS + 27 IE) repartidos en Norte/Sur × Diurna/Nocturna
//   • Grupos presenciales por sede×jornada hasta umbral_semestre_virtual;
//     grupos virtuales (sede=NULL) desde el umbral en adelante.
//   • Inscripciones históricas (estado=aprobada) + activas del semestre actual.
// ════════════════════════════════════════════════════════════════
import { withTransaction, pool } from '../scripts/db.js';

const SEED = 42;
let _seed = SEED;
const rand     = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };
const pick     = (arr) => arr[Math.floor(rand() * arr.length)];
const intRange = (a, b) => a + Math.floor(rand() * (b - a + 1));

// ─── Datos maestros ─────────────────────────────────────────────
const SEDES = [
  { codigo: 'NORTE', nombre: 'Sede Norte', direccion: 'Av. 6N #28-102, Cali' },
  { codigo: 'SUR',   nombre: 'Sede Sur',   direccion: 'Cra. 100 #11-60, Cali' },
];

const PROGRAMAS = [
  { codigo: 'IS', nombre: 'Ingeniería de Sistemas',  total_semestres: 10 },
  { codigo: 'IE', nombre: 'Ingeniería Electrónica',  total_semestres:  9 },
];

// Plan de Sistemas — del spec del Módulo 2.
// [codigo, nombre, semestre, creditos, horas_semana, [prereqs]]
const MATERIAS_IS = [
  ['IS-101','Lógica y Razonamiento',1,3,3,[]],
  ['IS-102','Matemáticas Básica',1,4,3,[]],
  ['IS-103','Introducción a la Ingeniería',1,2,3,[]],
  ['IS-104','Cátedra Institucional',1,2,3,[]],
  ['IS-105','Medio Ambiente',1,2,3,[]],
  ['IS-106','Comunicación y Lenguaje I',1,2,3,[]],

  ['IS-201','Cálculo Diferencial',2,4,3,['IS-102']],
  ['IS-202','Matemáticas Discretas',2,3,3,['IS-101']],
  ['IS-203','Álgebra Lineal',2,3,3,['IS-102']],
  ['IS-204','Introducción al Análisis y Solución de Problemas',2,3,3,['IS-103']],
  ['IS-205','Programación I',2,4,3,['IS-101']],
  ['IS-206','Comunicación y Lenguaje II',2,2,3,['IS-106']],

  ['IS-301','Cálculo Integral',3,4,3,['IS-201']],
  ['IS-302','Física I',3,4,3,['IS-201']],
  ['IS-303','Programación II',3,4,3,['IS-205']],
  ['IS-304','Seminario de Sistemas',3,2,3,['IS-204']],
  ['IS-305','Liderazgo y Emprendimiento',3,2,3,['IS-104']],
  ['IS-306','Principios de Economía',3,3,3,['IS-102']],

  ['IS-401','Cálculo Vectorial',4,4,3,['IS-301']],
  ['IS-402','Física II',4,4,3,['IS-302']],
  ['IS-403','Ingeniería de Software I',4,4,3,['IS-303']],
  ['IS-404','Fundamentos Web',4,3,3,['IS-303']],
  ['IS-405','Programación III',4,4,3,['IS-303']],
  ['IS-406','Humanidades I',4,2,3,[]],

  ['IS-501','Ecuaciones Diferenciales',5,4,3,['IS-401']],
  ['IS-502','Estadística I',5,3,3,['IS-301']],
  ['IS-503','Programación IV',5,4,3,['IS-405']],
  ['IS-504','Bases de Datos I',5,4,3,['IS-303']],
  ['IS-505','Electrónica Digital',5,3,3,['IS-402']],
  ['IS-506','Constitución y Ciudadanía',5,2,3,[]],

  ['IS-601','Estadística II',6,3,3,['IS-502']],
  ['IS-602','Programación V',6,4,3,['IS-503']],
  ['IS-603','Ingeniería del Software II',6,4,3,['IS-403']],
  ['IS-604','Bases de Datos II',6,4,3,['IS-504']],
  ['IS-605','Arquitectura de Sistemas Computacionales',6,4,3,['IS-505']],
  ['IS-606','Sistemas Operativos',6,4,3,['IS-405']],

  ['IS-701','Métodos Numéricos',7,3,3,['IS-501']],
  ['IS-702','Electiva I',7,3,3,[]],
  ['IS-703','Redes I',7,3,3,['IS-606']],
  ['IS-704','Organización y Administración I',7,3,3,['IS-305']],
  ['IS-705','Formulación y Evaluación de Proyectos de Ingeniería',7,3,3,['IS-306']],
  ['IS-706','Humanidades II',7,2,3,['IS-406']],

  ['IS-801','Electiva II',8,3,3,['IS-702']],
  ['IS-802','Redes II',8,3,3,['IS-703']],
  ['IS-803','Organización y Administración II',8,3,3,['IS-704']],
  ['IS-804','Temática de Grado',8,2,3,[]],
  ['IS-805','Ética y Responsabilidad Social',8,2,3,['IS-506']],
  ['IS-806','Innovación y Emprendimiento Tecnológico',8,2,3,['IS-305']],

  ['IS-901','Electiva III',9,3,3,['IS-801']],
  ['IS-902','Gerencia de Proyectos',9,3,3,['IS-705']],
  ['IS-903','Trabajo de Grado I',9,3,3,['IS-804']],
  ['IS-904','Práctica Empresarial',9,6,3,['IS-603']],

  ['IS-1001','Seminario de Actualización',10,2,3,[]],
  ['IS-1002','Trabajo de Grado II',10,4,3,['IS-903']],
  ['IS-1003','Seguridad',10,3,3,['IS-802']],
  ['IS-1004','Análisis de Entornos',10,3,3,['IS-902']],
];

// Plan de Electrónica — del spec del Módulo 2 (9 semestres).
const MATERIAS_IE = [
  ['IE-101','Comunicación y Lenguaje',1,2,3,[]],
  ['IE-102','Cátedra Institucional',1,2,3,[]],
  ['IE-103','Matemáticas Básicas',1,4,3,[]],
  ['IE-104','Lógica y Razonamiento',1,3,3,[]],
  ['IE-105','Ambiente y Sostenibilidad',1,2,3,[]],
  ['IE-106','Introducción a la Ingeniería',1,2,3,[]],

  ['IE-201','Constitución y Ciudadanía',2,2,3,[]],
  ['IE-202','Cálculo Diferencial',2,4,3,['IE-103']],
  ['IE-203','Álgebra Lineal',2,3,3,['IE-103']],
  ['IE-204','Humanidades',2,2,3,[]],
  ['IE-205','Seminario de Electrónica',2,2,3,['IE-106']],
  ['IE-206','Programación I',2,4,3,['IE-104']],

  ['IE-301','Cálculo Integral',3,4,3,['IE-202']],
  ['IE-302','Física I',3,4,3,['IE-202']],
  ['IE-303','Ingeniería Económica',3,3,3,['IE-103']],
  ['IE-304','Circuitos DC',3,4,3,['IE-203']],
  ['IE-305','Programación II',3,4,3,['IE-206']],
  ['IE-306','Liderazgo y Emprendimiento',3,2,3,['IE-102']],

  ['IE-401','Cálculo Vectorial',4,4,3,['IE-301']],
  ['IE-402','Física II',4,4,3,['IE-302']],
  ['IE-403','Circuitos AC',4,4,3,['IE-304']],
  ['IE-404','Electrónica Digital',4,4,3,['IE-402']],
  ['IE-405','Electrónica I',4,4,3,['IE-304']],
  ['IE-406','Diseño Electrónico e Industrial',4,3,3,['IE-304']],

  ['IE-501','Física III',5,4,3,['IE-402']],
  ['IE-502','Electricidad Industrial',5,4,3,['IE-403']],
  ['IE-503','Señales y Sistemas',5,4,3,['IE-401']],
  ['IE-504','Electrónica II',5,4,3,['IE-405']],
  ['IE-505','Estadística y Probabilidad',5,3,3,['IE-301']],
  ['IE-506','Ecuaciones Diferenciales',5,4,3,['IE-401']],

  ['IE-601','Sistemas Electrónicos Programables',6,4,3,['IE-404']],
  ['IE-602','Sistemas Dinámicos',6,4,3,['IE-506']],
  ['IE-603','Formulación y Evaluación de Proyectos de Ingeniería',6,3,3,['IE-303']],
  ['IE-604','Emprendimiento e Innovación',6,2,3,['IE-306']],
  ['IE-605','Conversión de Energía',6,4,3,['IE-502']],
  ['IE-606','Sistemas de Comunicación',6,4,3,['IE-503']],

  ['IE-701','Instrumentación Industrial',7,4,3,['IE-504']],
  ['IE-702','Control de Sistemas',7,4,3,['IE-602']],
  ['IE-703','Seminario de Trabajo de Grado',7,2,3,['IE-603']],
  ['IE-704','Sistemas Energéticos Renovables',7,3,3,['IE-605']],
  ['IE-705','Redes e IoT',7,4,3,['IE-305']],
  ['IE-706','Automatización Industrial',7,4,3,['IE-601']],

  ['IE-801','Trabajo de Grado I',8,3,3,['IE-703']],
  ['IE-802','Práctica Formativa',8,6,3,['IE-706']],
  ['IE-803','Electiva I',8,3,3,[]],
  ['IE-804','Diseño de Productos Tecnológicos',8,3,3,['IE-406']],
  ['IE-805','Ética y Responsabilidad Social',8,2,3,['IE-201']],

  ['IE-901','Dirección de Proyectos en Ingeniería',9,3,3,['IE-603']],
  ['IE-902','Análisis de Entornos',9,3,3,['IE-604']],
  ['IE-903','Trabajo de Grado II',9,4,3,['IE-801']],
  ['IE-904','Electiva II',9,3,3,['IE-803']],
  ['IE-905','Electiva III',9,3,3,['IE-904']],
];

// Tipo de aula sugerido por nombre (heurística).
function tipoAulaPara(nombre, semestre, umbralVirtual) {
  if (semestre >= umbralVirtual) return 'virtual';
  const n = nombre.toLowerCase();
  if (n.includes('programa')   || n.includes('bases de datos')
   || n.includes('física')     || n.includes('circuit')
   || n.includes('electrónica')|| n.includes('electronica')
   || n.includes('digital')    || n.includes('señales')
   || n.includes('instrument') || n.includes('control')
   || n.includes('automatiz')  || n.includes('redes')
   || n.includes('web')) return 'laboratorio';
  if (n.includes('humanidades')|| n.includes('cátedra') || n.includes('catedra')
   || n.includes('ética')      || n.includes('etica')
   || n.includes('liderazgo')) return 'cualquiera';
  return 'presencial';
}

const NOMBRES_PILA = [
  'Andrés','Camila','Daniel','Sofía','Juan','María','Carlos','Valentina','Felipe','Laura',
  'Sebastián','Isabella','Mateo','Mariana','Santiago','Gabriela','Diego','Paula','Tomás','Luisa',
  'Nicolás','Manuela','Alejandro','Antonella','Samuel','Salomé','Esteban','Catalina','Ricardo','Daniela',
];
const APELLIDOS = [
  'García','Rodríguez','Martínez','Hernández','López','González','Pérez','Sánchez','Ramírez','Torres',
  'Flores','Rivera','Gómez','Díaz','Morales','Ortiz','Gutiérrez','Chávez','Ruiz','Vargas',
  'Castro','Romero','Mendoza','Jiménez','Cárdenas','Quintero','Mosquera','Ocampo','Vásquez','Restrepo',
];

// 10 docentes: 4 TC (40h) + 6 MT (20h), repartidos en disponibilidad.
const DOCENTES = [
  { id_ext: 'D-1001', nombre: 'Felipe Vasco',       tipo: 'TC', carga: 40, disp: 'Diurna'   },
  { id_ext: 'D-1002', nombre: 'Lucía Restrepo',     tipo: 'TC', carga: 40, disp: 'Diurna'   },
  { id_ext: 'D-1003', nombre: 'Hernán Peña',        tipo: 'TC', carga: 40, disp: 'Nocturna' },
  { id_ext: 'D-1004', nombre: 'Gloria Martínez',    tipo: 'TC', carga: 40, disp: 'Ambas'    },
  { id_ext: 'D-1005', nombre: 'Raúl Quintero',      tipo: 'MT', carga: 20, disp: 'Diurna'   },
  { id_ext: 'D-1006', nombre: 'Beatriz Cano',       tipo: 'MT', carga: 20, disp: 'Diurna'   },
  { id_ext: 'D-1007', nombre: 'Iván Salgado',       tipo: 'MT', carga: 20, disp: 'Nocturna' },
  { id_ext: 'D-1008', nombre: 'Patricia Mejía',     tipo: 'MT', carga: 20, disp: 'Nocturna' },
  { id_ext: 'D-1009', nombre: 'Carlos Bermúdez',    tipo: 'MT', carga: 20, disp: 'Ambas'    },
  { id_ext: 'D-1010', nombre: 'Ana Ocampo',         tipo: 'MT', carga: 20, disp: 'Ambas'    },
];

// Salones (aforos 30 y 60 según spec).
// Virtual: sede física = NORTE por convención, irrelevante porque el trigger
// de sede no aplica a grupos modalidad='virtual'.
function buildSalones() {
  const out = [];
  let n = 0;
  const push = (sede, tipo, capacidad, bloque) => {
    n++;
    const pref = sede === 'NORTE' ? 'N' : 'S';
    const codigo = tipo === 'virtual'
      ? `V-${String(n).padStart(3,'0')}`
      : `${pref}-${String(n).padStart(3,'0')}`;
    out.push({ codigo, sede, tipo, capacidad, bloque });
  };
  // Aforo 30 presencial: 8 Norte + 8 Sur
  for (let i = 0; i < 8; i++) push('NORTE', 'presencial', 30, 'N-Bloque A');
  for (let i = 0; i < 8; i++) push('SUR',   'presencial', 30, 'S-Bloque A');
  // Aforo 60 presencial: 4 Norte + 4 Sur
  for (let i = 0; i < 4; i++) push('NORTE', 'presencial', 60, 'N-Bloque B');
  for (let i = 0; i < 4; i++) push('SUR',   'presencial', 60, 'S-Bloque B');
  // Laboratorios aforo 30: 2 Norte + 2 Sur
  for (let i = 0; i < 2; i++) push('NORTE', 'laboratorio', 30, 'N-Lab');
  for (let i = 0; i < 2; i++) push('SUR',   'laboratorio', 30, 'S-Lab');
  // Aulas virtuales aforo 60: 4 (sede NORTE como contenedor lógico)
  for (let i = 0; i < 4; i++) push('NORTE', 'virtual',    60, 'Virtual');
  return out;
}

// 55 estudiantes según spec (28 IS + 27 IE), distribuidos en Norte/Sur × Diurna/Nocturna.
// Tabla: [programa, total, distribuciónes (sede, jornada, n)]
const DISTRIBUCION_ESTUDIANTES = [
  { programa: 'IS', total: 28, semMax: 10, reparto: [
    ['NORTE','diurna',  10],
    ['SUR',  'diurna',   6],
    ['NORTE','nocturna', 7],
    ['SUR',  'nocturna', 5],
  ]},
  { programa: 'IE', total: 27, semMax:  9, reparto: [
    ['NORTE','diurna',   9],
    ['SUR',  'diurna',   6],
    ['NORTE','nocturna', 7],
    ['SUR',  'nocturna', 5],
  ]},
];

// ─── Pasos del seed ─────────────────────────────────────────────
async function truncarTodo(c) {
  await c.query(`
    TRUNCATE TABLE conflictos_detectados, horario_asignado, inscripciones,
                   grupos, disponibilidad_docente, estudiantes,
                   docentes, salones, prerequisitos, materias,
                   programas, sedes
    RESTART IDENTITY CASCADE
  `);
}

async function seedSedes(c) {
  const ids = {};
  for (const s of SEDES) {
    const r = await c.query(
      `INSERT INTO sedes (codigo,nombre,direccion) VALUES ($1,$2,$3) RETURNING id`,
      [s.codigo, s.nombre, s.direccion]
    );
    ids[s.codigo] = r.rows[0].id;
  }
  return ids;
}

async function seedProgramas(c) {
  const ids = {};
  for (const p of PROGRAMAS) {
    const r = await c.query(
      `INSERT INTO programas (codigo,nombre,total_semestres) VALUES ($1,$2,$3) RETURNING id`,
      [p.codigo, p.nombre, p.total_semestres]
    );
    ids[p.codigo] = r.rows[0].id;
  }
  return ids;
}

async function leerUmbralVirtual(c) {
  const { rows } = await c.query(
    `SELECT valor FROM reglas_configurables WHERE clave='umbral_semestre_virtual'`
  );
  if (rows.length === 0) {
    throw new Error('Falta regla umbral_semestre_virtual — corre seed-reglas.js antes.');
  }
  return parseInt(rows[0].valor, 10);
}

async function seedMaterias(c, progIds, umbralVirtual) {
  const lookup = {};
  const all = [
    ...MATERIAS_IS.map((m) => ['IS', ...m]),
    ...MATERIAS_IE.map((m) => ['IE', ...m]),
  ];
  for (const [progCod, codigo, nombre, semestre, creditos, horas] of all) {
    const tipo = tipoAulaPara(nombre, semestre, umbralVirtual);
    const r = await c.query(
      `INSERT INTO materias (codigo,nombre,programa_id,semestre,creditos,horas_semana,tipo_aula_requerida)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [codigo, nombre, progIds[progCod], semestre, creditos, horas, tipo]
    );
    lookup[codigo] = r.rows[0].id;
  }
  return lookup;
}

async function seedPrerequisitos(c, matMap) {
  const all = [...MATERIAS_IS, ...MATERIAS_IE];
  for (const [codigo, , , , , prereqs] of all) {
    for (const pre of prereqs) {
      await c.query(
        `INSERT INTO prerequisitos (materia_id,prerequisito_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [matMap[codigo], matMap[pre]]
      );
    }
  }
}

async function seedSalones(c, sedeIds) {
  for (const s of buildSalones()) {
    await c.query(
      `INSERT INTO salones (codigo,sede_id,tipo,capacidad,bloque)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.codigo, sedeIds[s.sede], s.tipo, s.capacidad, s.bloque]
    );
  }
}

async function seedDocentes(c) {
  const out = [];
  for (const d of DOCENTES) {
    const [nom, ape] = d.nombre.split(' ');
    const email = `${nom.toLowerCase()}.${ape.toLowerCase()}@uniajc.edu.co`
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const r = await c.query(
      `INSERT INTO docentes (identificacion,nombre,email,tipo,carga_max_horas,disponibilidad)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [d.id_ext, d.nombre, email, d.tipo, d.carga, d.disp]
    );
    out.push({ id: r.rows[0].id, ...d });
  }
  return out;
}

async function seedDisponibilidad(c, periodoActivoId, docentes) {
  // Cargar bloques y franjas del periodo activo con su jornada.
  const { rows: franjas } = await c.query(
    `SELECT f.id AS franja_id, j.codigo AS jornada_codigo
     FROM franjas_horarias f
     JOIN bloques_horarios b ON b.id = f.bloque_id
     JOIN jornadas         j ON j.id = b.jornada_id
     WHERE f.periodo_id = $1`,
    [periodoActivoId]
  );

  for (const d of docentes) {
    const candidatas = franjas.filter((f) => {
      if (d.disp === 'Ambas')   return true;
      if (d.disp === 'Diurna')  return f.jornada_codigo === 'diurna';
      if (d.disp === 'Nocturna')return f.jornada_codigo === 'nocturna';
      return false;
    });
    for (const f of candidatas) {
      await c.query(
        `INSERT INTO disponibilidad_docente (docente_id,franja_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [d.id, f.franja_id]
      );
    }
  }
}

async function seedEstudiantes(c, progIds, sedeIds, jornadaIds) {
  const out = [];
  let n = 0;
  for (const grupo of DISTRIBUCION_ESTUDIANTES) {
    for (const [sede, jornada, cantidad] of grupo.reparto) {
      for (let i = 0; i < cantidad; i++) {
        n++;
        const nom = pick(NOMBRES_PILA);
        const ape = `${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
        const semestre = intRange(1, grupo.semMax);
        const paz      = rand() < 0.90; // 90% con paz y salvo
        const ident    = `${1000000000 + n}`;
        const cod      = `${grupo.programa}${2020 + (n % 6)}${String(n).padStart(3,'0')}`;
        const correo   = `${nom.toLowerCase()}.${ape.split(' ')[0].toLowerCase()}${n}@uniajc.edu.co`
          .normalize('NFD').replace(/[̀-ͯ]/g, '');
        const r = await c.query(
          `INSERT INTO estudiantes (identificacion,codigo_estudiantil,nombre,apellido,email,
                                    programa_id,semestre_actual,jornada_id,sede_id,paz_y_salvo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [ident, cod, nom, ape, correo, progIds[grupo.programa],
           semestre, jornadaIds[jornada], sedeIds[sede], paz]
        );
        out.push({
          id: r.rows[0].id, programa: grupo.programa, semestre,
          jornada_id: jornadaIds[jornada], sede_id: sedeIds[sede],
          jornada_codigo: jornada, sede_codigo: sede, paz_y_salvo: paz,
        });
      }
    }
  }
  return out;
}

// Para cada materia abre los grupos que cubran las combinaciones
// (sede, jornada) que existan en la cohorte:
//   • semestre < umbral → grupos presenciales por sede+jornada
//   • semestre ≥ umbral → grupos virtuales por jornada (sede=NULL)
// Nombre del grupo siempre 'A' (paralelos B/C los abre la IA después).
async function seedGrupos(c, periodoActivoId, matMap, estudiantes, umbralVirtual, jornadaIds, sedeIds) {
  // Determinar qué (programa, semestre, sede, jornada) tiene estudiantes.
  const combos = new Set();
  for (const e of estudiantes) {
    if (!e.paz_y_salvo) continue;
    combos.add(`${e.programa}|${e.semestre}|${e.sede_codigo}|${e.jornada_codigo}`);
  }

  // También necesitamos grupos para semestres ANTERIORES (historial aprobado).
  // Para cada estudiante con sem N, los semestres 1..N-1 deben existir como grupo
  // de alguna combinación; usamos la sede+jornada del propio estudiante.
  for (const e of estudiantes) {
    for (let s = 1; s < e.semestre; s++) {
      combos.add(`${e.programa}|${s}|${e.sede_codigo}|${e.jornada_codigo}`);
    }
  }

  const todasMat = [
    ...MATERIAS_IS.map((m) => ['IS', ...m]),
    ...MATERIAS_IE.map((m) => ['IE', ...m]),
  ];

  const creados = []; // { id, programa, semestre, materia_codigo, sede_id, jornada_id, modalidad }
  // Para evitar grupos virtuales duplicados (sede_id NULL) por jornada.
  const yaCreado = new Set();

  for (const [prog, codigo, , semestre] of todasMat) {
    // ¿Hay alguna combinación con estudiantes activos para esta (prog, sem)?
    const combosPorSem = [...combos].filter((k) => k.startsWith(`${prog}|${semestre}|`));
    if (combosPorSem.length === 0) continue;

    if (semestre >= umbralVirtual) {
      // Grupos virtuales por jornada (no por sede).
      const jornadasNecesarias = new Set(combosPorSem.map((k) => k.split('|')[3]));
      for (const jornadaCod of jornadasNecesarias) {
        const key = `${codigo}|virtual|${jornadaCod}`;
        if (yaCreado.has(key)) continue;
        yaCreado.add(key);
        const r = await c.query(
          `INSERT INTO grupos (materia_id,periodo_id,numero,cupo_max,jornada_id,sede_id,modalidad,estado)
           VALUES ($1,$2,'A',60,$3,NULL,'virtual','abierto') RETURNING id`,
          [matMap[codigo], periodoActivoId, jornadaIds[jornadaCod]]
        );
        creados.push({
          id: r.rows[0].id, programa: prog, semestre, codigo,
          sede_codigo: null, jornada_codigo: jornadaCod, modalidad: 'virtual',
        });
      }
    } else {
      // Grupos presenciales por (sede, jornada) según se necesite.
      const sedeJornadas = new Set(combosPorSem.map((k) => {
        const [, , sede, jornada] = k.split('|');
        return `${sede}|${jornada}`;
      }));
      for (const sj of sedeJornadas) {
        const [sedeCod, jornadaCod] = sj.split('|');
        // Cupo según número estimado: si > 30 va a aforo 60; aquí abrimos 30 por defecto.
        const r = await c.query(
          `INSERT INTO grupos (materia_id,periodo_id,numero,cupo_max,jornada_id,sede_id,modalidad,estado)
           VALUES ($1,$2,'A',30,$3,$4,'presencial','abierto') RETURNING id`,
          [matMap[codigo], periodoActivoId, jornadaIds[jornadaCod], sedeIds[sedeCod]]
        );
        creados.push({
          id: r.rows[0].id, programa: prog, semestre, codigo,
          sede_codigo: sedeCod, jornada_codigo: jornadaCod, modalidad: 'presencial',
        });
      }
    }
  }
  return creados;
}

async function seedInscripciones(c, estudiantes, grupos, umbralVirtual) {
  // Desactiva trigger para meter historial sin chocar con prereqs.
  await c.query(`ALTER TABLE inscripciones DISABLE TRIGGER trg_check_inscripcion`);
  try {
    // Index grupos por (programa, semestre, sede_codigo, jornada_codigo)
    // y por (programa, semestre, virtual, jornada_codigo).
    const idx = {};
    for (const g of grupos) {
      const key = g.modalidad === 'virtual'
        ? `${g.programa}|${g.semestre}|VIRTUAL|${g.jornada_codigo}`
        : `${g.programa}|${g.semestre}|${g.sede_codigo}|${g.jornada_codigo}`;
      (idx[key] = idx[key] || []).push(g);
    }

    let activas = 0, aprobadas = 0;
    for (const e of estudiantes) {
      // Histórico (aprobada) de semestres anteriores
      for (let s = 1; s < e.semestre; s++) {
        const k1 = s >= umbralVirtual
          ? `${e.programa}|${s}|VIRTUAL|${e.jornada_codigo}`
          : `${e.programa}|${s}|${e.sede_codigo}|${e.jornada_codigo}`;
        const lista = idx[k1] || [];
        for (const g of lista) {
          await c.query(
            `INSERT INTO inscripciones (estudiante_id,grupo_id,estado)
             VALUES ($1,$2,'aprobada') ON CONFLICT DO NOTHING`,
            [e.id, g.id]
          );
          aprobadas++;
        }
      }
      // Activas: semestre actual, solo si paz_y_salvo
      if (e.paz_y_salvo) {
        const k2 = e.semestre >= umbralVirtual
          ? `${e.programa}|${e.semestre}|VIRTUAL|${e.jornada_codigo}`
          : `${e.programa}|${e.semestre}|${e.sede_codigo}|${e.jornada_codigo}`;
        const lista = idx[k2] || [];
        for (const g of lista) {
          await c.query(
            `INSERT INTO inscripciones (estudiante_id,grupo_id,estado)
             VALUES ($1,$2,'activa') ON CONFLICT DO NOTHING`,
            [e.id, g.id]
          );
          activas++;
        }
      }
    }
    return { activas, aprobadas };
  } finally {
    await c.query(`ALTER TABLE inscripciones ENABLE TRIGGER trg_check_inscripcion`);
  }
}

async function reportar(c) {
  const q = async (sql) => (await c.query(sql)).rows[0].n;
  const stats = {
    sedes:            await q(`SELECT COUNT(*)::INT n FROM sedes`),
    programas:        await q(`SELECT COUNT(*)::INT n FROM programas`),
    materias:         await q(`SELECT COUNT(*)::INT n FROM materias`),
    prerequisitos:    await q(`SELECT COUNT(*)::INT n FROM prerequisitos`),
    salones_30:       await q(`SELECT COUNT(*)::INT n FROM salones WHERE capacidad=30`),
    salones_60:       await q(`SELECT COUNT(*)::INT n FROM salones WHERE capacidad=60`),
    docentes_TC:      await q(`SELECT COUNT(*)::INT n FROM docentes WHERE tipo='TC'`),
    docentes_MT:      await q(`SELECT COUNT(*)::INT n FROM docentes WHERE tipo='MT'`),
    disponibilidades: await q(`SELECT COUNT(*)::INT n FROM disponibilidad_docente`),
    estudiantes_IS:   await q(`SELECT COUNT(*)::INT n FROM estudiantes e JOIN programas p ON p.id=e.programa_id WHERE p.codigo='IS'`),
    estudiantes_IE:   await q(`SELECT COUNT(*)::INT n FROM estudiantes e JOIN programas p ON p.id=e.programa_id WHERE p.codigo='IE'`),
    paz_y_salvo:      await q(`SELECT COUNT(*)::INT n FROM estudiantes WHERE paz_y_salvo`),
    grupos_pres:      await q(`SELECT COUNT(*)::INT n FROM grupos WHERE modalidad='presencial'`),
    grupos_virt:      await q(`SELECT COUNT(*)::INT n FROM grupos WHERE modalidad='virtual'`),
    activas:          await q(`SELECT COUNT(*)::INT n FROM inscripciones WHERE estado='activa'`),
    aprobadas:        await q(`SELECT COUNT(*)::INT n FROM inscripciones WHERE estado='aprobada'`),
  };
  console.log('✓ Seed completo:');
  Object.entries(stats).forEach(([k, v]) =>
    console.log(`   • ${k.padEnd(18)} = ${v}`)
  );
}

(async () => {
  try {
    await withTransaction(async (c) => {
      console.log('▸ Truncando tablas...');
      await truncarTodo(c);

      const umbralVirtual = await leerUmbralVirtual(c);
      console.log(`▸ Umbral semestre virtual = ${umbralVirtual}`);

      console.log('▸ Sedes y programas...');
      const sedeIds = await seedSedes(c);
      const progIds = await seedProgramas(c);

      console.log('▸ Materias y prerequisitos...');
      const matMap = await seedMaterias(c, progIds, umbralVirtual);
      await seedPrerequisitos(c, matMap);

      console.log('▸ Salones (aforos 30 y 60)...');
      await seedSalones(c, sedeIds);

      console.log('▸ Docentes (TC 40h / MT 20h)...');
      const docentes = await seedDocentes(c);

      const { rows: per } = await c.query(
        `SELECT id FROM periodos_academicos WHERE activo = TRUE`
      );
      if (per.length === 0) {
        throw new Error('No hay periodo activo. Ejecuta seed-periodos.js primero.');
      }
      const periodoActivoId = per[0].id;
      await seedDisponibilidad(c, periodoActivoId, docentes);

      const jornadaIds = Object.fromEntries(
        (await c.query(`SELECT id, codigo FROM jornadas`)).rows.map((r) => [r.codigo, r.id])
      );

      console.log('▸ Estudiantes (55 = 28 IS + 27 IE)...');
      const estudiantes = await seedEstudiantes(c, progIds, sedeIds, jornadaIds);

      console.log('▸ Grupos (presencial por sede×jornada / virtual ≥ umbral)...');
      const grupos = await seedGrupos(c, periodoActivoId, matMap, estudiantes,
                                       umbralVirtual, jornadaIds, sedeIds);
      console.log(`   grupos abiertos = ${grupos.length}`);

      console.log('▸ Inscripciones (historial aprobado + activas del semestre actual)...');
      const insc = await seedInscripciones(c, estudiantes, grupos, umbralVirtual);
      console.log(`   activas=${insc.activas}  aprobadas=${insc.aprobadas}`);

      console.log('▸ Reporte:');
      await reportar(c);
    });
  } catch (e) {
    console.error('✗ seed-horarios falló:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
