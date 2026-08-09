const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to your environment variables.');
  process.exit(1);
}

// Render's managed Postgres requires SSL for external connections but not
// for the internal connection URL. This works safely for both.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;
