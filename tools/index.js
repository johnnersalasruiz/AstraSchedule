// Consulta
export { obtener_resumen_estado } from './consulta/obtener_resumen_estado.js';
export { listar_grupos_sin_horario } from './consulta/listar_grupos_sin_horario.js';
export { listar_horarios_asignados } from './consulta/listar_horarios_asignados.js';

// Generación
export { evaluar_fusion_grupos } from './generacion/evaluar_fusion_grupos.js';
export { proponer_horario } from './generacion/proponer_horario.js';
export { asignar_clase } from './generacion/asignar_clase.js';
export { generar_horarios_pendientes } from './generacion/generar_horarios_pendientes.js';

// Notificaciones
export { notificar_docente } from './notificaciones/notificar_docente.js';
export { notificar_director } from './notificaciones/notificar_director.js';