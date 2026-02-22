'use strict';

/**
 * dev-tunnel.js
 * ─────────────
 * Starts the LoveBirds Lounge bot + a Cloudflare quick-tunnel together.
 *
 * Strategy (no port conflicts):
 *   1. Load .env
 *   2. Start cloudflared tunnel on PORT (waits for URL, ~3 s)
 *   3. Once we have the public HTTPS URL, start the bot with BASE_URL set
 *   4. Write the URL to .tunnel-url for reference
 *   5. Print the banner with LINE console instructions
 *   6. Shut both down gracefully on Ctrl+C
 */

require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const PORT        = process.env.PORT || 3000;
const CLOUDFLARED = path.join(__dirname, '..', 'bin', 'cloudflared.exe');
const URL_FILE    = path.join(__dirname, '..', '.tunnel-url');

// ── ANSI colours ──────────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(prefix, color, msg) {
  process.stdout.write(`${color}${c.bold}[${prefix}]${c.reset} ${msg}\n`);
}

// ── State ─────────────────────────────────────────────────────────────────────
let botProc = null;
let cfProc  = null;

// ── Step 1: Start cloudflared, resolve when we have the public URL ─────────────
function startTunnel() {
  return new Promise((resolve, reject) => {
    log('Tunnel', c.cyan, `Opening Cloudflare Quick Tunnel on port ${PORT}…`);

    cfProc = spawn(CLOUDFLARED, [
      'tunnel', '--url', `http://localhost:${PORT}`,
      '--no-autoupdate',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    cfProc.on('error', (err) => {
      log('Tunnel', c.red, `cloudflared error: ${err.message}`);
      reject(err);
    });

    let resolved = false;

    function hunt(chunk) {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    }

    cfProc.stdout.on('data', hunt);
    cfProc.stderr.on('data', hunt);

    // Give cloudflared up to 25 s to negotiate
    setTimeout(() => {
      if (!resolved) reject(new Error('Timed out waiting for cloudflared URL (25 s)'));
    }, 25_000);
  });
}

// ── Step 2: Start the bot with the correct BASE_URL ───────────────────────────
function startBot(publicUrl) {
  log('Bot', c.green, `Starting server (BASE_URL=${publicUrl})…`);

  botProc = spawn('node', ['app.js'], {
    cwd:   path.join(__dirname, '..'),
    env:   { ...process.env, BASE_URL: publicUrl },
    stdio: 'inherit',
  });

  botProc.on('error', (err) => log('Bot', c.red, `Process error: ${err.message}`));
  botProc.on('exit', (code, signal) => {
    if (signal !== 'SIGINT' && signal !== 'SIGTERM' && code !== 0) {
      log('Bot', c.red, `Exited (code=${code} signal=${signal})`);
    }
  });
}

// ── Step 3: Print banner ──────────────────────────────────────────────────────
function printBanner(publicUrl) {
  const callbackUrl = `${publicUrl}/auth/line/callback`;

  // Write to .tunnel-url so scripts or editors can read it
  try { fs.writeFileSync(URL_FILE, publicUrl + '\n'); } catch {}

  console.log('');
  console.log(`${c.magenta}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  🌙 LoveBirds Lounge — Tunnel Active${c.reset}`);
  console.log(`${c.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${c.bold}Portal  :${c.reset}  ${publicUrl}/`);
  console.log(`  ${c.bold}Health  :${c.reset}  ${publicUrl}/health`);
  console.log(`  ${c.bold}Webhook :${c.reset}  ${publicUrl}/webhook`);
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠️  ACTION REQUIRED — Update LINE Developers Console${c.reset}`);
  console.log('');
  console.log(`  ${c.yellow}LINE Login channel → Callback URL → set to:${c.reset}`);
  console.log(`    ${c.bold}${callbackUrl}${c.reset}`);
  console.log('');
  console.log(`  ${c.yellow}Messaging API channel → Webhook URL → set to:${c.reset}`);
  console.log(`    ${c.bold}${publicUrl}/webhook${c.reset}`);
  console.log(`    Then click "Verify".`);
  console.log(`${c.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  Press ${c.bold}Ctrl+C${c.reset} to stop everything.`);
  console.log('');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log('');
  log('Dev', c.yellow, `${signal} — shutting down…`);
  if (botProc && !botProc.killed)  botProc.kill('SIGINT');
  if (cfProc  && !cfProc.killed)   cfProc.kill();
  try { fs.unlinkSync(URL_FILE); } catch {}
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    // Cloudflare tunnel negotiates BEFORE the bot starts,
    // so port 3000 is free when startTunnel() runs.
    const publicUrl = await startTunnel();
    log('Tunnel', c.green, `Tunnel open: ${c.bold}${publicUrl}${c.reset}`);

    startBot(publicUrl);
    printBanner(publicUrl);
  } catch (err) {
    log('Dev', c.red, `Fatal: ${err.message}`);
    shutdown('error');
  }
}

main();
