require('dotenv').config();
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Ensure JWT_SECRET is set (required for auth)
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev-secret-key-change-in-production';
  console.warn('⚠️  JWT_SECRET not set. Using default development key. Set JWT_SECRET environment variable for production.');
}

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const submissionRoutes = require('./routes/submissions');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1); // required on Render so rate-limit/cookies see the real client

app.use(
  helmet({
    contentSecurityPolicy: false, // keep simple for now; tighten once fonts/CDN list is final
  })
);
app.use(compression());
app.use(express.json());
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler — keeps stack traces out of responses.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Launchpad server running on port ${PORT}`));
