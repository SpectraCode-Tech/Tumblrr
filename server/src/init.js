import 'dotenv/config'; import fs from 'fs'; import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
await db.query(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')); console.log('Database ready'); await db.end();
