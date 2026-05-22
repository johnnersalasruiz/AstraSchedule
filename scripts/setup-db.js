import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from './db.js';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_NAME   = process.env.PGDATABASE || 'uniajc_horarios';
const DROP_FLAG = process.argv.includes('--drop');

async function ensureDatabase() {
  const admin = new Client({
    host:     process.env.PGHOST     || 'localhost',
    port:     Number(process.env.PGPORT) || 5432,
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: 'postgres',
  });
  await admin.connect();

  if (DROP_FLAG) {
    console.log(`▸ Eliminando BD "${DB_NAME}" (--drop)`);
    await admin.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [DB_NAME]);
    await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
  }

  const { rows } = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]
  );
  if (rows.length === 0) {
    console.log(`▸ Creando BD "${DB_NAME}"`);
    await admin.query(`CREATE DATABASE "${DB_NAME}" ENCODING 'UTF8'`);
  } else {
    console.log(`▸ BD "${DB_NAME}" ya existe`);
  }
  await admin.end();
}

async function runSqlFile(relPath) {
  const fullPath = join(__dirname, '..', relPath);
  const sql      = await readFile(fullPath, 'utf8');
  console.log(`▸ Ejecutando ${relPath}`);
  await pool.query(sql);
}

(async () => {
  try {
    await ensureDatabase();
    await runSqlFile('db/01-schema.sql');
    await runSqlFile('db/02-triggers.sql');
    console.log('✓ Esquema y triggers aplicados');
  } catch (err) {
    console.error('✗ Setup falló:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
