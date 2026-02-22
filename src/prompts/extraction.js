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
 * @returns {string}
 */
function buildExtractionPrompt(
  senderName, senderRole, text,
  datetime, timezone,
  partnerAName, partnerBName,
) {
  const system =
    'You are an intelligent assistant for a couples app called Lovebirds Lounge. ' +
    'Extract structured data from messages. ' +
    'Return ONLY valid JSON with no markdown or explanation.';

  const user =
    `Couple: ${partnerAName} (A) and ${partnerBName} (B)\n` +
    `Sender: ${senderName} (Partner ${senderRole})\n` +
    `Current time: ${datetime} ${timezone}\n` +
    `Message: "${text}"\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "events": [{\n` +
    `    "type": "interview|meeting|call|appointment|date|other",\n` +
    `    "description": "brief description",\n` +
    `    "datetime": "ISO8601 or null",\n` +
    `    "involvedPerson": "A|B|both"\n` +
    `  }],\n` +
    `  "emotion": "positive|neutral|concerned",\n` +
    `  "keyFacts": ["concise facts worth remembering"],\n` +
    `  "reminders": [{\n` +
    `    "recipientRole": "A|B|both",\n` +
    `    "message": "warm 1-sentence Lumi DM, no instructions, just awareness",\n` +
    `    "scheduledAt": "ISO8601"\n` +
    `  }]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Only create reminders when a specific time is clearly mentioned\n` +
    `- Reminder message must NOT tell recipient what to do\n` +
    `- scheduledAt must be after current datetime\n` +
    `- Return empty arrays if nothing to extract\n` +
    `- Return ONLY the JSON object, nothing else`;

  return `${system}\n\n${user}`;
}

module.exports = { buildExtractionPrompt };
