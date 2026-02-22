'use strict';

/**
 * Build the Gemini prompt for generating a rolling Memory summary.
 *
 * @param {string} formattedMessages – "[YYYY-MM-DD HH:MM] Name: text" lines joined by \n
 * @param {string} partnerAName
 * @param {string} partnerBName
 * @returns {string}
 */
function buildSummarizePrompt(formattedMessages, partnerAName, partnerBName) {
  const system =
    "Summarize a couple's chat for an AI memory system. " +
    'Be concise. Output bullet points only.';

  const user =
    `Last 90 messages between ${partnerAName} and ${partnerBName}:\n\n` +
    `${formattedMessages}\n\n` +
    `Extract ONLY:\n` +
    `- Upcoming plans and scheduled events (with dates/times)\n` +
    `- Recurring habits or routines\n` +
    `- Important dates (anniversaries, birthdays)\n` +
    `- Emotional tone patterns\n` +
    `- Key facts about each person's life, work, interests\n\n` +
    `Be brief. No full sentences needed. No fluff.`;

  return `${system}\n\n${user}`;
}

module.exports = { buildSummarizePrompt };
