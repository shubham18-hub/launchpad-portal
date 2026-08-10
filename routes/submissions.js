const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  },
});

// Student submits (or replaces) work for a task.
router.post('/:taskId', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required.' });

    const { rows: taskRows } = await pool.query('SELECT id FROM tasks WHERE id = $1', [
      req.params.taskId,
    ]);
    if (!taskRows[0]) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Remove a previous file for this task/user if replacing.
    const { rows: existing } = await pool.query(
      'SELECT stored_name FROM submissions WHERE task_id = $1 AND user_id = $2',
      [req.params.taskId, req.user.id]
    );
    if (existing[0]) {
      fs.unlink(path.join(uploadDir, existing[0].stored_name), () => {});
    }

    const { rows } = await pool.query(
      `INSERT INTO submissions (task_id, user_id, file_name, stored_name)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (task_id, user_id)
       DO UPDATE SET file_name = $3, stored_name = $4, submitted_at = now(), grade = NULL, graded_by = NULL, graded_at = NULL
       RETURNING *`,
      [req.params.taskId, req.user.id, req.file.originalname, req.file.filename]
    );
    res.status(201).json(rows[0]);
  });
});

// Admin/reviewer: list all submissions for a task, with student names.
router.get('/task/:taskId', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.name AS student_name, u.email AS student_email
     FROM submissions s JOIN users u ON u.id = s.user_id
     WHERE s.task_id = $1 ORDER BY s.submitted_at DESC`,
    [req.params.taskId]
  );
  res.json(rows);
});

// Admin/reviewer/student: download a submitted file.
// Students can only download their own files; admins/reviewers can download any.
router.get('/:id/file', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  const sub = rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  
  // Check if user has permission: own submission, or is admin/reviewer
  if (sub.user_id !== req.user.id && !['admin', 'reviewer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You cannot access this file.' });
  }
  
  res.download(path.join(uploadDir, sub.stored_name), sub.file_name);
});

// Admin/reviewer: grade a submission.
router.post('/:id/grade', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  const { grade } = req.body || {};
  if (grade === undefined || grade === null || Number.isNaN(Number(grade))) {
    return res.status(400).json({ error: 'A numeric grade is required.' });
  }
  const { rows } = await pool.query(
    `UPDATE submissions SET grade = $1, graded_by = $2, graded_at = now()
     WHERE id = $3 RETURNING *`,
    [Number(grade), req.user.id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Submission not found.' });
  res.json(rows[0]);
});

module.exports = router;
