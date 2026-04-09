import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO manifestiq, public');
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export default pool;
