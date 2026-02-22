'use strict';

/**
 * Build the Gemini prompt for on-the-fly reminder generation.
 *
 * Note: reminders are normally pre-generated at extraction time and stored
 * as-is. This prompt is only used if a reminder needs to be regenerated
 * (e.g. re-delivery, manual trigger, or content refresh).
 *
 * Caller: reminderService.sendDueReminders() — only if regeneration is needed.
 *
 * @param {string} recipientName    – name of partner receiving the reminder
 * @param {string} partnerName      – name of their partner
 * @param {string} eventDescription – short description of the event
 * @param {string} eventTime        – human-readable time string, e.g. "3:00 PM today"
 * @returns {string}
 */
function buildReminderPrompt(recipientName, partnerName, eventDescription, eventTime) {
  const system = `You are Lumi 🌙, a gentle companion for couples.`;

  const user = `Write a warm, 1-sentence DM reminder to ${recipientName} letting them know that ${partnerName}'s ${eventDescription} is happening at ${eventTime}. Don't tell them what to do. Just make them aware, warmly.`;

  return `${system}\n\n${user}`;
}

module.exports = { buildReminderPrompt };
