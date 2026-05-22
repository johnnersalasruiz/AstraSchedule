# Entregable — Módulo 2: Base de Datos Funcional y Scripts de Carga Dinámicos

**Proyecto:** Agente de Optimización de Horarios — Facultad de Ingeniería UNIAJC
**Alcance:** Capa de datos PostgreSQL parametrizable para los programas de Ingeniería de Sistemas e Ingeniería Electrónica
**Componentes entregados:** Esquema relacional, triggers de validación, scripts de carga (seeds), validador de integridad
**Stack:** PostgreSQL 14+ · Node.js 18+ (módulos ES) · driver `pg`

---

## 1. Resumen ejecutivo

Este entregable cubre los requerimientos RF-01 (ingreso de datos) y RF-03 (validaciones duras) del Módulo 2. La base de datos modela el universo del problema definido en el spec del curso —dos sedes, dos jornadas, bloques fijos de tres horas, modalidad virtual desde séptimo semestre y carga contractual TC/MT— sin perder capacidad de extensión: añadir un nuevo bloque, una sede adicional o cambiar el umbral de virtualidad se hace con datos, no con migraciones de esquema.

La carga se realiza con tres scripts secuenciales (`seed:periodos`, `seed:reglas`, `seed:horarios`) que son **dinámicos** en dos sentidos: están parametrizados desde tablas maestras (catálogos) y son **idempotentes** —se pueden re-ejecutar sobre la misma base sin generar datos duplicados ni dejar registros huérfanos—. Un cuarto script (`validate`) ejecuta veinticinco verificaciones de integridad y reglas de negocio, y retorna un código de salida distinto de cero si encuentra problemas críticos.

---

## 2. Requisitos previos

| Componente | Versión mínima | Verificación |
|---|---|---|
| PostgreSQL | 14 | `psql --version` |
| Node.js | 18 | `node --version` |
| npm | 9 | `npm --version` |
| Cliente Postgres con permisos para `CREATE DATABASE` | — | El usuario configurado en `.env` debe poder crear bases |

> **Nota:** El servicio de PostgreSQL debe estar corriendo antes de iniciar la ejecución. En Windows verificar en *Services* que `postgresql-x64-14` (o la versión instalada) esté en estado *Running*.

---

## 3. Paso a paso de ejecución

### 3.1 Clonar / ubicar el proyecto

```powershell
cd "C:\Users\David\Documents\Modulo 2\Modulo 2"
```

### 3.2 Instalar dependencias

```powershell
npm install
```

Esto descarga `pg` y `dotenv`. Las dependencias quedan en `node_modules/` y `package-lock.json`.

### 3.3 Configurar las credenciales de PostgreSQL

Copiar la plantilla `.env.example` a `.env` y ajustar:

```powershell
Copy-Item .env.example .env
```

Contenido por defecto:

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=uniajc_horarios
```

Editar `PGPASSWORD` (y demás campos) con los valores reales del entorno.

### 3.4 Ejecutar el pipeline completo

Forma corta (recomendada para entrega y demo):

```powershell
npm run bootstrap
```

Este comando ejecuta en orden:

1. `npm run db:reset` — elimina y recrea la base `uniajc_horarios`, aplica `01-schema.sql` y `02-triggers.sql`.
2. `npm run seed:periodos` — carga periodos académicos, jornadas, bloques maestros y franjas.
3. `npm run seed:reglas` — carga las reglas configurables del motor.
4. `npm run seed:horarios` — carga sedes, programas, materias, prerequisitos, salones, docentes, estudiantes, grupos e inscripciones.
5. `npm run validate` — ejecuta los 25 checks de integridad y reglas de negocio.

### 3.5 Ejecución paso a paso (alternativa para auditoría)

Si se desea revisar la salida de cada etapa por separado:

```powershell
npm run db:setup        # crea BD si no existe; NO reinicia (usar db:reset si ya hay datos)
npm run seed:periodos
npm run seed:reglas
npm run seed:horarios
npm run validate
```

### 3.6 Salida esperada del validador

Al finalizar `npm run validate` se debe ver un bloque similar a:

```
🔍 Validando integridad contra spec Módulo 2...

  ✓ Hay exactamente 1 periodo activo  (1)
  ✓ Jornadas del spec presentes (diurna, nocturna)  (2)
  ✓ Bloques del spec presentes (D1, D2, D3, N1)  (4)
  ✓ Bloques diurnos son de 3 horas exactas  (3)
  ✓ Bloque N1 es 18:30-21:30 (3h)  (1)
  ✓ Franjas del periodo activo cubren 4 bloques × 5 días  (20)
  ✓ Sedes Norte y Sur presentes  (2)
  ✓ Programas IS e IE presentes  (2)
  ...
📊 RESUMEN DE LA BASE DE DATOS
──────────────────────────────────────────────────
  sedes                       2
  programas                   2
  materias                  106
  ...
──────────────────────────────────────────────────
Total: 25 ok, 0 advertencias, 0 críticos
```

Un `Total` con cero críticos confirma que la BD cumple las reglas duras del spec.

---

## 4. Estructura de la base de datos

### 4.1 Tablas (17 en total)

| Categoría | Tablas |
|---|---|
| **Catálogos institucionales** | `sedes`, `programas`, `materias`, `prerequisitos`, `salones`, `docentes` |
| **Catálogos temporales** | `periodos_academicos`, `jornadas`, `bloques_horarios`, `franjas_horarias` |
| **Población** | `estudiantes` |
| **Operación** | `disponibilidad_docente`, `grupos`, `inscripciones`, `horario_asignado`, `conflictos_detectados` |
| **Configuración** | `reglas_configurables` |

### 4.2 Diagrama lógico (texto)

```
sedes ─┬─< salones
       └─< estudiantes              programas ─< materias ─< prerequisitos
                                                  │
jornadas ─< bloques_horarios            estudiantes ─< inscripciones >─ grupos >─ materias
              │                                                            │
              └─< franjas_horarias  >─< disponibilidad_docente >─ docentes
                          │                                          │
                          └────────< horario_asignado >──────────────┘
                                       │
                                       └─< conflictos_detectados

reglas_configurables  (leído por triggers y motor IA — no FK directa)
```

### 4.3 Decisión clave: bloques como catálogo

El núcleo de la escalabilidad es la tabla `bloques_horarios`. En vez de hard-codear que existen exactamente cuatro bloques de tres horas, el sistema los lee como filas:

```sql
SELECT codigo, hora_inicio, hora_fin, orden FROM bloques_horarios ORDER BY orden;
-- D1 | 07:00 | 10:00 | 1
-- D2 | 10:00 | 13:00 | 2
-- D3 | 14:00 | 17:00 | 3
-- N1 | 18:30 | 21:30 | 4
```

Para agregar un bloque vespertino nuevo (`D4 17:00-20:00`) basta con un `INSERT` en esta tabla. Los triggers, los seeds y el validador lo recogen automáticamente.

---

## 5. Reglas duras implementadas (RF-03)

Cada restricción se enforce vía trigger `BEFORE INSERT OR UPDATE`. Si se viola, la inserción aborta con un `RAISE EXCEPTION` etiquetado.

| Regla | Tabla objetivo | Función PL/pgSQL | Etiqueta de error |
|---|---|---|---|
| Cero solapamiento de salón | `horario_asignado` | `fn_check_solapamiento_salon` | `SOLAPAMIENTO_SALON` |
| Cero solapamiento de docente | `horario_asignado` | `fn_check_solapamiento_docente` | `SOLAPAMIENTO_DOCENTE` |
| Cero solapamiento de estudiante | `horario_asignado` | `fn_check_solapamiento_estudiantes` | `SOLAPAMIENTO_ESTUDIANTE` |
| Aforo del salón (con tolerancia) | `horario_asignado` | `fn_check_capacidad_salon` | `CAPACIDAD_EXCEDIDA` |
| Compatibilidad de tipo de aula | `horario_asignado` | `fn_check_compatibilidad_salon` | `AULA_INCOMPATIBLE` |
| Disponibilidad del docente | `horario_asignado` | `fn_check_disponibilidad_docente` | `DOCENTE_NO_DISPONIBLE` |
| Jornada del docente vs bloque | `horario_asignado` | `fn_check_jornada_docente` | `JORNADA_DOCENTE_INCOMPATIBLE` |
| Jornada del grupo vs bloque | `horario_asignado` | `fn_check_jornada_grupo_bloque` | `JORNADA_INCOMPATIBLE` |
| Carga semanal (TC 40h / MT 20h) | `horario_asignado` | `fn_check_carga_docente` | `CARGA_DOCENTE_EXCEDIDA` |
| Traslado entre sedes en bloques consecutivos | `horario_asignado` | `fn_check_traslado_sede_docente` | `TRASLADO_SEDE_DOCENTE` |
| Modalidad virtual obligatoria ≥ umbral | `grupos` | `fn_check_modalidad_virtual_semestre` | `MODALIDAD_VIRTUAL_REQUERIDA` |
| Grupo C virtual sólo con autorización | `grupos` | `fn_check_grupo_c_autorizado` | `GRUPO_C_SIN_AUTORIZACION` |
| Paz y salvo del estudiante | `inscripciones` | `fn_check_inscripcion` | `SIN_PAZ_Y_SALVO` |
| Prerequisitos cumplidos | `inscripciones` | `fn_check_inscripcion` | `PREREQUISITO_NO_CUMPLIDO` |
| Jornada estudiante vs grupo | `inscripciones` | `fn_check_inscripcion` | `JORNADA_INCOMPATIBLE` |
| Sede estudiante vs grupo | `inscripciones` | `fn_check_inscripcion` | `SEDE_ESTUDIANTE_INCOMPATIBLE` |

### Excepciones modeladas

- **Inscripción cruzando sede:** `inscripciones.es_excepcion = TRUE` desactiva el check de sede (caso "matricularse en otra sede por materia extra o excepción autorizada").
- **Materia virtual ≥ 7° semestre:** El grupo se crea con `modalidad='virtual'` y `sede_id=NULL`; estudiantes de Norte y Sur pueden inscribirse al mismo grupo sin ser excepción.
- **Grupo C virtual:** Sólo aceptado si `requiere_autorizacion=TRUE`, representando la aprobación del decano cuando los grupos A y B están llenos.

---

## 6. Reglas configurables (parametrización del motor)

Estas reglas viven en `reglas_configurables` y pueden modificarse en runtime desde la UI sin recompilar nada. Los triggers las leen vía las funciones helper `fn_regla_bool`, `fn_regla_int`, `fn_regla_decimal`, `fn_regla_text`.

| Clave | Valor por defecto | Función |
|---|---|---|
| `capacidad_tolerancia` | `1.0` | Multiplicador sobre `salones.capacidad` (1.10 = 10% sobrecupo permitido) |
| `min_estudiantes_por_grupo` | `8` | Cupo mínimo para abrir un grupo |
| `requiere_paz_y_salvo` | `true` | Bloquea inscripción sin paz y salvo |
| `validar_prerequisitos` | `true` | Bloquea inscripción si faltan prerequisitos aprobados |
| `umbral_semestre_virtual` | `7` | Desde este semestre los grupos son virtuales (compartidos entre sedes) |
| `carga_default_TC` | `40` | Horas semanales por defecto al crear un TC nuevo |
| `carga_default_MT` | `20` | Horas semanales por defecto al crear un MT nuevo |
| `permitir_clases_consecutivas` | `true` | Permite que un docente tenga bloques seguidos en la misma sede |
| `estrategia_asignacion` | `"greedy_disponibilidad"` | Estrategia del agente IA |
| `reintentos_max` | `3` | Veces que el agente reintenta una asignación |
| `permitir_edicion_manual` | `true` | Habilita mover clases desde la UI |
| `requiere_confirmacion_manual` | `true` | Cambios manuales quedan en estado `propuesto` |

---

## 7. Escalabilidad

El sistema fue diseñado para que cambios típicos sean operaciones de datos, no de esquema:

| Cambio futuro | Operación necesaria |
|---|---|
| Agregar un nuevo bloque horario (p. ej. `D4 17:00-20:00`) | `INSERT INTO bloques_horarios ...` |
| Una materia dura 6 horas en vez de 3 | Ajustar `materias.horas_semana`; el motor abre 2 bloques en lugar de 1 |
| Una materia dura 1.5 horas | Crear un nuevo bloque maestro con esa duración e insertar franjas |
| Cambiar el umbral de virtualidad a 6° o 8° semestre | `UPDATE reglas_configurables SET valor='6' WHERE clave='umbral_semestre_virtual'` |
| Abrir grupo C virtual de una materia | `INSERT INTO grupos (..., numero='C', modalidad='virtual', requiere_autorizacion=TRUE)` |
| Habilitar tolerancia de aforo del 10% para periodo crítico | `UPDATE reglas_configurables SET valor='1.10' WHERE clave='capacidad_tolerancia'` |
| Agregar una tercera sede | `INSERT INTO sedes` + crear salones; los triggers la recogen automáticamente |
| Cambiar la carga máxima de un docente específico | `UPDATE docentes SET carga_max_horas=... WHERE id=...` |

El esquema no contiene constantes literales del spec (3 horas, 2 sedes, 7° semestre, 40/20 horas): todo vive como datos.

---

## 8. Validación y criterios de aceptación

### 8.1 Criterios duros (deben pasar para aceptar el entregable)

El script `npm run validate` debe finalizar con `0 críticos`. Los siguientes checks son críticos:

- Existe exactamente un periodo académico activo.
- Las jornadas `diurna` y `nocturna` están registradas (y sólo esas dos).
- Los bloques `D1`, `D2`, `D3`, `N1` están registrados con la duración exacta del spec.
- El bloque `N1` está parametrizado con horario `18:30-21:30`.
- Las franjas del periodo activo cubren los cuatro bloques en los cinco días hábiles (20 filas).
- Las sedes `NORTE` y `SUR` existen.
- Los programas `IS` e `IE` existen.
- Las cuatro reglas configurables clave existen (`capacidad_tolerancia`, `requiere_paz_y_salvo`, `validar_prerequisitos`, `umbral_semestre_virtual`).

### 8.2 Criterios blandos (advertencias, no bloquean)

- No hay grupos virtuales con sede asignada.
- No hay grupos presenciales sin sede.
- No hay materias ≥ umbral con grupos no-virtuales.
- No hay inscripciones cruzando sede sin excepción.
- No hay traslados de docente entre sedes en bloques consecutivos.
- Cero solapamientos en `horario_asignado` (relevante una vez el motor de asignación empiece a llenar la tabla).

### 8.3 Cobertura del seed

| Entidad | Cantidad esperada |
|---|---|
| Sedes | 2 |
| Programas | 2 (IS, IE) |
| Materias | 56 (IS) + 50 (IE) = 106 |
| Prerequisitos | ~80 |
| Bloques horarios | 4 |
| Franjas por periodo | 20 (4 bloques × 5 días) |
| Salones | 32 (16 aforo 30 + 8 aforo 60 presenciales + 4 laboratorios + 4 virtuales) |
| Docentes | 10 (4 TC + 6 MT) |
| Estudiantes | 55 (28 IS + 27 IE) |
| Inscripciones activas | ~250 (varía según paz y salvo aleatorio) |
| Inscripciones aprobadas (historial) | ~1.500 |

---

## 9. Estructura del repositorio

```
Modulo 2/
├── package.json                  Scripts npm y dependencias
├── .env.example                  Plantilla de credenciales (copiar a .env)
├── ENTREGABLE-MODULO-2.md        Este documento
├── db/
│   ├── 01-schema.sql             Tablas, índices, constraints (17 tablas)
│   └── 02-triggers.sql           Funciones PL/pgSQL + triggers (16 reglas)
├── scripts/
│   ├── db.js                     Pool de conexiones + helpers de transacción
│   ├── setup-db.js               Crea BD y aplica schema + triggers
│   └── validate-integrity.js     25 checks de integridad y reglas
└── seed/
    ├── seed-periodos.js          Periodos, jornadas, bloques, franjas
    ├── seed-reglas.js            Reglas configurables del motor
    └── seed-horarios.js          Sedes, programas, materias, salones,
                                  docentes, estudiantes, grupos, inscripciones
```

---

## 10. Comandos de referencia rápida

| Acción | Comando |
|---|---|
| Verificar versión de Postgres | `psql --version` |
| Verificar versión de Node | `node --version` |
| Instalar dependencias | `npm install` |
| Crear BD + esquema + triggers | `npm run db:setup` |
| Reset destructivo (drop + recreate) | `npm run db:reset` |
| Cargar parametrización temporal | `npm run seed:periodos` |
| Cargar reglas del motor | `npm run seed:reglas` |
| Cargar datos institucionales | `npm run seed:horarios` |
| Cargar todo (orden correcto) | `npm run seed:all` |
| Validar integridad | `npm run validate` |
| Pipeline completo (demo) | `npm run bootstrap` |
| Conectar con psql para inspección | `psql -U postgres -d uniajc_horarios` |

---

## 11. Anexo A — Catálogo de tablas

### sedes
Sedes físicas. Norte y Sur según spec.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| codigo | VARCHAR(10) UNIQUE | `NORTE`, `SUR` |
| nombre | VARCHAR(100) | |
| direccion | TEXT | |

### programas
Programas académicos. Cada uno tiene un total de semestres configurable.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| codigo | VARCHAR(10) UNIQUE | `IS`, `IE` |
| nombre | VARCHAR(150) | |
| total_semestres | INTEGER | IS=10, IE=9 |

### materias
Pénsum completo de cada programa.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| codigo | VARCHAR(20) UNIQUE | `IS-101`, `IE-403`, etc. |
| nombre | VARCHAR(200) | |
| programa_id | FK → programas | |
| semestre | INTEGER 1–12 | |
| creditos | INTEGER > 0 | |
| horas_semana | INTEGER > 0 | El motor traduce horas → bloques |
| tipo_aula_requerida | ENUM textual | `presencial`/`laboratorio`/`virtual`/`cualquiera` |
| activa | BOOLEAN | Para retiros de pénsum |

### bloques_horarios
**Catálogo maestro escalable.** El corazón del modelo de tiempo.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| codigo | VARCHAR(10) UNIQUE | `D1`, `D2`, `D3`, `N1` (extensible) |
| nombre | VARCHAR(50) | |
| jornada_id | FK → jornadas | Cada bloque pertenece a una jornada |
| hora_inicio | TIME | |
| hora_fin | TIME | `hora_fin > hora_inicio` |
| orden | INTEGER | Para detectar bloques consecutivos |

### franjas_horarias
Producto cartesiano `(periodo, bloque, día)`.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| periodo_id | FK → periodos_academicos | |
| bloque_id | FK → bloques_horarios | |
| dia | ENUM textual | `Lunes` a `Domingo` |

### grupos
Secciones que se abren por periodo.

| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| materia_id | FK | |
| periodo_id | FK | |
| numero | VARCHAR(10) | `A`, `B`, `C`, ... |
| cupo_max | INTEGER > 0 | |
| jornada_id | FK | |
| sede_id | FK NULL | `NULL` ⇔ virtual |
| modalidad | ENUM textual | `presencial` / `virtual` |
| requiere_autorizacion | BOOLEAN | `TRUE` obligatorio para grupos C virtuales |
| estado | ENUM textual | `abierto`/`cerrado`/`cancelado` |

> **Unique index:** `(materia_id, periodo_id, jornada_id, modalidad, COALESCE(sede_id,0), numero)` permite grupos paralelos A/B/C dentro de cada combinación sin colisión.

### Otras tablas
`prerequisitos`, `salones`, `docentes`, `periodos_academicos`, `jornadas`, `disponibilidad_docente`, `estudiantes`, `inscripciones`, `horario_asignado`, `conflictos_detectados`, `reglas_configurables`. Ver `db/01-schema.sql` para definición completa.

---

## 12. Anexo B — Comportamiento del seed

### Idempotencia

Los seeds son seguros de re-ejecutar:

- `seed:periodos` usa `INSERT ... ON CONFLICT DO UPDATE` para periodos/jornadas y borra+recarga bloques y franjas.
- `seed:reglas` hace `INSERT ... ON CONFLICT DO UPDATE WHERE modificable = TRUE`.
- `seed:horarios` ejecuta `TRUNCATE ... RESTART IDENTITY CASCADE` al inicio y opera dentro de una transacción.

Si alguna etapa falla, el `withTransaction` hace `ROLLBACK` automático y la base queda en su estado anterior.

### Reproducibilidad

`seed-horarios.js` usa un PRNG con semilla fija (`SEED = 42`), por lo que dos ejecuciones consecutivas producen exactamente los mismos estudiantes, las mismas asignaciones de jornada y los mismos códigos de matrícula. Esto es crítico para que el equipo y los revisores trabajen sobre datos idénticos.

### Manejo de historial académico

Para que el trigger `fn_check_inscripcion` permita inscribir a un estudiante en una materia con prerequisitos, las materias previas deben estar en `inscripciones` con `estado='aprobada'`. El seed:

1. Desactiva temporalmente `trg_check_inscripcion`.
2. Inserta una fila `aprobada` por cada materia de cada semestre anterior al actual del estudiante.
3. Re-activa el trigger.
4. Inserta las `activas` del semestre actual —que sí pasan por el trigger y validan paz y salvo + prerequisitos.

---

## 13. Anexo C — Casos de prueba sugeridos para la sustentación

Para demostrar que las reglas duras funcionan, intentar las siguientes inserciones manuales contra la BD cargada y verificar que el motor rechace con la etiqueta esperada:

```sql
-- 1. Docente nocturno asignado a bloque diurno → JORNADA_DOCENTE_INCOMPATIBLE
INSERT INTO horario_asignado (grupo_id, docente_id, salon_id, franja_id)
SELECT g.id, d.id, s.id, f.id
FROM grupos g, docentes d, salones s, franjas_horarias f
JOIN bloques_horarios b ON b.id = f.bloque_id
WHERE d.disponibilidad='Nocturna' AND b.codigo='D1' LIMIT 1;

-- 2. Estudiante de Sur inscrito en grupo presencial Norte sin excepción → SEDE_ESTUDIANTE_INCOMPATIBLE
INSERT INTO inscripciones (estudiante_id, grupo_id, estado, es_excepcion)
SELECT e.id, g.id, 'activa', FALSE
FROM estudiantes e, grupos g, sedes sN, sedes sS
WHERE e.sede_id=sS.id AND sS.codigo='SUR'
  AND g.sede_id=sN.id AND sN.codigo='NORTE'
  AND g.modalidad='presencial' LIMIT 1;

-- 3. Materia de 8° semestre en grupo presencial → MODALIDAD_VIRTUAL_REQUERIDA
INSERT INTO grupos (materia_id, periodo_id, numero, cupo_max, jornada_id, sede_id, modalidad)
SELECT m.id, p.id, 'X', 30, j.id, s.id, 'presencial'
FROM materias m, periodos_academicos p, jornadas j, sedes s
WHERE m.semestre=8 AND p.activo AND j.codigo='diurna' AND s.codigo='NORTE' LIMIT 1;

-- 4. Grupo C virtual sin autorización → GRUPO_C_SIN_AUTORIZACION
INSERT INTO grupos (materia_id, periodo_id, numero, cupo_max, jornada_id, sede_id, modalidad, requiere_autorizacion)
SELECT m.id, p.id, 'C', 60, j.id, NULL, 'virtual', FALSE
FROM materias m, periodos_academicos p, jornadas j
WHERE m.semestre=7 AND p.activo AND j.codigo='diurna' LIMIT 1;
```

Cada uno debe devolver `ERROR: P0001` con el código de regla correspondiente.

---

## 14. Glosario

| Término | Definición |
|---|---|
| **Bloque** | Unidad de tiempo de tres horas con código fijo (`D1`, `D2`, `D3`, `N1`). |
| **Franja** | Combinación de un bloque con un día y un periodo. Es la unidad asignable de horario. |
| **Jornada** | Agrupación de bloques: Diurna (D1–D3) o Nocturna (N1). |
| **Modalidad** | Atributo del grupo: `presencial` (atado a una sede) o `virtual` (sin sede física, abierto a estudiantes de ambas sedes). |
| **Paz y salvo** | Bandera del estudiante; sin ella no puede inscribir asignaturas. |
| **TC / MT** | Tipos de contratación docente: Tiempo Completo (40 h/sem) y Medio Tiempo (20 h/sem). |
| **Umbral de virtualidad** | Semestre desde el cual las materias se dictan en modalidad virtual (configurable; default 7°). |
| **Trigger** | Función PL/pgSQL que se ejecuta antes de un INSERT o UPDATE para validar reglas. |
| **Seed** | Script de carga que pobla tablas con datos institucionales. |

---

**Fin del entregable. Para dudas técnicas, revisar los archivos `db/02-triggers.sql` (reglas) y `seed/seed-horarios.js` (cohorte simulada).**
