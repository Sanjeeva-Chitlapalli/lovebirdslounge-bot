'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const Message    = require('../models/Message');
const Memory     = require('../models/Memory');
const lineService = require('./lineService');
const { buildMentionPrompt } = require('../prompts/mention');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Gemini helper with exponential-backoff retry ──────────────────────────────
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

async function callGeminiWithRetry(prompt) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  let lastErr;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(
          `[Mention] Gemini attempt ${attempt + 1} failed (${err.message}), ` +
          `retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s…`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayMidnightUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatTime(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `[${hh}:${mm}]`;
}

// ── reply() ───────────────────────────────────────────────────────────────────
/**
 * Respond to an @Lumi mention in a group chat.
 *
 * Called fire-and-forget from webhook.js — MUST never throw uncaught.
 *
 * @param {object}                   event – raw LINE webhook event
 * @param {import('../models/Nest')} nest  – Mongoose Nest doc
 */
async function reply(event, nest) {
  try {
    // 1 ── Today's messages for context ───────────────────────────────────────
    const todayMessages = await Message.find({
      nestId:    nest._id,
      timestamp: { $gte: todayMidnightUTC() },
    })
      .sort({ timestamp: 1 })
      .lean();

    const todayChat = todayMessages
      .map((m) => `${formatTime(new Date(m.timestamp))} ${m.senderName ?? m.senderId}: ${m.text}`)
      .join('\n');

    // 2 ── Rolling Memory summary ──────────────────────────────────────────────
    const memory  = await Memory.findOne({ nestId: nest._id }).lean();
    const summary = memory?.summary || 'No prior summary yet.';

    // 3 ── Clean question: strip @Lumi / @lumi ─────────────────────────────────
    const cleanQuestion = (event.message?.text ?? '')
      .replace(/@lumi\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 4 ── Build prompt and call Gemini ────────────────────────────────────────
    const prompt = buildMentionPrompt(
      summary,
      todayChat,
      cleanQuestion,
      nest.partnerA?.name ?? 'Partner A',
      nest.partnerB?.name ?? 'Partner B',
      nest.timezone,
      nest.partnerA?.likesAndDislikes,
      nest.partnerB?.likesAndDislikes
    );

    const replyText = await callGeminiWithRetry(prompt);

    // 5 ── Send reply via LINE ─────────────────────────────────────────────────
    await lineService.replyMessage(event.replyToken, replyText);

    console.log(
      `[Mention] Replied in nest=${nest.nestCode} | ` +
      `context_msgs=${todayMessages.length} | memory=${summary ? 'yes' : 'none'}`
    );

  } catch (err) {
    console.error('[Mention] Error generating/sending reply:', err.message);

    // Best-effort fallback
    try {
      await lineService.replyMessage(
        event.replyToken,
        'ขอโทษนะคะ ตอนนี้ Lumi ยุ่งอยู่นิดหน่อย ลองถามใหม่ได้เลยนะคะ 🌙'
      );
    } catch {
      // Reply token may already be expired — ignore
    }
  }
}

module.exports = { reply };
