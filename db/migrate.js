const pool = require('./pool');

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     name TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('student','reviewer','admin')) DEFAULT 'student',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     track TEXT NOT NULL,
     description TEXT NOT NULL,
     deadline DATE NOT NULL,
     points INTEGER NOT NULL DEFAULT 100,
     created_by INTEGER REFERENCES users(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS submissions (
     id SERIAL PRIMARY KEY,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     file_name TEXT NOT NULL,
     stored_name TEXT NOT NULL,
     grade INTEGER,
     graded_by INTEGER REFERENCES users(id),
     graded_at TIMESTAMPTZ,
     submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (task_id, user_id)
   )`,
];

(async () => {
  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
    console.log('Migration complete: users, tasks, submissions tables are ready.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
