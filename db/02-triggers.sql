-- ════════════════════════════════════════════════════════════════
-- UNIAJC — Validaciones en tiempo real
-- Cubre las restricciones duras del spec Módulo 2:
--   • Cero solapamientos (salón/docente/estudiante)
--   • Aforo, compatibilidad de aula
--   • Disponibilidad y carga docente (TC=40h, MT=20h)
--   • Compatibilidad jornada ↔ bloque (Diurna→D*, Nocturna→N*)
--   • Sede estudiante ↔ sede grupo (excepción explícita)
--   • Traslado entre sedes con bloque libre intermedio
--   • Modalidad virtual obligatoria ≥ umbral_semestre_virtual
-- ════════════════════════════════════════════════════════════════

-- Helpers de lectura de reglas
CREATE OR REPLACE FUNCTION fn_regla_text(p_clave TEXT) RETURNS TEXT AS $$
  SELECT valor FROM reglas_configurables WHERE clave = p_clave;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_regla_bool(p_clave TEXT, p_default BOOLEAN DEFAULT TRUE) RETURNS BOOLEAN AS $$
  SELECT COALESCE((valor)::BOOLEAN, p_default)
  FROM reglas_configurables WHERE clave = p_clave;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_regla_decimal(p_clave TEXT, p_default NUMERIC DEFAULT 1.0) RETURNS NUMERIC AS $$
  SELECT COALESCE((valor)::NUMERIC, p_default)
  FROM reglas_configurables WHERE clave = p_clave;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_regla_int(p_clave TEXT, p_default INTEGER) RETURNS INTEGER AS $$
  SELECT COALESCE((valor)::INTEGER, p_default)
  FROM reglas_configurables WHERE clave = p_clave;
$$ LANGUAGE sql STABLE;

-- ────────────────────────────────────────────────────────────────
-- RF-03.a — Solapamiento de salones
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_solapamiento_salon() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM horario_asignado h
    WHERE h.salon_id  = NEW.salon_id
      AND h.franja_id = NEW.franja_id
      AND h.estado   <> 'cancelado'
      AND h.id       <> COALESCE(NEW.id, -1)
  ) THEN
    RAISE EXCEPTION 'SOLAPAMIENTO_SALON: salón % ocupado en franja %',
      NEW.salon_id, NEW.franja_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- RF-03.b — Solapamiento de docentes
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_solapamiento_docente() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM horario_asignado h
    WHERE h.docente_id = NEW.docente_id
      AND h.franja_id  = NEW.franja_id
      AND h.estado    <> 'cancelado'
      AND h.id        <> COALESCE(NEW.id, -1)
  ) THEN
    RAISE EXCEPTION 'SOLAPAMIENTO_DOCENTE: docente % tiene clase en franja %',
      NEW.docente_id, NEW.franja_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- RF-03.c — Solapamiento de estudiantes
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_solapamiento_estudiantes() RETURNS TRIGGER AS $$
DECLARE
  v_est_id INTEGER;
BEGIN
  SELECT i.estudiante_id INTO v_est_id
  FROM inscripciones i
  WHERE i.grupo_id = NEW.grupo_id
    AND i.estado   = 'activa'
    AND EXISTS (
      SELECT 1
      FROM inscripciones i2
      JOIN horario_asignado h2 ON h2.grupo_id = i2.grupo_id
      WHERE i2.estudiante_id = i.estudiante_id
        AND i2.estado        = 'activa'
        AND h2.franja_id     = NEW.franja_id
        AND h2.estado       <> 'cancelado'
        AND h2.grupo_id     <> NEW.grupo_id
        AND h2.id           <> COALESCE(NEW.id, -1)
    )
  LIMIT 1;

  IF v_est_id IS NOT NULL THEN
    RAISE EXCEPTION 'SOLAPAMIENTO_ESTUDIANTE: estudiante % tiene otra clase en franja %',
      v_est_id, NEW.franja_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- RF-03.d — Aforo (con tolerancia configurable)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_capacidad_salon() RETURNS TRIGGER AS $$
DECLARE
  v_inscritos  INTEGER;
  v_capacidad  INTEGER;
  v_tolerancia NUMERIC;
  v_limite     INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inscritos
    FROM inscripciones
    WHERE grupo_id = NEW.grupo_id AND estado = 'activa';

  SELECT capacidad INTO v_capacidad FROM salones WHERE id = NEW.salon_id;
  v_tolerancia := fn_regla_decimal('capacidad_tolerancia', 1.0);
  v_limite     := FLOOR(v_capacidad * v_tolerancia)::INTEGER;

  IF v_inscritos > v_limite THEN
    RAISE EXCEPTION 'CAPACIDAD_EXCEDIDA: salón % cap=% tol=% (lim=%) inscritos=%',
      NEW.salon_id, v_capacidad, v_tolerancia, v_limite, v_inscritos
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- RF-03.e — Compatibilidad de tipo de aula
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_compatibilidad_salon() RETURNS TRIGGER AS $$
DECLARE
  v_tipo_requerido TEXT;
  v_tipo_salon     TEXT;
BEGIN
  SELECT m.tipo_aula_requerida INTO v_tipo_requerido
    FROM grupos g JOIN materias m ON m.id = g.materia_id
    WHERE g.id = NEW.grupo_id;
  SELECT tipo INTO v_tipo_salon FROM salones WHERE id = NEW.salon_id;

  IF v_tipo_requerido <> 'cualquiera' AND v_tipo_requerido <> v_tipo_salon THEN
    RAISE EXCEPTION 'AULA_INCOMPATIBLE: requiere "%" pero salón es "%"',
      v_tipo_requerido, v_tipo_salon USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Disponibilidad explícita del docente en la franja
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_disponibilidad_docente() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM disponibilidad_docente
    WHERE docente_id = NEW.docente_id AND franja_id = NEW.franja_id
  ) THEN
    RAISE EXCEPTION 'DOCENTE_NO_DISPONIBLE: docente % sin disponibilidad en franja %',
      NEW.docente_id, NEW.franja_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Compatibilidad de jornada del docente con la jornada del bloque.
-- Refuerza: docente "Nocturna" no puede dictar en bloques D*; etc.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_jornada_docente() RETURNS TRIGGER AS $$
DECLARE
  v_disp_doc      TEXT;
  v_bloque_jornada TEXT;
BEGIN
  SELECT disponibilidad INTO v_disp_doc FROM docentes WHERE id = NEW.docente_id;
  SELECT j.codigo INTO v_bloque_jornada
    FROM franjas_horarias f
    JOIN bloques_horarios b ON b.id = f.bloque_id
    JOIN jornadas j         ON j.id = b.jornada_id
    WHERE f.id = NEW.franja_id;

  IF v_disp_doc = 'Diurna'   AND v_bloque_jornada <> 'diurna'   THEN
    RAISE EXCEPTION 'JORNADA_DOCENTE_INCOMPATIBLE: docente Diurna no puede dictar en jornada %',
      v_bloque_jornada USING ERRCODE = 'P0001';
  END IF;
  IF v_disp_doc = 'Nocturna' AND v_bloque_jornada <> 'nocturna' THEN
    RAISE EXCEPTION 'JORNADA_DOCENTE_INCOMPATIBLE: docente Nocturna no puede dictar en jornada %',
      v_bloque_jornada USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Compatibilidad jornada del GRUPO ↔ jornada del BLOQUE
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_jornada_grupo_bloque() RETURNS TRIGGER AS $$
DECLARE
  v_grupo_jornada  INTEGER;
  v_bloque_jornada INTEGER;
BEGIN
  SELECT jornada_id INTO v_grupo_jornada FROM grupos WHERE id = NEW.grupo_id;
  SELECT b.jornada_id INTO v_bloque_jornada
    FROM franjas_horarias f JOIN bloques_horarios b ON b.id = f.bloque_id
    WHERE f.id = NEW.franja_id;

  IF v_grupo_jornada <> v_bloque_jornada THEN
    RAISE EXCEPTION 'JORNADA_INCOMPATIBLE: grupo jornada % asignado a franja jornada %',
      v_grupo_jornada, v_bloque_jornada USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Carga docente semanal (TC=40, MT=20 por defecto, ajustable por docente)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_carga_docente() RETURNS TRIGGER AS $$
DECLARE
  v_horas_asignadas NUMERIC;
  v_horas_nuevas    NUMERIC;
  v_carga_max       INTEGER;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600), 0)
    INTO v_horas_asignadas
    FROM horario_asignado h
    JOIN franjas_horarias f ON f.id = h.franja_id
    JOIN bloques_horarios b ON b.id = f.bloque_id
    WHERE h.docente_id = NEW.docente_id
      AND h.estado    <> 'cancelado'
      AND h.id        <> COALESCE(NEW.id, -1);

  SELECT EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600
    INTO v_horas_nuevas
    FROM franjas_horarias f JOIN bloques_horarios b ON b.id = f.bloque_id
    WHERE f.id = NEW.franja_id;

  SELECT carga_max_horas INTO v_carga_max FROM docentes WHERE id = NEW.docente_id;

  IF (v_horas_asignadas + v_horas_nuevas) > v_carga_max THEN
    RAISE EXCEPTION 'CARGA_DOCENTE_EXCEDIDA: docente % tendría %h (máx %)',
      NEW.docente_id, (v_horas_asignadas + v_horas_nuevas), v_carga_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Traslado entre sedes: bloques consecutivos del mismo docente no
-- pueden estar en sedes distintas. "Consecutivo" = |orden| = 1
-- y mismo día. Si la diferencia ≥ 2, hay bloque(s) libre(s) entre medio.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_traslado_sede_docente() RETURNS TRIGGER AS $$
DECLARE
  v_new_sede   INTEGER;
  v_new_dia    TEXT;
  v_new_orden  INTEGER;
  v_otro_sede  INTEGER;
BEGIN
  SELECT s.sede_id, f.dia, b.orden
    INTO v_new_sede, v_new_dia, v_new_orden
  FROM salones s
  JOIN franjas_horarias f ON f.id = NEW.franja_id
  JOIN bloques_horarios b ON b.id = f.bloque_id
  WHERE s.id = NEW.salon_id;

  -- Salones virtuales: la sede física no aplica, se omite el check
  IF v_new_sede IS NULL THEN RETURN NEW; END IF;

  SELECT s2.sede_id INTO v_otro_sede
  FROM horario_asignado h2
  JOIN salones s2          ON s2.id = h2.salon_id
  JOIN franjas_horarias f2 ON f2.id = h2.franja_id
  JOIN bloques_horarios b2 ON b2.id = f2.bloque_id
  WHERE h2.docente_id = NEW.docente_id
    AND h2.id        <> COALESCE(NEW.id, -1)
    AND h2.estado    <> 'cancelado'
    AND f2.dia       =  v_new_dia
    AND ABS(b2.orden - v_new_orden) = 1
    AND s2.sede_id IS NOT NULL
    AND s2.sede_id   <> v_new_sede
  LIMIT 1;

  IF v_otro_sede IS NOT NULL THEN
    RAISE EXCEPTION 'TRASLADO_SEDE_DOCENTE: docente % sedes distintas en bloques consecutivos (% vs %)',
      NEW.docente_id, v_new_sede, v_otro_sede USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_touch_actualizado() RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Modalidad virtual obligatoria ≥ umbral (regla del spec: ≥7° virtual)
-- Trigger sobre grupos (no sobre horario_asignado).
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_modalidad_virtual_semestre() RETURNS TRIGGER AS $$
DECLARE
  v_semestre INTEGER;
  v_umbral   INTEGER;
BEGIN
  SELECT semestre INTO v_semestre FROM materias WHERE id = NEW.materia_id;
  v_umbral := fn_regla_int('umbral_semestre_virtual', 7);
  IF v_semestre >= v_umbral AND NEW.modalidad <> 'virtual' THEN
    RAISE EXCEPTION 'MODALIDAD_VIRTUAL_REQUERIDA: materia sem=% (umbral=%) requiere virtual, recibió %',
      v_semestre, v_umbral, NEW.modalidad USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Grupo C virtual sólo si requiere_autorizacion=TRUE (decano)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_grupo_c_autorizado() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.modalidad = 'virtual'
     AND UPPER(NEW.numero) = 'C'
     AND NEW.requiere_autorizacion = FALSE THEN
    RAISE EXCEPTION 'GRUPO_C_SIN_AUTORIZACION: grupo C virtual requiere autorización del decano'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Triggers sobre horario_asignado
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_solapamiento_salon       ON horario_asignado;
DROP TRIGGER IF EXISTS trg_solapamiento_docente     ON horario_asignado;
DROP TRIGGER IF EXISTS trg_solapamiento_estudiantes ON horario_asignado;
DROP TRIGGER IF EXISTS trg_capacidad_salon          ON horario_asignado;
DROP TRIGGER IF EXISTS trg_compatibilidad_salon     ON horario_asignado;
DROP TRIGGER IF EXISTS trg_disponibilidad_docente   ON horario_asignado;
DROP TRIGGER IF EXISTS trg_jornada_docente          ON horario_asignado;
DROP TRIGGER IF EXISTS trg_jornada_grupo_bloque     ON horario_asignado;
DROP TRIGGER IF EXISTS trg_carga_docente            ON horario_asignado;
DROP TRIGGER IF EXISTS trg_traslado_sede_docente    ON horario_asignado;
DROP TRIGGER IF EXISTS trg_touch_horario            ON horario_asignado;

CREATE TRIGGER trg_solapamiento_salon       BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_solapamiento_salon();
CREATE TRIGGER trg_solapamiento_docente     BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_solapamiento_docente();
CREATE TRIGGER trg_solapamiento_estudiantes BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_solapamiento_estudiantes();
CREATE TRIGGER trg_capacidad_salon          BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_capacidad_salon();
CREATE TRIGGER trg_compatibilidad_salon     BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_compatibilidad_salon();
CREATE TRIGGER trg_disponibilidad_docente   BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_disponibilidad_docente();
CREATE TRIGGER trg_jornada_docente          BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_jornada_docente();
CREATE TRIGGER trg_jornada_grupo_bloque     BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_jornada_grupo_bloque();
CREATE TRIGGER trg_carga_docente            BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_carga_docente();
CREATE TRIGGER trg_traslado_sede_docente    BEFORE INSERT OR UPDATE ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_check_traslado_sede_docente();
CREATE TRIGGER trg_touch_horario            BEFORE UPDATE            ON horario_asignado FOR EACH ROW EXECUTE FUNCTION fn_touch_actualizado();

-- ────────────────────────────────────────────────────────────────
-- Triggers sobre grupos
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_modalidad_virtual_semestre ON grupos;
DROP TRIGGER IF EXISTS trg_grupo_c_autorizado         ON grupos;

CREATE TRIGGER trg_modalidad_virtual_semestre BEFORE INSERT OR UPDATE ON grupos FOR EACH ROW EXECUTE FUNCTION fn_check_modalidad_virtual_semestre();
CREATE TRIGGER trg_grupo_c_autorizado         BEFORE INSERT OR UPDATE ON grupos FOR EACH ROW EXECUTE FUNCTION fn_check_grupo_c_autorizado();

-- ────────────────────────────────────────────────────────────────
-- Validación de inscripciones: paz_y_salvo, prerequisitos,
-- jornada estudiante↔grupo, sede estudiante↔grupo (salvo virtual o excepción)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_inscripcion() RETURNS TRIGGER AS $$
DECLARE
  v_paz              BOOLEAN;
  v_validar_paz      BOOLEAN;
  v_validar_prereq   BOOLEAN;
  v_materia_id       INTEGER;
  v_faltantes        INTEGER;
  v_grupo_jornada    INTEGER;
  v_est_jornada      INTEGER;
  v_grupo_sede       INTEGER;
  v_grupo_modalidad  TEXT;
  v_est_sede         INTEGER;
BEGIN
  IF NEW.estado <> 'activa' THEN RETURN NEW; END IF;

  v_validar_paz    := fn_regla_bool('requiere_paz_y_salvo', TRUE);
  v_validar_prereq := fn_regla_bool('validar_prerequisitos', TRUE);

  IF v_validar_paz THEN
    SELECT paz_y_salvo INTO v_paz FROM estudiantes WHERE id = NEW.estudiante_id;
    IF NOT COALESCE(v_paz, FALSE) THEN
      RAISE EXCEPTION 'SIN_PAZ_Y_SALVO: estudiante % sin paz y salvo',
        NEW.estudiante_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_validar_prereq THEN
    SELECT materia_id INTO v_materia_id FROM grupos WHERE id = NEW.grupo_id;
    SELECT COUNT(*) INTO v_faltantes
      FROM prerequisitos p
      WHERE p.materia_id = v_materia_id
        AND NOT EXISTS (
          SELECT 1
          FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id
          WHERE i.estudiante_id = NEW.estudiante_id
            AND g.materia_id    = p.prerequisito_id
            AND i.estado        = 'aprobada'
        );
    IF v_faltantes > 0 THEN
      RAISE EXCEPTION 'PREREQUISITO_NO_CUMPLIDO: faltan % prereq(s) para materia %',
        v_faltantes, v_materia_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Jornada estudiante ↔ jornada grupo (regla dura del spec)
  SELECT jornada_id, sede_id, modalidad
    INTO v_grupo_jornada, v_grupo_sede, v_grupo_modalidad
    FROM grupos WHERE id = NEW.grupo_id;
  SELECT jornada_id, sede_id INTO v_est_jornada, v_est_sede
    FROM estudiantes WHERE id = NEW.estudiante_id;

  IF v_est_jornada <> v_grupo_jornada THEN
    RAISE EXCEPTION 'JORNADA_INCOMPATIBLE: estudiante jornada % vs grupo jornada %',
      v_est_jornada, v_grupo_jornada USING ERRCODE = 'P0001';
  END IF;

  -- Sede estudiante ↔ sede grupo (excepto virtual o es_excepcion)
  IF v_grupo_modalidad <> 'virtual'
     AND NEW.es_excepcion = FALSE
     AND v_grupo_sede IS DISTINCT FROM v_est_sede THEN
    RAISE EXCEPTION 'SEDE_ESTUDIANTE_INCOMPATIBLE: estudiante sede % vs grupo sede % (sin excepción)',
      v_est_sede, v_grupo_sede USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_inscripcion ON inscripciones;
CREATE TRIGGER trg_check_inscripcion
  BEFORE INSERT OR UPDATE ON inscripciones
  FOR EACH ROW EXECUTE FUNCTION fn_check_inscripcion();

-- ────────────────────────────────────────────────────────────────
-- API utilitaria
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verificar_disponibilidad(p_docente_id INT, p_franja_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM disponibilidad_docente
    WHERE docente_id = p_docente_id AND franja_id = p_franja_id
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION listar_grupos_sin_horario(p_periodo_id INT)
RETURNS TABLE (grupo_id INT, materia_codigo TEXT, numero TEXT, jornada TEXT, modalidad TEXT, sede TEXT) AS $$
  SELECT g.id, m.codigo::TEXT, g.numero::TEXT, j.codigo::TEXT, g.modalidad::TEXT,
         COALESCE(s.codigo,'(virtual)')::TEXT
  FROM grupos g
  JOIN materias m ON m.id = g.materia_id
  JOIN jornadas j ON j.id = g.jornada_id
  LEFT JOIN sedes s ON s.id = g.sede_id
  WHERE g.periodo_id = p_periodo_id
    AND g.estado     = 'abierto'
    AND NOT EXISTS (SELECT 1 FROM horario_asignado h WHERE h.grupo_id = g.id);
$$ LANGUAGE sql STABLE;
