// tools/tests/test-verificar-disponibilidad.js
import { pool } from '../../scripts/db.js';
import { verificar_disponibilidad_docente } from '../consulta/verificar_disponibilidad_docente.js';

async function test() {
    try {
        console.log("📋 Probando verificar_disponibilidad_docente...\n");

        // Caso 1: Docente 1 (Felipe Vasco - Diurna) en franja diurna 41 → Debe ser true
        console.log("--- Caso 1: Docente diurno en franja diurna ---");
        const resultado1 = await verificar_disponibilidad_docente({
            docente_id: 1,
            franja_id: 41
        });
        console.log(`Docente: ID 1 (Diurna)`);
        console.log(`Franja ID: 41`);
        console.log(`✅ Disponible: ${resultado1.disponible}`);
        console.log(`   ${resultado1.mensaje}\n`);

        // Caso 2: Docente 3 (Hernán Peña - Nocturna) en franja diurna 41 → Debe ser false
        console.log("--- Caso 2: Docente nocturno en franja diurna ---");
        const resultado2 = await verificar_disponibilidad_docente({
            docente_id: 3,
            franja_id: 41
        });
        console.log(`Docente: ID 3 (Nocturna)`);
        console.log(`Franja ID: 41`);
        console.log(`✅ Disponible: ${resultado2.disponible}`);
        console.log(`   ${resultado2.mensaje}\n`);

        // Caso 3: Docente 3 (Hernán Peña - Nocturna) en franja nocturna 56 → Debe ser true
        console.log("--- Caso 3: Docente nocturno en franja nocturna ---");
        const resultado3 = await verificar_disponibilidad_docente({
            docente_id: 3,
            franja_id: 56
        });
        console.log(`Docente: ID 3 (Nocturna)`);
        console.log(`Franja ID: 56`);
        console.log(` Disponible: ${resultado3.disponible}`);
        console.log(`   ${resultado3.mensaje}\n`);

        // Caso 4: Docente 10 (Ana Ocampo - Ambas) en franja diurna 41 → Debe ser true
        console.log("--- Caso 4: Docente Ambas en franja diurna ---");
        const resultado4 = await verificar_disponibilidad_docente({
            docente_id: 10,
            franja_id: 41
        });
        console.log(`Docente: ID 10 (Ambas)`);
        console.log(`Franja ID: 41`);
        console.log(` Disponible: ${resultado4.disponible}`);
        console.log(`   ${resultado4.mensaje}\n`);

        // Caso 5: Docente 10 (Ana Ocampo - Ambas) en franja nocturna 56 → Debe ser true
        console.log("--- Caso 5: Docente Ambas en franja nocturna ---");
        const resultado5 = await verificar_disponibilidad_docente({
            docente_id: 10,
            franja_id: 56
        });
        console.log(`Docente: ID 10 (Ambas)`);
        console.log(`Franja ID: 56`);
        console.log(` Disponible: ${resultado5.disponible}`);
        console.log(`   ${resultado5.mensaje}\n`);

        console.log(" Prueba completada!");

    } catch (error) {
        console.error(" Error en la prueba:", error.message);
    } finally {
        await pool.end();
    }
}

test();