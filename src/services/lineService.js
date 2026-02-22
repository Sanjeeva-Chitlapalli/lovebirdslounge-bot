'use strict';

const { Client } = require('@line/bot-sdk');

// Lazily initialised so the client picks up env vars after dotenv loads
let _client = null;

function getClient() {
  if (!_client) {
    _client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return _client;
}

// ── replyMessage() ─────────────────────────────────────────────────────────────

/**
 * Send a text reply to a group / user using a LINE reply token.
 * Reply tokens are free of charge but single-use and short-lived.
 *
 * @param {string} replyToken – from the LINE webhook event
 * @param {string} text
 */
async function replyMessage(replyToken, text) {
  return getClient().replyMessage(replyToken, {
    type: 'text',
    text,
  });
}

// ── sendDM() ───────────────────────────────────────────────────────────────────

/**
 * Send a push (DM) message directly to a LINE user.
 * Costs one push-message quota per call.
 *
 * If the user has not yet followed (friended) the bot, LINE returns HTTP 400.
 * That error is caught, logged, and silently skipped so the caller is unaffected.
 *
 * @param {string} lineUserId – the recipient's LINE user ID
 * @param {string} text
 */
async function sendDM(lineUserId, text) {
  try {
    await getClient().pushMessage(lineUserId, {
      type: 'text',
      text,
    });
  } catch (err) {
    // LINE returns 400 when the user hasn't followed the bot yet
    const status = err?.statusCode ?? err?.response?.status;
    console.warn(
      `[LineService] sendDM to ${lineUserId} failed` +
      (status ? ` (HTTP ${status})` : '') +
      ` — user may not have followed the bot: ${err.message}`
    );
  }
}

module.exports = { replyMessage, sendDM };
