const bcrypt = require('bcryptjs');
const pool = require('./pool');

const initialTasks = [
  {
    title: 'Brand Your E-Cell',
    track: 'preliminary',
    deadline: '2026-08-18',
    points: 75,
    description:
      'Every student community has its own identity. Define a clear vision and mission, then create a logo and tagline that help your team stand out.',
  },
  {
    title: 'Create your Social Media Presence',
    track: 'ignite',
    deadline: '2026-08-25',
    points: 125,
    description:
      'Build the foundations for a consistent online presence. Prepare a content plan, choose your channels, and design three example posts.',
  },
  {
    title: 'Define the roles in your team',
    track: 'propel',
    deadline: '2026-09-03',
    points: 100,
    description:
      'Map the people and responsibilities that will make your organization work. Submit a concise structure outlining every core role.',
  },
];

(async () => {
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (!email || !password) {
      console.log('INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set — skipping admin seed.');
    } else {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(password, 12);
        await pool.query(
          'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)',
          [email, hash, 'Admin', 'admin']
        );
        console.log(`Created admin account for ${email}.`);
      } else {
        console.log(`Admin account for ${email} already exists — skipping.`);
      }
    }

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM tasks');
    if (rows[0].count === 0) {
      for (const t of initialTasks) {
        await pool.query(
          'INSERT INTO tasks (title, track, description, deadline, points) VALUES ($1,$2,$3,$4,$5)',
          [t.title, t.track, t.description, t.deadline, t.points]
        );
      }
      console.log(`Seeded ${initialTasks.length} starter tasks.`);
    } else {
      console.log('Tasks table already has data — skipping task seed.');
    }
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
