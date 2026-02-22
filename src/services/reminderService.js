'use strict';

const Reminder    = require('../models/Reminder');
const Nest        = require('../models/Nest');
const lineService = require('./lineService');

// ── schedule() ────────────────────────────────────────────────────────────────

/**
 * Persist one (or two) Reminder document(s) for a nest.
 *
 * Resolves `recipientRole` ("A" | "B" | "both") to the real lineUserId(s)
 * stored on the Nest document, then writes a Reminder row for each recipient.
 *
 * The `message` text is already fully formed by the extraction pipeline —
 * no additional AI call is made here.
 *
 * @param {string} nestId
 * @param {object} reminderData
 * @param {"A"|"B"|"both"} reminderData.recipientRole
 * @param {string}         reminderData.message      – pre-generated reminder text
 * @param {string|Date}    reminderData.scheduledAt  – ISO string or Date
 * @param {mongoose.Types.ObjectId} [reminderData.sourceMessageId]
 * @returns {Promise<object[]>}  Array of saved Reminder docs (1 or 2 items)
 */
async function schedule(nestId, reminderData) {
  const { recipientRole, message, scheduledAt, sourceMessageId = null } = reminderData;

  // ── Validate inputs ─────────────────────────────────────────────────────────
  if (!nestId || !recipientRole || !message || !scheduledAt) {
    console.warn('[ReminderService] schedule() called with missing fields — skipped');
    return [];
  }

  const at = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (isNaN(at.getTime())) {
    console.warn('[ReminderService] schedule() received invalid scheduledAt — skipped');
    return [];
  }

  // ── Look up nest to resolve partner data ────────────────────────────────────
  const nest = await Nest.findOne({ nestId }).lean();
  if (!nest) {
    console.warn(`[ReminderService] Nest not found: nestId=${nestId} — skipped`);
    return [];
  }

  // ── Build list of recipients from role ──────────────────────────────────────
  const recipients = [];

  if (recipientRole === 'A' || recipientRole === 'both') {
    if (nest.partnerA?.lineUserId) {
      recipients.push({
        lineUserId: nest.partnerA.lineUserId,
        name:       nest.partnerA.name,
        partner:    nest.partnerB?.name,
      });
    } else {
      console.warn(`[ReminderService] partnerA has no lineUserId in nest=${nestId} — skipped`);
    }
  }

  if (recipientRole === 'B' || recipientRole === 'both') {
    if (nest.partnerB?.lineUserId) {
      recipients.push({
        lineUserId: nest.partnerB.lineUserId,
        name:       nest.partnerB.name,
        partner:    nest.partnerA?.name,
      });
    } else {
      console.warn(`[ReminderService] partnerB has no lineUserId in nest=${nestId} — skipped`);
    }
  }

  if (!recipients.length) {
    console.warn(`[ReminderService] No valid recipients for role="${recipientRole}" nest=${nestId}`);
    return [];
  }

  // ── Create one Reminder document per recipient ──────────────────────────────
  const saved = [];

  for (const recipient of recipients) {
    const doc = await Reminder.create({
      nestId,
      recipientLineId: recipient.lineUserId,
      recipientName:   recipient.name,
      partnerName:     recipient.partner,
      message,
      scheduledAt:     at,
      sourceMessageId,
    });

    saved.push(doc);

    console.log(
      `[ReminderService] Scheduled — id=${doc._id} ` +
      `for=${recipient.name ?? recipient.lineUserId} ` +
      `at=${at.toISOString()}`
    );
  }

  return saved;
}

// ── sendDueReminders() ────────────────────────────────────────────────────────

/**
 * Find all unsent reminders whose scheduledAt is now or in the past.
 * For each, send a LINE DM and mark the reminder as sent.
 *
 * No AI call is made — the message text was already generated at extraction time.
 * Called by reminderCron on a schedule.
 */
async function sendDueReminders() {
  const due = await Reminder.find({
    scheduledAt: { $lte: new Date() },
    sent:        false,
  });

  if (!due.length) return;

  console.log(`[ReminderService] Processing ${due.length} due reminder(s)`);

  for (const reminder of due) {
    try {
      await lineService.sendDM(reminder.recipientLineId, reminder.message);

      reminder.sent = true;
      await reminder.save();

      console.log(
        `[ReminderService] Sent — id=${reminder._id} ` +
        `to=${reminder.recipientName ?? reminder.recipientLineId}`
      );
    } catch (err) {
      console.error(`[ReminderService] Failed — id=${reminder._id}: ${err.message}`);
    }
  }
}

module.exports = { schedule, sendDueReminders };
