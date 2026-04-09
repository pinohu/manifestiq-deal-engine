import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO manifestiq, public');
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export default pool;
