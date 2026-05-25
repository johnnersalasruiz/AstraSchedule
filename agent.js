// agent.js
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import readline from 'readline';
import * as tools from './tools/index.js';

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Groq recomienda usar modelos como 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'
const MODEL = 'llama-3.3-70b-versatile'; // o 'mixtral-8x7b-32768', 'llama3-70b-8192'

// Definición de funciones (igual que en OpenAI, Groq es compatible con Function Calling)
const functionDefinitions = [
    {
        type: "function",
        function: {
            name: "obtener_resumen_estado",
            description: "Obtiene un resumen de grupos filtrados por programa (usar 'IS' o 'IE'), jornada ('Diurna'/'Nocturna'), modalidad ('presencial'/'virtual') y opcionalmente sede (solo para presencial). Ejemplo: programa_id='IS', jornada='Diurna', modalidad='virtual'.",
            parameters: {
                type: "object",
                properties: {
                    programa_id: { type: "string", description: "Código del programa académico. Debe ser exactamente 'IS' para Ingeniería de Sistemas o 'IE' para Ingeniería Electrónica. No uses el nombre completo." },
                    jornada: { type: "string", enum: ["Diurna", "Nocturna"] },
                    modalidad: { type: "string", enum: ["presencial", "virtual"] },
                    sede: { type: "string", description: "Opcional. Código de sede (NORTE, SUR). Solo si modalidad es presencial." }
                },
                required: ["programa_id", "jornada", "modalidad"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "listar_grupos_sin_horario",
            description: "Lista los grupos que aún no tienen horario. Úsala cuando el usuario pida explícitamente una lista. El parámetro 'semestre' debe ser un array de números enteros (ej. [1,2,3,4,5,6,7,8,9,10]). Si el usuario no especifica semestres, usa [1,2,3,4,5,6,7,8,9,10] (todos los semestres). No uses años ni números grandes.",
            parameters: {
                type: "object",
                properties: {
                    programa_id: { type: "string" },
                    jornada: { type: "string", enum: ["Diurna", "Nocturna"] },
                    modalidad: { type: "string", enum: ["presencial", "virtual"] },
                    sede: { type: "string", description: "Opcional. Solo para presencial." },
                    semestre: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Lista de semestres. Por defecto [1,2,3,4,5,6,7,8,9,10]."
                    }
                },
                required: ["programa_id", "jornada", "modalidad"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generar_horarios_pendientes",
            description: "Genera horarios automáticamente para todos los grupos sin horario que cumplan los criterios (programa, jornada, modalidad, sede). Evalúa fusiones de grupos de diferentes programas con misma materia y jornada.",
            parameters: {
                type: "object",
                properties: {
                    programa_id: { type: "string", description: "Código del programa (IS o IE)" },
                    jornada: { type: "string", enum: ["Diurna", "Nocturna"] },
                    modalidad: { type: "string", enum: ["presencial", "virtual"] },
                    sede: { type: "string", description: "Código de sede (NORTE, SUR). Obligatorio si modalidad=presencial." }
                },
                required: ["programa_id", "jornada", "modalidad"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "asignar_clase",
            description: "Asigna una clase a un grupo, docente, aula y franja horaria específica.",
            parameters: {
                type: "object",
                properties: {
                    grupo_id: { type: "integer" },
                    docente_id: { type: "integer" },
                    aula_id: { type: "integer" },
                    franja_id: { type: "integer", description: "ID de la franja horaria (obtenido de proponer_horario o de listar franjas)." },
                    es_definitiva: { type: "boolean", description: "Si es true, el estado queda confirmado; si false, queda propuesto." }
                },
                required: ["grupo_id", "docente_id", "aula_id", "franja_id"]
            }

        }
    },

    {
        type: "function",
        function: {
            name: "enviar_formato_prematricula",
            description: "Genera y simula el envío del formato de prematrícula al director del programa con los datos del estudiante y las materias solicitadas.",
            parameters: {
                type: "object",
                properties: {
                    estudiante_id: { type: "integer", description: "ID del estudiante en la base de datos" },
                    estudiante_nombre: { type: "string", description: "Nombre completo del estudiante" },
                    programa_id: { type: "string", description: "Código del programa (ej. IS o IE)" },
                    semestre_actual: { type: "integer", description: "Semestre actual que cursa el estudiante" },
                    materias_solicitadas: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Lista de IDs numéricos de las materias solicitadas"
                    }
                },
                required: ["estudiante_id", "estudiante_nombre", "programa_id", "semestre_actual", "materias_solicitadas"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "procesar_respuesta_director_prematricula",
            description: "Procesa y registra la decisión inicial del director de programa respecto a una solicitud de prematrícula enviada previamente.",
            parameters: {
                type: "object",
                properties: {
                    solicitud_id: { type: "integer", description: "ID de la solicitud (equivale al ID del estudiante)" },
                    respuesta: { type: "string", description: "Decisión explícita del director (ej. 'Aprobado', 'Rechazado', 'Con ajustes')" },
                    observaciones_director: { type: "string", description: "Observaciones o comentarios adicionales del director" },
                    ajustes_horario: { type: "string", description: "Detalle de los ajustes solicitados, si el director pide cambios" }
                },
                required: ["solicitud_id", "respuesta"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "aprobar_prematricula",
            description: "Aprueba definitivamente las asignaturas de la prematrícula de un estudiante en la base de datos, actualizando el estado de sus inscripciones a 'aprobada'.",
            parameters: {
                type: "object",
                properties: {
                    solicitud_id: { type: "integer", description: "ID de la solicitud (equivale al ID del estudiante)" },
                    director_id: { type: "integer", description: "ID numérico del director que realiza la aprobación" },
                    materias_aprobadas: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Lista de IDs numéricos de las materias que fueron autorizadas finalmente"
                    }
                },
                required: ["solicitud_id", "director_id", "materias_aprobadas"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "enviar_solicitud_matricula",
            description: "Procesa la solicitud inicial de matrícula de un estudiante. Busca grupos disponibles para las materias solicitadas y registra la inscripción preliminar (activa), evaluando reglas como paz y salvo o prerrequisitos.",
            parameters: {
                type: "object",
                properties: {
                    estudiante_id: { type: "integer", description: "ID numérico del estudiante" },
                    periodo_id: { type: "integer", description: "ID del periodo académico actual (ej. 1)" },
                    materias: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Lista de IDs de las materias solicitadas por el estudiante"
                    }
                },
                required: ["estudiante_id", "periodo_id", "materias"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "procesar_contrapropuesta_docente",
            description: "Aplica los cambios sugeridos por un docente a un horario propuesto. Valida si la nueva franja y salón no generan cruces con otros horarios.",
            parameters: {
                type: "object",
                properties: {
                    asignacion_id: { type: "integer", description: "ID numérico de la asignación de horario actual" },
                    nueva_franja_sugerida: { type: "integer", description: "ID numérico de la nueva franja horaria que sugiere el docente" },
                    salon_alternativo: { type: "integer", description: "Opcional. ID numérico de un salón distinto sugerido" },
                    motivo: { type: "string", description: "Motivo por el cual el docente pide el cambio" }
                },
                required: ["asignacion_id", "nueva_franja_sugerida"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generar_alternativa_negociacion",
            description: "Busca franjas horarias alternativas donde el docente tenga disponibilidad y no tenga otras clases asignadas.",
            parameters: {
                type: "object",
                properties: {
                    asignacion_id_rechazada: { type: "integer", description: "ID numérico de la asignación que fue rechazada" },
                    criterios_prioridad: { type: "string", description: "Criterios opcionales para buscar (ej. 'Mismo día', 'Sede norte')" }
                },
                required: ["asignacion_id_rechazada"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bloquear_horario_definitivo",
            description: "Marca un horario propuesto como 'confirmado' definitivamente tras el acuerdo con el docente.",
            parameters: {
                type: "object",
                properties: {
                    asignacion_id_aceptada: { type: "integer", description: "ID numérico de la asignación a confirmar" },
                    confirmado_por: { type: "string", description: "Persona que confirma (ej. 'Docente', 'Sistema')" }
                },
                required: ["asignacion_id_aceptada", "confirmado_por"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generar_reporte_horario",
            description: "Genera un reporte estadístico general sobre el estado de la asignación de horarios (propuestos, confirmados, conflictos) y la carga de los docentes.",
            parameters: {
                type: "object",
                properties: {
                    periodo_id: { type: "integer", description: "Opcional. Filtrar el reporte por un periodo académico específico" },
                    programa_id: { type: "string", description: "Opcional. Filtrar el reporte por programa (ej. 'IS' o 'IE')" }
                }
            }
        }
    }
    // Agrega aquí el resto de las funciones (proponerHorario, detectarConflictos, etc.)
];

async function ejecutarTool(nombre, args) {
    if (!tools[nombre]) throw new Error(`Tool "${nombre}" no implementada`);
    return await tools[nombre](args);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function iniciarAgente() {
    console.log("🤖 Agente UNIAJC - Optimización de Horarios (Groq)\nEscribe 'salir' para terminar.\n");
    const messages = [
        {
            role: "system",
            content: `Eres un asistente experto en gestión académica. Para responder a preguntas sobre resúmenes de horarios, debes usar la herramienta 'obtenerResumenEstado'.

            Cuando recibas el resultado de esa herramienta (un JSON con los campos total_grupos, porcentaje_completitud, por_estado, programa_id, jornada, modalidad y sede), SIEMPRE debes formatear tu respuesta de la siguiente manera, usando lenguaje natural:

            "Según el resumen, hay [total_grupos] grupos [modalidad] en total en [programa] (jornada [jornada], sede [sede]). De ellos, [sin_horario] aún no tienen horario asignado ([porcentaje_completitud]% completado). Desglose:
            - Sin horario: [sin_horario] grupos
            - Propuesto: [propuesto] grupos
            - Confirmado: [confirmado] grupos
            - Conflicto: [conflicto] grupos"

            Luego, debes agregar una pregunta adicional según el caso:
            - Si sin_horario > 0, pregunta de forma natural: "¿Deseas que genere los horarios para los [sin_horario] grupos pendientes?"
            - Si sin_horario === 0, pregunta: "¿Hay algo más en lo que pueda ayudarte? Por ejemplo, listar grupos, asignar una clase, consultar disponibilidad de docentes, etc."

            **Importante**: Si el usuario responde afirmativamente (por ejemplo, "sí", "sí, por favor", "adelante", "genera los horarios") después de que le hayas preguntado "¿Deseas que genere los horarios...?", entonces debes invocar la herramienta 'generarHorariosPendientes' con los mismos parámetros (programa_id, jornada, modalidad, sede) que usaste en 'obtenerResumenEstado'. No pidas confirmación adicional.

            Sustituye los valores entre corchetes por los datos reales del JSON. Siempre responde en español, de manera amable, clara y profesional.`
        }
    ];

    const pregunta = () => {
        rl.question("> ", async (input) => {
            if (input.toLowerCase() === "salir") {
                console.log("👋 Hasta luego.");
                rl.close();
                return;
            }
            messages.push({ role: "user", content: input });

            try {
                const response = await groq.chat.completions.create({
                    model: MODEL,
                    messages: messages,
                    tools: functionDefinitions,
                    tool_choice: "auto",
                    temperature: 0.3
                });

                const assistantMessage = response.choices[0].message;
                messages.push(assistantMessage);

                if (assistantMessage.tool_calls) {
                    for (const toolCall of assistantMessage.tool_calls) {
                        const funcName = toolCall.function.name;
                        const args = JSON.parse(toolCall.function.arguments);
                        console.log(`🔧 Llamando a tool: ${funcName} con args:`, args);
                        const result = await ejecutarTool(funcName, args);
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result)
                        });
                    }
                    // Segunda llamada para obtener respuesta final
                    const finalResp = await groq.chat.completions.create({
                        model: MODEL,
                        messages: messages,
                        temperature: 0.3
                    });
                    const finalMsg = finalResp.choices[0].message.content;
                    console.log("\n🤖 Respuesta:\n", finalMsg);
                    messages.push({ role: "assistant", content: finalMsg });
                } else {
                    console.log("\n🤖:", assistantMessage.content);
                }
            } catch (error) {
                console.error("❌ Error:", error.message);
            }
            pregunta();
        });
    };
    pregunta();
}

import { pool } from './scripts/db.js';
pool.connect().then(() => {
    console.log("✅ Conectado a PostgreSQL");
    iniciarAgente();
}).catch(err => {
    console.error("❌ Error de base de datos:", err.message);
    process.exit(1);
});