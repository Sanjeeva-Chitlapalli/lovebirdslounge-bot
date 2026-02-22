'use strict';

/**
 * Build the Gemini prompt for @Lumi mention replies.
 *
 * @param {string} summary       – rolling Memory summary (may be empty)
 * @param {string} todaysChat    – "[HH:MM] Name: text" lines for today (may be empty)
 * @param {string} question      – clean question with @Lumi stripped
 * @param {string} partnerAName
 * @param {string} partnerBName
 * @param {string} timezone      – IANA tz, for context label
 * @returns {string}
 */
function buildMentionPrompt(
  summary, todaysChat, question,
  partnerAName, partnerBName, timezone,
) {
  const system =
    `You are Lumi 🌙, a warm and caring companion for ${partnerAName} and ${partnerBName}. ` +
    `You observe their conversations and help them stay connected. ` +
    `Be warm, concise, and never intrusive. ` +
    `Max 3 sentences unless a list is truly needed. ` +
    `Never reveal raw data — speak naturally.`;

  const tz    = timezone ? ` (${timezone})` : '';
  const user  =
    `What I remember about this couple:\n` +
    `${summary || '(No prior context yet.)'}\n\n` +
    `Today's conversation${tz}:\n` +
    `${todaysChat || '(No messages today yet.)'}\n\n` +
    `They're asking: ${question}`;

  return `${system}\n\n${user}`;
}

module.exports = { buildMentionPrompt };
