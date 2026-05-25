// tools/tests/test-semestre9.js
import { listar_asignaturas_por_semestre } from '../consulta/listar_asignaturas_por_semestre.js';

async function test() {
    try {
        console.log("📋 Probando listar_asignaturas_por_semestre para Semestre 9...\n");
        
        const result = await listar_asignaturas_por_semestre({ semestre: 9 });
        
        console.log(`Semestre 9: ${result.total_materias} materias\n`);
        
        result.materias.forEach(m => {
            console.log(`  ${m.codigo} - ${m.nombre}`);
            console.log(`    Créditos: ${m.creditos} | Horas/semana: ${m.horas_semana}`);
            console.log(`    Tipo aula: ${m.tipo_aula_requerida}`);
            if (m.tiene_prerequisitos) {
                console.log(`    Prerrequisitos: ${m.prerequisitos.map(p => p.codigo).join(', ')}`);
            }
            console.log('');
        });
        
        console.log("✅ Prueba completada!");
        
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

test();