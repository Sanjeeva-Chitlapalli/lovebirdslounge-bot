'use strict';

function buildExtractionPrompt(
  senderName, senderRole, text,
  datetime, timezone,
  partnerAName, partnerBName,
  recentHistory = '',
  nest = null
) {
  const system =
    'You are an AI assistant for a couples app called Lovebirds Lounge. Extract basic facts from the current message in the context of the recent history.\n' +
    'Return ONLY valid JSON with no markdown or explanation.';

  const user =
    `Couple: ${partnerAName} (A${nest?.partnerA?.gender ? ', ' + nest.partnerA.gender : ''}) and ${partnerBName} (B${nest?.partnerB?.gender ? ', ' + nest.partnerB.gender : ''})\n` +
    `Current time: ${datetime} ${timezone}\n` +
    `Recent Conversation Context (Last 24hrs):\n${recentHistory}\n\n` +
    `Current Message Sender: ${senderName} (Partner ${senderRole})\n` +
    `Current Message: "${text}"\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "events": [{\n` +
    `    "type": "interview|meeting|call|appointment|date|other",\n` +
    `    "description": "brief description",\n` +
    `    "datetime": "ISO8601 with exact same timezone offset as Current time or null",\n` +
    `    "involvedPerson": "A|B|both"\n` +
    `  }],\n` +
    `  "emotion": "positive|neutral|concerned|sad|stressed",\n` +
    `  "keyFacts": ["concise facts worth remembering"]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Return empty arrays if nothing to extract.\n` +
    `- Return ONLY the JSON object.`;

  return `${system}\n\n${user}`;
}

function buildReflectionPrompt(
  senderName, senderRole, currentMessageText,
  extractedDataRaw,
  datetime, timezone,
  partnerAName, partnerBName,
  recentHistory = '',
  partnerALikes = [],
  partnerBLikes = [],
  nest = null
) {
  const system =
    'You are Lumi, a thoughtful AI relationship companion. Your job is to deeply analyze the couple’s recent conversation and extracted facts, ' +
    'then proactively suggest supportive actions, thoughtful reminders, or discover new likes/dislikes.\n' +
    'Return ONLY valid JSON with no markdown.';

  const likesA = partnerALikes && partnerALikes.length ? partnerALikes.join(', ') : 'None yet';
  const likesB = partnerBLikes && partnerBLikes.length ? partnerBLikes.join(', ') : 'None yet';

  const user =
    `Couple: ${partnerAName} (A${nest?.partnerA?.gender ? ', ' + nest.partnerA.gender : ''}) and ${partnerBName} (B${nest?.partnerB?.gender ? ', ' + nest.partnerB.gender : ''})\n` +
    `Current time: ${datetime} ${timezone}\n` +
    `Known Likes/Dislikes for ${partnerAName}: ${likesA}\n` +
    `Known Likes/Dislikes for ${partnerBName}: ${likesB}\n` +
    `Recent Conversation Context (Last 24hrs):\n${recentHistory}\n\n` +
    `New message from ${senderName} (Partner ${senderRole}): "${currentMessageText}"\n\n` +
    `Newly Extracted Facts from the latest message:\n${extractedDataRaw}\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "newPreferencesA": ["e.g. loves chocolate", "e.g. hates spiders"],\n` +
    `  "newPreferencesB": [],\n` +
    `  "reminders": [{\n` +
    `    "recipientRole": "A|B",\n` +
    `    "message": "warm 1-sentence DM, suggesting a thoughtful action/check-in based on context (e.g. 'A had a tough day, maybe send them some chocolates?')",\n` +
    `    "scheduledAt": "ISO8601 with exact same timezone offset as Current time"\n` +
    `  }]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- ALWAYS look for opportunities to be thoughtful. If someone is stressed, sad, or has an upcoming event, create a reminder for their partner to check in.\n` +
    `- Use the known likes to personalize the reminder (e.g., if A likes pizza, suggest B gets pizza for A).\n` +
    `- Reminder message must be a gentle suggestion, NOT forceful.\n` +
    `- scheduledAt must be logically determined (immediate if comfort needed today, or morning of an event) and must be strictly AFTER ${datetime}. MUST BE A FULL ISO8601 STRING WITH THE EXACT SAME TIMEZONE OFFSET AS PROVIDED IN 'Current time' (e.g., end with +05:30 or Z as given).\n` +
    `- Make absolutely sure you associate preferences correctly! The sender of the current message is ${senderName} (Partner ${senderRole}). If THEY state they like something, put it in newPreferences${senderRole}.\n` +
    `- Be highly perceptive to subtle cues. If the text says "wish me luck", create a reminder to check in how it went.\n` +
    `- Return empty arrays if absolutely nothing of value is found.\n` +
    `- Return ONLY the JSON object.`;

  return `${system}\n\n${user}`;
}

module.exports = { buildExtractionPrompt, buildReflectionPrompt };
