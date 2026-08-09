const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List all tasks, with the current user's own submission (if any) attached.
router.get('/', requireAuth, async (req, res) => {
  const { rows: tasks } = await pool.query('SELECT * FROM tasks ORDER BY deadline ASC');
  const { rows: subs } = await pool.query(
    'SELECT task_id, file_name, grade, submitted_at FROM submissions WHERE user_id = $1',
    [req.user.id]
  );
  const byTask = Object.fromEntries(subs.map((s) => [s.task_id, s]));
  res.json(tasks.map((t) => ({ ...t, submission: byTask[t.id] || null })));
});

router.post('/', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  const { title, track, description, deadline, points } = req.body || {};
  if (!title || !track || !description || !deadline) {
    return res.status(400).json({ error: 'title, track, description and deadline are required.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, track, description, deadline, points, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, track, description, deadline, Number(points) || 100, req.user.id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
