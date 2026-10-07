import 'dotenv/config'; import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const r = await db.query('update users set is_admin=true where email=$1', [(process.argv[2] || '').toLowerCase()]);
console.log(r.rowCount ? 'Admin granted' : 'No user with that email'); await db.end();
