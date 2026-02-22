'use strict';

// ── Environment ───────────────────────────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const https    = require('https');
const morgan   = require('morgan');
const session  = require('express-session');
const mongoose = require('mongoose');

const webhookRouter = require('./src/routes/webhook');
const portalRouter  = require('./src/routes/portal');
const authRouter    = require('./src/routes/auth');

const { startReminderCron } = require('./src/jobs/reminderCron');
const { startSummaryCron }  = require('./src/jobs/summaryCron');

// ── Express App ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── SSL cert detection ────────────────────────────────────────────────────────
const KEY_FILE  = path.join(__dirname, 'certs', 'localhost.key');
const CRT_FILE  = path.join(__dirname, 'certs', 'localhost.crt');
const hasCerts  = fs.existsSync(KEY_FILE) && fs.existsSync(CRT_FILE);

// ── HTTP Logger ───────────────────────────────────────────────────────────────
app.use(morgan('dev'));

// ── Session ───────────────────────────────────────────────────────────────────
// secure: true is required for cookies to work over HTTPS (including localhost HTTPS)
app.use(
  session({
    secret:            process.env.SESSION_SECRET || 'changeme-in-production',
    resave:            false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure:   hasCerts || process.env.NODE_ENV === 'production', // HTTPS only
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ── Body Parsing ──────────────────────────────────────────────────────────────
// /webhook MUST receive the raw Buffer so @line/bot-sdk can verify the
// X-Line-Signature HMAC.  Register this BEFORE the global express.json().
app.use('/webhook', express.raw({ type: 'application/json' }));

// All other routes get the normal JSON + URL-encoded parsers.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    // Prevent browser caching of HTML pages during dev/testing
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook',  webhookRouter);
app.use('/api',     portalRouter);
app.use('/auth',    authRouter);

// Health-check
app.get('/health', (_req, res) => {
  res.json({
    status:   'ok',
    uptime:   process.uptime(),
    timestamp: new Date().toISOString(),
    https:    hasCerts,
  });
});

// ── Partner B join page — must be at /join/:nestCode to match inviteUrl ───────
app.get('/join/:nestCode', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ── MongoDB Connection (with retry) ──────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('[DB] MongoDB connected successfully');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] Disconnected — reconnecting in 5s...');
  setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] Error:', err.message);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
let server;

(async () => {
  await connectDB();

  startReminderCron();
  startSummaryCron();

  if (hasCerts) {
    // ── HTTPS mode (local dev with self-signed cert) ──────────────────────────
    const tlsOptions = {
      key:  fs.readFileSync(KEY_FILE),
      cert: fs.readFileSync(CRT_FILE),
    };
    server = https.createServer(tlsOptions, app).listen(PORT, () => {
      console.log(`[Server] 🔒 HTTPS server running at https://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } else {
    // ── HTTP fallback (run setup:https to enable TLS) ─────────────────────────
    server = http.createServer(app).listen(PORT, () => {
      console.log(`[Server] ⚠️  HTTP server running at http://localhost:${PORT}`);
      console.log(`[Server] Run "npm run setup:https" to enable HTTPS.`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }
})();

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully…`);
  if (server) server.close(() => console.log('[Server] Server closed'));
  await mongoose.connection.close();
  console.log('[DB] Mongoose connection closed');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
