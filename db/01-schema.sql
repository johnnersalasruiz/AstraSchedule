-- ════════════════════════════════════════════════════════════════
-- UNIAJC — Agente de Optimización de Horarios
-- Esquema PostgreSQL alineado con el spec del Módulo 2:
--   • Sedes Norte / Sur con estudiante adscrito
--   • Jornadas Diurna / Nocturna (sin sabatina)
--   • Bloques de 3 h (D1/D2/D3/N1) como CATÁLOGO escalable
--   • Modalidad virtual ≥ umbral_semestre (configurable)
--   • Docentes TC (40h) / MT (20h)
-- ════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS conflictos_detectados   CASCADE;
DROP TABLE IF EXISTS horario_asignado        CASCADE;
DROP TABLE IF EXISTS inscripciones           CASCADE;
DROP TABLE IF EXISTS grupos                  CASCADE;
DROP TABLE IF EXISTS disponibilidad_docente  CASCADE;
DROP TABLE IF EXISTS franjas_horarias        CASCADE;
DROP TABLE IF EXISTS bloques_horarios        CASCADE;
DROP TABLE IF EXISTS jornadas                CASCADE;
DROP TABLE IF EXISTS periodos_academicos     CASCADE;
DROP TABLE IF EXISTS estudiantes             CASCADE;
DROP TABLE IF EXISTS docentes                CASCADE;
DROP TABLE IF EXISTS salones                 CASCADE;
DROP TABLE IF EXISTS prerequisitos           CASCADE;
DROP TABLE IF EXISTS materias                CASCADE;
DROP TABLE IF EXISTS programas               CASCADE;
DROP TABLE IF EXISTS sedes                   CASCADE;
DROP TABLE IF EXISTS reglas_configurables    CASCADE;

-- ────────────────────────────────────────────────────────────────
-- Sedes físicas (Norte, Sur).
-- Extensible: añadir un INSERT permite operar con N sedes.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE sedes (
  id        SERIAL PRIMARY KEY,
  codigo    VARCHAR(10) UNIQUE NOT NULL,
  nombre    VARCHAR(100) NOT NULL,
  direccion TEXT
);

-- ────────────────────────────────────────────────────────────────
-- Programas académicos (IS, IE; total_semestres parametrizado)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE programas (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(10) UNIQUE NOT NULL,
  nombre          VARCHAR(150) NOT NULL,
  total_semestres INTEGER NOT NULL CHECK (total_semestres BETWEEN 1 AND 12)
);

-- ────────────────────────────────────────────────────────────────
-- Materias del pénsum. horas_semana libre: el motor traduce
-- horas → número de bloques al asignar.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE materias (
  id                  SERIAL PRIMARY KEY,
  codigo              VARCHAR(20) UNIQUE NOT NULL,
  nombre              VARCHAR(200) NOT NULL,
  programa_id         INTEGER NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
  semestre            INTEGER NOT NULL CHECK (semestre BETWEEN 1 AND 12),
  creditos            INTEGER NOT NULL CHECK (creditos > 0),
  horas_semana        INTEGER NOT NULL CHECK (horas_semana > 0),
  tipo_aula_requerida VARCHAR(20) NOT NULL DEFAULT 'presencial'
    CHECK (tipo_aula_requerida IN ('presencial','laboratorio','virtual','cualquiera')),
  activa              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE prerequisitos (
  id              SERIAL PRIMARY KEY,
  materia_id      INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  prerequisito_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  UNIQUE (materia_id, prerequisito_id),
  CHECK (materia_id <> prerequisito_id)
);

-- ────────────────────────────────────────────────────────────────
-- Salones. capacidad es libre (entero positivo); el seed UNIAJC
-- usa 30/60 pero el esquema acepta cualquier aforo.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE salones (
  id         SERIAL PRIMARY KEY,
  codigo     VARCHAR(20) UNIQUE NOT NULL,
  sede_id    INTEGER NOT NULL REFERENCES sedes(id),
  tipo       VARCHAR(20) NOT NULL CHECK (tipo IN ('presencial','laboratorio','virtual')),
  capacidad  INTEGER NOT NULL CHECK (capacidad > 0),
  bloque     VARCHAR(30),
  disponible BOOLEAN NOT NULL DEFAULT TRUE
);

-- ────────────────────────────────────────────────────────────────
-- Docentes. TC/MT con carga_max_horas configurable por instancia.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE docentes (
  id                SERIAL PRIMARY KEY,
  identificacion    VARCHAR(20) UNIQUE NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  email             VARCHAR(150) UNIQUE NOT NULL,
  tipo              VARCHAR(10) NOT NULL CHECK (tipo IN ('TC','MT')),
  carga_max_horas   INTEGER NOT NULL CHECK (carga_max_horas > 0),
  disponibilidad    VARCHAR(20) NOT NULL DEFAULT 'Ambas'
    CHECK (disponibilidad IN ('Diurna','Nocturna','Ambas')),
  activo            BOOLEAN NOT NULL DEFAULT TRUE
);

-- ────────────────────────────────────────────────────────────────
-- Periodos académicos
-- ────────────────────────────────────────────────────────────────
CREATE TABLE periodos_academicos (
  id           SERIAL PRIMARY KEY,
  codigo       VARCHAR(10) UNIQUE NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (fecha_fin > fecha_inicio)
);

CREATE UNIQUE INDEX uq_periodo_activo
  ON periodos_academicos (activo)
  WHERE activo = TRUE;

-- ────────────────────────────────────────────────────────────────
-- Jornadas: Diurna y Nocturna
-- ────────────────────────────────────────────────────────────────
CREATE TABLE jornadas (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(20) UNIQUE NOT NULL,
  nombre      VARCHAR(50) NOT NULL,
  descripcion TEXT
);

-- ────────────────────────────────────────────────────────────────
-- Bloques horarios maestros (D1, D2, D3, N1, ...).
-- Catálogo escalable: añadir un D4 de 4 h sólo requiere un INSERT.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE bloques_horarios (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(10) UNIQUE NOT NULL,
  nombre      VARCHAR(50) NOT NULL,
  jornada_id  INTEGER NOT NULL REFERENCES jornadas(id),
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  orden       INTEGER NOT NULL,
  CHECK (hora_fin > hora_inicio),
  UNIQUE (jornada_id, orden)
);

-- ────────────────────────────────────────────────────────────────
-- Franja = (bloque maestro, día) por periodo.
-- Si se necesita un día más o un bloque nuevo, solo se inserta aquí.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE franjas_horarias (
  id         SERIAL PRIMARY KEY,
  periodo_id INTEGER NOT NULL REFERENCES periodos_academicos(id) ON DELETE CASCADE,
  bloque_id  INTEGER NOT NULL REFERENCES bloques_horarios(id),
  dia        VARCHAR(15) NOT NULL
    CHECK (dia IN ('Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo')),
  UNIQUE (periodo_id, bloque_id, dia)
);

CREATE TABLE disponibilidad_docente (
  id         SERIAL PRIMARY KEY,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  franja_id  INTEGER NOT NULL REFERENCES franjas_horarias(id) ON DELETE CASCADE,
  UNIQUE (docente_id, franja_id)
);

-- ────────────────────────────────────────────────────────────────
-- Estudiantes. sede_id NOT NULL es la regla del spec.
-- Para inscribirse en grupo de otra sede se usa inscripciones.es_excepcion.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE estudiantes (
  id                 SERIAL PRIMARY KEY,
  identificacion     VARCHAR(20) UNIQUE NOT NULL,
  codigo_estudiantil VARCHAR(20) UNIQUE NOT NULL,
  nombre             VARCHAR(100) NOT NULL,
  apellido           VARCHAR(100) NOT NULL,
  email              VARCHAR(150) UNIQUE NOT NULL,
  programa_id        INTEGER NOT NULL REFERENCES programas(id),
  semestre_actual    INTEGER NOT NULL CHECK (semestre_actual >= 1),
  jornada_id         INTEGER NOT NULL REFERENCES jornadas(id),
  sede_id            INTEGER NOT NULL REFERENCES sedes(id),
  paz_y_salvo        BOOLEAN NOT NULL DEFAULT FALSE,
  activo             BOOLEAN NOT NULL DEFAULT TRUE
);

-- ────────────────────────────────────────────────────────────────
-- Grupos. Modalidad = presencial (con sede) o virtual (sede NULL, mezcla).
-- requiere_autorizacion: TRUE para grupos C virtuales abiertos por decano.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE grupos (
  id                    SERIAL PRIMARY KEY,
  materia_id            INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  periodo_id            INTEGER NOT NULL REFERENCES periodos_academicos(id) ON DELETE CASCADE,
  numero                VARCHAR(10) NOT NULL,
  cupo_max              INTEGER NOT NULL CHECK (cupo_max > 0),
  jornada_id            INTEGER NOT NULL REFERENCES jornadas(id),
  sede_id               INTEGER REFERENCES sedes(id),
  modalidad             VARCHAR(20) NOT NULL DEFAULT 'presencial'
                        CHECK (modalidad IN ('presencial','virtual')),
  requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE,
  estado                VARCHAR(20) NOT NULL DEFAULT 'abierto'
    CHECK (estado IN ('abierto','cerrado','cancelado')),
  CHECK (
    (modalidad = 'virtual'    AND sede_id IS NULL) OR
    (modalidad = 'presencial' AND sede_id IS NOT NULL)
  )
);
-- numero='A'/'B'/'C' es paralelo DENTRO de una combinación (materia, periodo,
-- jornada, modalidad, sede). Permite Grupo A presencial Norte + Grupo A virtual
-- viviendo en simultáneo sin colisión.
CREATE UNIQUE INDEX uq_grupo_combinacion
  ON grupos (materia_id, periodo_id, jornada_id, modalidad, COALESCE(sede_id, 0), numero);

-- ────────────────────────────────────────────────────────────────
-- Inscripciones. es_excepcion permite cruzar sedes (caso autorizado).
-- ────────────────────────────────────────────────────────────────
CREATE TABLE inscripciones (
  id                SERIAL PRIMARY KEY,
  estudiante_id     INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
  grupo_id          INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','retirada','aprobada','reprobada')),
  es_excepcion      BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_inscripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (estudiante_id, grupo_id)
);

CREATE TABLE horario_asignado (
  id              SERIAL PRIMARY KEY,
  grupo_id        INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  docente_id      INTEGER NOT NULL REFERENCES docentes(id),
  salon_id        INTEGER NOT NULL REFERENCES salones(id),
  franja_id       INTEGER NOT NULL REFERENCES franjas_horarias(id),
  estado          VARCHAR(20) NOT NULL DEFAULT 'propuesto'
    CHECK (estado IN ('propuesto','confirmado','conflicto','cancelado')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conflictos_detectados (
  id           SERIAL PRIMARY KEY,
  tipo         VARCHAR(40) NOT NULL CHECK (tipo IN (
    'aula_solapada','docente_solapado','estudiante_solapado',
    'capacidad_excedida','aula_incompatible','docente_no_disponible',
    'carga_docente_excedida','prerequisito_no_cumplido','sin_paz_y_salvo',
    'jornada_incompatible','sede_estudiante_incompatible','traslado_sede_docente',
    'modalidad_virtual_requerida','grupo_c_sin_autorizacion'
  )),
  descripcion  TEXT NOT NULL,
  horario_id   INTEGER REFERENCES horario_asignado(id) ON DELETE CASCADE,
  resuelto     BOOLEAN NOT NULL DEFAULT FALSE,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reglas_configurables (
  id             SERIAL PRIMARY KEY,
  clave          VARCHAR(60) UNIQUE NOT NULL,
  valor          TEXT NOT NULL,
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('boolean','integer','decimal','string','json')),
  descripcion    TEXT,
  modificable    BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- Índices
-- ────────────────────────────────────────────────────────────────
CREATE INDEX idx_horario_franja        ON horario_asignado(franja_id);
CREATE INDEX idx_horario_salon         ON horario_asignado(salon_id, franja_id);
CREATE INDEX idx_horario_docente       ON horario_asignado(docente_id, franja_id);
CREATE INDEX idx_horario_grupo         ON horario_asignado(grupo_id);
CREATE INDEX idx_inscripciones_grupo   ON inscripciones(grupo_id);
CREATE INDEX idx_inscripciones_estud   ON inscripciones(estudiante_id);
CREATE INDEX idx_grupos_periodo        ON grupos(periodo_id);
CREATE INDEX idx_grupos_sede           ON grupos(sede_id);
CREATE INDEX idx_materias_programa     ON materias(programa_id, semestre);
CREATE INDEX idx_franjas_periodo       ON franjas_horarias(periodo_id, bloque_id);
CREATE INDEX idx_disp_docente          ON disponibilidad_docente(docente_id);
CREATE INDEX idx_estudiantes_sede      ON estudiantes(sede_id, jornada_id);
CREATE INDEX idx_salones_sede_tipo     ON salones(sede_id, tipo);
