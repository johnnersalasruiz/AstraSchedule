Agente conversacional basado en IA (Groq) para automatizar la asignación de horarios académicos, detectar conflictos y notificar a los actores involucrados en la Facultad de Ingeniería de la UNIAJC.

## Requisitos Previos

- **Node.js** (v18 o superior) - [Descargar](https://nodejs.org/)
- **PostgreSQL** (v14 o superior) - [Descargar](https://www.postgresql.org/)
- **Cuenta en Groq** para obtener API Key - [console.groq.com](https://console.groq.com/)

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/fullStack58/AstraSchedule.git
cd astra-schedule
```


### 2. Instalar dependencias
```bash
npm install
```
Dependencias principales:

- pg - Conexión a PostgreSQL
- groq-sdk - Cliente para la API de Groq (LLM)
- dotenv - Manejo de variables de entorno
- jest - Pruebas unitarias (opcional)


### 3. Configurar base de datos PostgreSQL

Crear el archivo ```.env``` y ajustar:
```bash
# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=uniajc_horarios

# Groq API (para el agente conversacional)
GROQ_API_KEY=tu_api_key_aqui
```
Editar ```PGPASSWORD``` (y demás campos) con los valores reales del entorno.

Posteriormente crear la base de datos en PostgreSQL ej:  ```CREATE DATABASE uniajc_horarios``` y asegurarse que el servidor este corriendo.


### 4. Ejecutar el pipeline completo
```bash
npm run bootstrap
```
1. `npm run db:reset` — elimina y recrea la base `uniajc_horarios`, aplica `01-schema.sql` y `02-triggers.sql`.

2. `npm run seed:periodos` — carga periodos académicos, jornadas, bloques maestros y franjas.

3. `npm run seed:reglas` — carga las reglas configurables del motor.

4. `npm run seed:horarios` — carga sedes, programas, materias, prerequisitos, salones, docentes, estudiantes, grupos e inscripciones.

5. `npm run validate` — ejecuta los 25 checks de integridad y reglas de negocio.


## Ejecución del Agente Conversacional
Para probar el agente ejecute el siguiente comando `node agent.js`

Ejemplo de interacción:
```bash
✅ Conectado a PostgreSQL
🤖 Agente UNIAJC - Optimización de Horarios (Groq)
Escribe 'salir' para terminar.

> ¿Cuántos grupos de Ingeniería de Sistemas en jornada Diurna (sede Norte) aún no tienen horario?

🔧 Llamando a tool: obtenerResumenEstado con args: {
  programa_id: 'IS',
  jornada: 'Diurna',
  sede: 'NORTE'
}

🤖 Respuesta:
Según el resumen, hay 12 grupos en total en Ingeniería de Sistemas (jornada Diurna, sede Norte). 
De ellos, 7 aún no tienen horario asignado (58% sin completar).
Desglose:
- Sin horario: 7 grupos
- Propuesto: 2 grupos
- Confirmado: 3 grupos
- Conflicto: 0 grupos

> Lista los grupos que no tienen horario

🔧 Llamando a tool: listarGruposSinHorario con args: {
  programa_id: 'IS',
  semestre: [1,2,3,4,5,6,7,8,9,10],
  jornada: 'Diurna',
  sede: 'NORTE'
}

🤖 Respuesta:
Grupos sin horario:
1. Cálculo Diferencial - Grupo A
2. Programación I - Grupo B
3. Física I - Grupo A
4. Álgebra Lineal - Grupo A
5. Bases de Datos - Grupo B
6. Ingeniería de Software - Grupo A
7. Redes I - Grupo C

> Asigna el grupo de Cálculo Diferencial al aula AU302, docente P01, lunes 7:00-10:00

🔧 Llamando a tool: asignarClase con args: {
  grupo_id: 1,
  docente_id: 1,
  aula_id: 2,
  dia: 'Lunes',
  hora_inicio: '07:00',
  hora_fin: '10:00',
  es_definitiva: true
}

🤖 Respuesta:
✅ Asignación registrada exitosamente. El grupo Cálculo Diferencial ha sido asignado al aula AU302 con el docente P01 (Prof. Ciencias) en el bloque D1 (Lunes 07:00-10:00).

> Salir
👋 Hasta luego.
```
