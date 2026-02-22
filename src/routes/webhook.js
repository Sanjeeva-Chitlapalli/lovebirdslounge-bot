'use strict';

const express = require('express');
const router  = express.Router();
const { middleware, Client } = require('@line/bot-sdk');

const Nest              = require('../models/Nest');
const Message           = require('../models/Message');
const extractionService = require('../services/extractionService');
const mentionService    = require('../services/mentionService');

// ── LINE SDK config ───────────────────────────────────────────────────────────
const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// Lazily-initialised client so env vars are resolved after dotenv runs
let _client = null;
function getClient() {
  if (!_client) _client = new Client(lineConfig);
  return _client;
}

// ── Signature verification ────────────────────────────────────────────────────
// app.js registers express.raw({ type: 'application/json' }) for /webhook
// BEFORE this router, so req.body is a Buffer when middleware() runs.
router.use(middleware(lineConfig));

// Handle invalid signature → 400, not 500
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  console.warn('[Webhook] Signature verification failed:', err.message);
  res.status(400).json({ error: 'Invalid LINE signature' });
});

// ── POST /webhook ─────────────────────────────────────────────────────────────
/**
 * LINE requires a 200 response within 1 s.
 * Acknowledge immediately, then dispatch each event asynchronously.
 */
router.post('/', (req, res) => {
  res.sendStatus(200);

  const events = req.body?.events ?? [];
  for (const event of events) {
    handleEvent(event).catch((err) =>
      console.error('[Webhook] Unhandled event error:', err.message)
    );
  }
});

// ── Event dispatcher ──────────────────────────────────────────────────────────
async function handleEvent(event) {
  switch (event.type) {
    case 'join':     return handleJoin(event);
    case 'follow':   return handleFollow(event);
    case 'unfollow': return handleUnfollow(event);
    case 'message':
      if (event.message?.type === 'text') return handleTextMessage(event);
      break;
    default:        // silently ignore leave, postback, etc.
  }
}

// ── Handler: bot added to a group ─────────────────────────────────────────────
async function handleJoin(event) {
  try {
    await getClient().replyMessage(event.replyToken, {
      type: 'text',
      text:
        "Hey! I'm Lumi 🌙 I'm here to help look after your nest.\n" +
        'One of you type /link [nestCode] to connect me to your nest 💛',
    });
    console.log('[Webhook] Join event — sent welcome reply');
  } catch (err) {
    console.error('[Webhook] handleJoin error:', err.message);
  }
}

// ── Handler: text message in a group ─────────────────────────────────────────
async function handleTextMessage(event) {
  const groupChatId = event.source?.groupId ?? event.source?.roomId;

  // Only handle group messages
  if (!groupChatId) return;

  const senderId = event.source.userId;
  const text     = event.message.text?.trim() ?? '';

  // a) /link command — connect nest to this group
  if (text.startsWith('/link')) {
    return handleLinkCommand(event, groupChatId, text);
  }

  // b) Bot's own messages (e.g. after /link confirmation)
  if (senderId === process.env.LINE_BOT_USER_ID) return;

  // c) Find the active nest for this group
  const nest = await Nest.findOne({ groupChatId, status: 'active' });
  if (!nest) return; // group not linked to any active nest — silent

  // d) Deduplication: skip if message already stored
  const lineMessageId = event.message.id;
  const exists = await Message.findOne({ lineMessageId });
  if (exists) return;

  // Resolve display name without an API call if possible
  let senderName = resolveSenderName(senderId, nest);
  if (!senderName) {
    try {
      const profile = await getClient().getGroupMemberProfile(groupChatId, senderId);
      senderName = profile.displayName;
    } catch {
      senderName = senderId; // graceful fallback
    }
  }

  // e) Save message
  const savedMessage = await Message.create({
    nestId: nest._id,
    senderId,
    senderName,
    text,
    timestamp:     new Date(event.timestamp),
    lineMessageId,
  });

  console.log(
    `[Webhook] Message saved — nest=${nest.nestCode} sender=${senderName} len=${text.length}`
  );

  // f) AI extraction — fire-and-forget
  extractionService
    .extract(savedMessage, nest)
    .catch((err) => console.error('[Webhook] Extraction error:', err.message));

  // g) @Lumi mention — fire-and-forget
  if (/@lumi\b/i.test(text)) {
    mentionService
      .reply(event, nest)
      .catch((err) => console.error('[Webhook] Mention error:', err.message));
  }
}

// ── Handler: /link [nestCode] command ─────────────────────────────────────────
async function handleLinkCommand(event, groupChatId, text) {
  const parts    = text.split(/\s+/);
  const nestCode = parts[1]?.toUpperCase();

  if (!nestCode) {
    return getClient().replyMessage(event.replyToken, {
      type: 'text',
      text: 'Please include your nest code, e.g. /link ABC123 💛',
    }).catch(() => {});
  }

  try {
    const nest = await Nest.findOne({ nestCode, status: 'pending_line' });

    if (!nest) {
      await getClient().replyMessage(event.replyToken, {
        type: 'text',
        text: `Hmm, I couldn't find a nest with code ${nestCode} waiting to be linked. ` +
              'Check the code and make sure both partners have logged in on the portal 💛',
      });
      return;
    }

    nest.groupChatId = groupChatId;
    nest.status      = 'active';
    await nest.save();

    console.log(`[Webhook] Nest ${nestCode} linked to group ${groupChatId}`);

    await getClient().replyMessage(event.replyToken, {
      type: 'text',
      text:
        'Your nest is connected! 🌙 I\'ll watch over your conversations and send you gentle reminders.\n' +
        "I'll be quiet unless you @Lumi me 💛",
    });
  } catch (err) {
    console.error('[Webhook] handleLinkCommand error:', err.message);
  }
}

// ── Handler: follow event (user added bot as friend / unblocked) ──────────────
async function handleFollow(event) {
  const userId = event.source?.userId;
  if (!userId) return;

  try {
    const nest = await Nest.findOne({
      $or: [
        { 'partnerA.lineUserId': userId },
        { 'partnerB.lineUserId': userId },
      ],
    });

    if (!nest) {
      console.log(`[Webhook] Follow from unregistered user ${userId} — ignored`);
      return;
    }

    const isA = nest.partnerA?.lineUserId === userId;
    const me      = isA ? nest.partnerA : nest.partnerB;
    const partner = isA ? nest.partnerB : nest.partnerA;

    // Mark DM as active
    if (isA) { nest.partnerA.dmActive = true; }
    else      { nest.partnerB.dmActive = true; }
    await nest.save();

    const welcomeText =
      `Hey ${me.name ?? 'there'}! I'm Lumi 🌙\n` +
      `I'll send you gentle reminders about ${partner.name ?? 'your partner'}. ` +
      "You don't need to do anything — I've got you 💛";

    await getClient().replyMessage(event.replyToken, {
      type: 'text',
      text: welcomeText,
    });

    console.log(`[Webhook] Welcome DM replied to ${me.name ?? userId}`);
  } catch (err) {
    console.error('[Webhook] handleFollow error:', err.message);
  }
}

// ── Handler: unfollow event (user blocked the bot) ────────────────────────────
async function handleUnfollow(event) {
  const userId = event.source?.userId;
  if (!userId) return;

  try {
    const nest = await Nest.findOne({
      $or: [
        { 'partnerA.lineUserId': userId },
        { 'partnerB.lineUserId': userId },
      ],
    });

    if (!nest) {
      console.log(`[Webhook] Unfollow from unregistered user ${userId} — ignored`);
      return;
    }

    const isA = nest.partnerA?.lineUserId === userId;

    // Mark DM as inactive
    if (isA) { nest.partnerA.dmActive = false; }
    else      { nest.partnerB.dmActive = false; }
    
    await nest.save();

    console.log(`[Webhook] User ${userId} unfollowed (dmActive marked false)`);
  } catch (err) {
    console.error('[Webhook] handleUnfollow error:', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveSenderName(userId, nest) {
  if (nest.partnerA?.lineUserId === userId) return nest.partnerA.name ?? null;
  if (nest.partnerB?.lineUserId === userId) return nest.partnerB.name ?? null;
  return null;
}

module.exports = router;
