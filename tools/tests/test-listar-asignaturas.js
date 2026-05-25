// tools/tests/test-listar-asignaturas.js
import { pool } from '../../scripts/db.js';
import { listar_asignaturas_por_semestre } from '../consulta/listar_asignaturas_por_semestre.js';

async function test() {
    try {
        console.log(" Probando listar_asignaturas_por_semestre (Solo IS)...\n");

        // Caso 1: Listar materias de Sistemas del semestre 1
        console.log("--- Caso 1: Ingeniería de Sistemas - Semestre 1 ---");
        const sem1 = await listar_asignaturas_por_semestre({ semestre: 1 });
        console.log(`Total: ${sem1.total_materias} materias`);
        sem1.materias.forEach(m => {
            console.log(`    ${m.codigo} - ${m.nombre} (${m.creditos} créditos, ${m.horas_semana}h/semana)`);
        });
        console.log('');

        // Caso 2: Listar materias del semestre 5 (donde empiezan virtuales)
        console.log("--- Caso 2: Ingeniería de Sistemas - Semestre 5 ---");
        const sem5 = await listar_asignaturas_por_semestre({ semestre: 5 });
        console.log(`Total: ${sem5.total_materias} materias`);
        sem5.materias.forEach(m => {
            const virtual = m.semestre >= 7 ? ' VIRTUAL' : ' PRESENCIAL';
            console.log(`    ${m.codigo} - ${m.nombre} (${virtual})`);
        });
        console.log('');

        // Caso 3: Listar materias de múltiples semestres
        console.log("--- Caso 3: IS - Semestres 1, 2 y 3 ---");
        const varios = await listar_asignaturas_por_semestre({ semestre: [1, 2, 3] });
        console.log(`Total: ${varios.total_materias} materias`);
        
        const porSemestre = {};
        varios.materias.forEach(m => {
            if (!porSemestre[m.semestre]) porSemestre[m.semestre] = [];
            porSemestre[m.semestre].push(m);
        });
        Object.keys(porSemestre).sort().forEach(sem => {
            console.log(`   Semestre ${sem}: ${porSemestre[sem].length} materias`);
        });
        console.log('');

        // Caso 4: Materias con prerequisitos
        console.log("--- Caso 4: Materias con prerequisitos (Semestre 3) ---");
        const sem3 = await listar_asignaturas_por_semestre({ semestre: 3 });
        const conPrereqs = sem3.materias.filter(m => m.tiene_prerequisitos);
        console.log(`Materias con prerequisitos: ${conPrereqs.length} de ${sem3.total_materias}`);
        conPrereqs.forEach(m => {
            console.log(`   🔗 ${m.codigo} - ${m.nombre}`);
            console.log(`      Requiere: ${m.prerequisitos.map(p => p.codigo).join(', ')}`);
        });
        console.log('');

        // Caso 5: Prueba de error - semestre inválido (>10)
        console.log("--- Caso 5: Prueba de error (semestre > 10) ---");
        try {
            await listar_asignaturas_por_semestre({ semestre: 11 });
        } catch (error) {
            console.log(`    Error capturado: ${error.message}`);
        }

        console.log("\n Prueba completada!");

    } catch (error) {
        console.error(" Error en la prueba:", error.message);
    } finally {
        await pool.end();
    }
}

test();