'use strict';

/**
 * setup-https.js
 * ──────────────
 * Generates a self-signed SSL certificate for local HTTPS development.
 * Run once: npm run setup:https
 *
 * Creates:
 *   certs/localhost.key  — private key
 *   certs/localhost.crt  — certificate
 *
 * After running, start the server normally:
 *   npm run dev   (picks up certs automatically)
 */

const selfsigned = require('selfsigned');
const fs         = require('fs');
const path       = require('path');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
const KEY_FILE  = path.join(CERTS_DIR, 'localhost.key');
const CRT_FILE  = path.join(CERTS_DIR, 'localhost.crt');

// ── Check if certs already exist ──────────────────────────────────────────────
if (fs.existsSync(KEY_FILE) && fs.existsSync(CRT_FILE)) {
  console.log('✅  Certs already exist at certs/localhost.key + certs/localhost.crt');
  console.log('    Delete them and re-run to regenerate.');
  process.exit(0);
}

// ── Generate ──────────────────────────────────────────────────────────────────
console.log('🔐  Generating self-signed SSL certificate for localhost…');

const attrs = [{ name: 'commonName', value: 'localhost' }];
const opts  = {
  keySize:        2048,
  days:           825,   // max trusted by Chrome/Safari
  algorithm:      'sha256',
  extensions: [
    { name: 'subjectAltName', altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ]},
  ],
};

const pems = selfsigned.generate(attrs, opts);

// ── Write files ───────────────────────────────────────────────────────────────
fs.mkdirSync(CERTS_DIR, { recursive: true });
fs.writeFileSync(KEY_FILE, pems.private,  { mode: 0o600 });
fs.writeFileSync(CRT_FILE, pems.cert,     { mode: 0o644 });

console.log('');
console.log('✅  Certificate generated:');
console.log(`    ${KEY_FILE}`);
console.log(`    ${CRT_FILE}`);
console.log('');
console.log('📋  Next steps:');
console.log('');
console.log('  1. Trust the cert in your browser (one-time):');
console.log('     Chrome → chrome://flags/#allow-insecure-localhost → Enable → Relaunch');
console.log('     OR: double-click certs/localhost.crt → Install Certificate →');
console.log('         Local Machine → Trusted Root Certification Authorities');
console.log('');
console.log('  2. In LINE Developers Console → LINE Login channel → Callback URL, add:');
console.log('     https://localhost:3000/auth/line/callback');
console.log('');
console.log('  3. Start the server:');
console.log('     npm run dev');
console.log('');
