'use strict';

/**
 * Build the Gemini prompt for structured message extraction.
 *
 * @param {string} senderName
 * @param {string} senderRole    – 'A' or 'B'
 * @param {string} text          – raw message text
 * @param {string} datetime      – local ISO-like string, e.g. "2026-02-22T18:00:00"
 * @param {string} timezone      – IANA tz, e.g. "Asia/Bangkok"
 * @param {string} partnerAName
 * @param {string} partnerBName
 * @param {string} recentHistory – last 24hrs of messages string
 * @param {string[]} partnerALikes – array of likes for A
 * @param {string[]} partnerBLikes – array of likes for B
 * @returns {string}
 */
function buildExtractionPrompt(
  senderName, senderRole, text,
  datetime, timezone,
  partnerAName, partnerBName,
  recentHistory = '',
  partnerALikes = [],
  partnerBLikes = []
) {
  const system =
    'You are an intelligent assistant for a couples app called Lovebirds Lounge. ' +
    'Extract structured data from messages. You also act as a thoughtful companion, ' +
    'suggesting reminders for partners to check in on each other, show presence, and be thoughtful ' +
    '(e.g., if one is having a bad day, suggest sending their favorite comfort food based on their likes). ' +
    'Learn about each person\'s likes and dislikes from the chat. ' +
    'Return ONLY valid JSON with no markdown or explanation.';

  const likesA = partnerALikes && partnerALikes.length ? partnerALikes.join(', ') : 'None yet';
  const likesB = partnerBLikes && partnerBLikes.length ? partnerBLikes.join(', ') : 'None yet';

  const user =
    `Couple: ${partnerAName} (A) and ${partnerBName} (B)\n` +
    `Current time: ${datetime} ${timezone}\n` +
    `Known Likes/Dislikes for ${partnerAName}: ${likesA}\n` +
    `Known Likes/Dislikes for ${partnerBName}: ${likesB}\n` +
    `Recent Conversation Context (Last 24hrs):\n${recentHistory}\n\n` +
    `Current Message Sender: ${senderName} (Partner ${senderRole})\n` +
    `Current Message: "${text}"\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "events": [{\n` +
    `    "type": "interview|meeting|call|appointment|date|other",\n` +
    `    "description": "brief description",\n` +
    `    "datetime": "ISO8601 or null",\n` +
    `    "involvedPerson": "A|B|both"\n` +
    `  }],\n` +
    `  "emotion": "positive|neutral|concerned|sad|stressed",\n` +
    `  "keyFacts": ["concise facts worth remembering"],\n` +
    `  "newPreferencesA": ["e.g. loves chocolate", "e.g. hates spiders"],\n` +
    `  "newPreferencesB": [],\n` +
    `  "reminders": [{\n` +
    `    "recipientRole": "A|B",\n` +
    `    "message": "warm 1-sentence Lumi DM, suggesting a thoughtful action or check-in based on context (e.g. 'A had a tough day, maybe send them some chocolates?')",\n` +
    `    "scheduledAt": "ISO8601"\n` +
    `  }]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Use the Recent Conversation Context to fully understand what is going on. Reminders should be for thoughtful actions (e.g., ask about an interview, send comfort food if having a bad day) and personalized using the context and known likes/dislikes.\n` +
    `- Reminder message must NOT tell recipient what to do forcefully, just a gentle suggestion.\n` +
    `- scheduledAt must be logically determined (e.g., immediate if comfort is needed today, or morning of an event) and must be after ${datetime}.\n` +
    `- newPreferencesA and newPreferencesB should only contain newly discovered likes/dislikes from the current message.\n` +
    `- Return empty arrays if nothing to extract or no new preferences.\n` +
    `- Return ONLY the JSON object, nothing else`;

  return `${system}\n\n${user}`;
}

module.exports = { buildExtractionPrompt };
