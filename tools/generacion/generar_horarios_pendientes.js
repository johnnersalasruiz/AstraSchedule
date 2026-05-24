import { listar_grupos_sin_horario } from '../consulta/listar_grupos_sin_horario.js';
import { evaluar_fusion_grupos } from './evaluar_fusion_grupos.js';
import { proponer_horario } from './proponer_horario.js';
import { asignar_clase } from './asignar_clase.js';
import { notificar_docente, notificar_director } from '../notificaciones/index.js';

// Configuración de reintentos
const MAX_REINTENTOS = 3;
const ESPERA_ENTRE_REINTENTOS = 500; // milisegundos (opcional)

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generar_horarios_pendientes({ programa_id, jornada, modalidad, sede = null }) {
    // 1. Obtener grupos sin horario
    const grupos = await listar_grupos_sin_horario({
        programa_id,
        semestre: Array.from({ length: 12 }, (_, i) => i + 1),
        jornada,
        modalidad,
        sede
    });

    if (grupos.length === 0) {
        return { mensaje: 'No hay grupos pendientes.', asignaciones: [] };
    }

    // 2. Agrupar por materia (código) y jornada
    const gruposPorMateria = {};
    for (const grupo of grupos) {
        const key = `${grupo.materia_codigo}|${grupo.jornada}`;
        if (!gruposPorMateria[key]) gruposPorMateria[key] = [];
        gruposPorMateria[key].push(grupo);
    }

    const resultados = [];
    const docentesExcluidosGlobal = []; // Acumula docentes que ya se asignaron en alguna franja para evitar solapamientos

    for (const gruposMismaMateria of Object.values(gruposPorMateria)) {
        let grupoFusionado = null;
        // Si hay al menos dos grupos de la misma materia, evaluar fusión
        if (gruposMismaMateria.length >= 2) {
            const ids = gruposMismaMateria.map(g => g.id);
            const fusion = await evaluar_fusion_grupos({ grupos_ids: ids });
            if (fusion.fusion_posible) {
                grupoFusionado = { ...gruposMismaMateria[0] };
                grupoFusionado.cupo_max = fusion.total_estudiantes;
                grupoFusionado.salon_sugerido = fusion.salon_sugerido.id;
                // Los demás grupos se marcarán como fusionados y no se asignarán individualmente
            }
        }

        const gruposAsignar = grupoFusionado ? [grupoFusionado] : gruposMismaMateria;

        for (const grupo of gruposAsignar) {
            let exito = false;
            let ultimoError = null;
            let intentos = 0;
            let docentesExcluidosPorGrupo = [...docentesExcluidosGlobal];

            while (!exito && intentos < MAX_REINTENTOS) {
                intentos++;
                try {
                    // 3. Proponer horario (con exclusión de docentes ya usados o conflictivos)
                    const propuesta = await proponer_horario({
                        grupo_id: grupo.id,
                        excluir_docentes: docentesExcluidosPorGrupo,
                        salon_recomendado: grupo.salon_sugerido || null
                    });

                    if (!propuesta.horarios_propuestos.length) {
                        throw new Error('No se encontró franja horaria disponible');
                    }

                    const mejorFranja = propuesta.horarios_propuestos[0];
                    const docenteId = mejorFranja.docente_sugerido?.id;
                    if (!docenteId) {
                        throw new Error('No se encontró docente disponible');
                    }

                    // 4. Intentar asignar la clase
                    const asignacion = await asignar_clase({
                        grupo_id: grupo.id,
                        docente_id: docenteId,
                        aula_id: mejorFranja.aula_id,
                        franja_id: mejorFranja.franja_id,
                        es_definitiva: false
                    });

                    // Si llegamos aquí, la asignación fue exitosa
                    exito = true;
                    resultados.push({
                        grupo_id: grupo.id,
                        estado: 'asignado',
                        horario: mejorFranja,
                        docente_id: docenteId,
                        salon_id: mejorFranja.aula_id,
                        asignacion_id: asignacion.id,
                        intentos
                    });

                    // Agregar el docente a la lista global de excluidos para evitar solapamientos
                    docentesExcluidosGlobal.push(docenteId);

                    // Notificar al docente (solo si la asignación fue exitosa)
                    await notificar_docente({
                        docente_id: docenteId,
                        asunto: 'Nueva asignación de horario',
                        mensaje: `Se te ha asignado el grupo ${grupo.numero} de la materia ${grupo.materia_codigo} en ${mejorFranja.dia} de ${mejorFranja.hora_inicio} a ${mejorFranja.hora_fin}. Por favor revisa y confirma.`
                    });

                } catch (error) {
                    ultimoError = error;
                    console.error(`⚠️ Error en grupo ${grupo.id} (intento ${intentos}/${MAX_REINTENTOS}):`, error.message);

                    // Si el error es por solapamiento de docente, extraer el docente_id del mensaje y excluirlo
                    if (error.message.includes('SOLAPAMIENTO_DOCENTE')) {
                        const match = error.message.match(/docente (\d+)/);
                        if (match) {
                            const docenteConflictivo = parseInt(match[1], 10);
                            if (!docentesExcluidosPorGrupo.includes(docenteConflictivo)) {
                                docentesExcluidosPorGrupo.push(docenteConflictivo);
                                console.log(`🚫 Docente ${docenteConflictivo} excluido para futuros intentos del grupo ${grupo.id}`);
                            }
                        }
                    }
                    // Si el error es por franja ocupada (aula o docente), simplemente reintentamos con la misma exclusión
                    if (intentos < MAX_REINTENTOS) {
                        await sleep(ESPERA_ENTRE_REINTENTOS);
                    }
                }
            }

            if (!exito) {
                resultados.push({
                    grupo_id: grupo.id,
                    estado: 'error',
                    motivo: ultimoError?.message || 'Fallo después de múltiples reintentos',
                    intentos
                });
            }
        }
    }

    // Notificar al director con el resumen
    const asignados = resultados.filter(r => r.estado === 'asignado').length;
    const errores = resultados.filter(r => r.estado === 'error').length;

    await notificar_director({
        director_email: 'director.ingenieria@uniajc.edu.co',
        asunto: 'Generación de horarios completada',
        mensaje: `Se generaron ${asignados} horarios para los grupos pendientes. Errores: ${errores}. Revisa los detalles en el sistema.`
    });

    return {
        mensaje: `Proceso completado. Se asignaron ${asignados} horarios. Errores: ${errores}.`,
        asignaciones: resultados,
        docentes_excluidos: docentesExcluidosGlobal
    };
}