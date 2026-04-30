import pg from 'pg';
import dotenv from 'dotenv';
import { newDb } from 'pg-mem';

dotenv.config();

const { Pool } = pg;

const useInMemoryDb = process.env.USE_IN_MEMORY_DB === 'true' || !process.env.DATABASE_URL;

let pool;

if (useInMemoryDb) {
  const memDb = newDb();
  const adapter = memDb.adapters.createPg();
  pool = new adapter.Pool();
  console.log('Using in-memory PostgreSQL mode (pg-mem)');
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = async () => {
  return await pool.connect();
};

export default pool;
