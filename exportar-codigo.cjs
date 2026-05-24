const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'codigo_proyecto.txt');

const IGNORE_FOLDERS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage'
];

const IGNORE_FILES = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'codigo_proyecto.txt',
    'exportar-codigo.js',
    'package-lock.json',
    'yarn.lock'
];

const IGNORE_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.mp4',
    '.mp3',
    '.zip',
    '.rar',
    '.pdf'
];

function shouldIgnore(filePath, fileName) {
    if (IGNORE_FILES.includes(fileName)) {
        return true;
    }

    if (IGNORE_FOLDERS.some(folder => filePath.includes(folder))) {
        return true;
    }

    if (IGNORE_EXTENSIONS.includes(path.extname(fileName))) {
        return true;
    }

    return false;
}

function readDirectory(dir, output) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);

        if (shouldIgnore(fullPath, file)) {
            continue;
        }

        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            readDirectory(fullPath, output);
        } else {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');

                output.push(`
==================================================
ARCHIVO: ${path.relative(ROOT_DIR, fullPath)}
==================================================

${content}

`);

            } catch (err) {
                console.log(`No se pudo leer: ${fullPath}`);
            }
        }
    }
}

const output = [];

readDirectory(ROOT_DIR, output);

fs.writeFileSync(OUTPUT_FILE, output.join('\n'), 'utf8');

console.log(`Archivo generado: ${OUTPUT_FILE}`);