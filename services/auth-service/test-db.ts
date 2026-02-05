import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  console.log('Testing connection to:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true, // Force SSL as it is Neon
  });

  try {
    const client = await pool.connect();
    console.log('Connected successfully!');
    const res = await client.query('SELECT NOW()');
    console.log('Query result:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    await pool.end();
  }
}

testConnection();
