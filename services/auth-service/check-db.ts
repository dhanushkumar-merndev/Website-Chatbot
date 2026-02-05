import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
  `);
  console.log('Migration table exists:', res.rows.length > 0);
  await client.end();
}

checkTables().catch(console.error);
