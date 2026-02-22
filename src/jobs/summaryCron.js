'use strict';

const cron                   = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Nest                   = require('../models/Nest');
const Message                = require('../models/Message');
const Memory                 = require('../models/Memory');
const { buildSummarizePrompt } = require('../prompts/summarize');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MIN_MESSAGES     = 10;   // skip nests with fewer messages
const INTER_NEST_DELAY = 2_000; // ms between nests — avoids Gemini rate limits

// ── generateSummaries() ───────────────────────────────────────────────────────
async function generateSummaries() {
  const nests = await Nest.find({ status: 'active' }).lean();

  if (!nests.length) {
    console.log('[SummaryCron] No active nests — skipping.');
    return;
  }

  console.log(`[SummaryCron] Processing ${nests.length} active nest(s)…`);

  for (const nest of nests) {
    try {
      // 1. Skip if already being processed (crash guard)
      const mem = await Memory.findOne({ nestId: nest._id }).lean();
      if (mem?.isProcessing) {
        console.warn(`[SummaryCron] nest=${nest.nestCode} — isProcessing true, skipping`);
        continue;
      }

      // 2. Flag as processing
      await Memory.upsertForNest(nest._id, { isProcessing: true });

      // 3. Fetch last 90 messages, descending, then reverse for chronological order
      const messages = await Message.find({ nestId: nest._id })
        .sort({ timestamp: -1 })
        .limit(90)
        .lean();

      // 4. Skip if not enough messages
      if (messages.length < MIN_MESSAGES) {
        console.log(
          `[SummaryCron] nest=${nest.nestCode} — only ${messages.length} messages, skipping`
        );
        await Memory.upsertForNest(nest._id, { isProcessing: false });
        continue;
      }

      messages.reverse(); // oldest → newest

      // 5. Format: "[Date HH:MM] Name: text"
      const conversationLog = messages
        .map((m) => {
          const d    = new Date(m.timestamp);
          const date = d.toISOString().slice(0, 10);
          const hh   = String(d.getUTCHours()).padStart(2, '0');
          const mm_  = String(d.getUTCMinutes()).padStart(2, '0');
          const name = m.senderName ?? m.senderId;
          return `[${date} ${hh}:${mm_}] ${name}: ${m.text}`;
        })
        .join('\n');

      // 6. Call Gemini
      const prompt = buildSummarizePrompt(
        conversationLog,
        nest.partnerA?.name ?? 'Partner A',
        nest.partnerB?.name ?? 'Partner B',
      );

      const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const summary = result.response.text().trim();

      // 7. Upsert Memory with result and clear processing flag
      await Memory.upsertForNest(nest._id, {
        summary,
        messageCount: messages.length,
        generatedAt:  new Date(),
        isProcessing: false,
      });

      console.log(
        `[SummaryCron] nest=${nest.nestCode} — summary saved (${messages.length} messages)`
      );

    } catch (err) {
      // 8. Clear processing flag on error
      console.error(`[SummaryCron] nest=${nest.nestCode ?? nest._id} — error: ${err.message}`);
      try {
        await Memory.upsertForNest(nest._id, { isProcessing: false });
      } catch { /* best-effort */ }
    }

    // 2 s delay between nests to stay inside Gemini rate limits
    await new Promise((r) => setTimeout(r, INTER_NEST_DELAY));
  }
}

// ── startSummaryCron() ────────────────────────────────────────────────────────
function startSummaryCron() {
  const schedule = process.env.SUMMARY_CRON_SCHEDULE || '0 0 * * *'; // midnight UTC

  if (!cron.validate(schedule)) {
    console.error(`[SummaryCron] Invalid schedule "${schedule}" — using default.`);
  }

  cron.schedule(schedule, async () => {
    console.log('[SummaryCron] Running daily summary generation…');
    try {
      await generateSummaries();
    } catch (err) {
      console.error('[SummaryCron] Fatal error:', err.message);
    }
  });

  console.log(`[SummaryCron] Started — schedule: "${schedule}"`);
}

module.exports = { startSummaryCron };
