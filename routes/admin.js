const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// Create a student/reviewer/admin account. Admin-created accounts only —
// there is no public signup route.
router.post('/users', async (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const allowedRoles = ['student', 'reviewer', 'admin'];
  const finalRole = allowedRoles.includes(role) ? role : 'student';

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1,$2,$3,$4) RETURNING id, email, name, role, created_at`,
      [String(email).toLowerCase().trim(), hash, name, finalRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }
    throw err;
  }
});

router.get('/users', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
});

module.exports = router;
