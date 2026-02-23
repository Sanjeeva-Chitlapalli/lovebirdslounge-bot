'use strict';

const cron        = require('node-cron');
const Reminder    = require('../models/Reminder');
const Nest        = require('../models/Nest');
const lineService = require('../services/lineService');

// ── sendDueReminders() ────────────────────────────────────────────────────────
async function sendDueReminders() {
  const due = await Reminder.find({
    scheduledAt: { $lte: new Date() },
    sent:        false,
  });

  if (!due.length) return;

  console.log(`[ReminderCron] Found ${due.length} due reminder(s)`);

  for (const reminder of due) {
    // Isolate failures — one bad reminder must not block the rest
    try {
      // a) Find the nest to check dmActive status
      const nest = await Nest.findById(reminder.nestId);
      if (!nest) {
        console.warn(`[ReminderCron] Nest not found for reminder ${reminder._id} — skipping`);
        continue;
      }

      // Determine which partner this reminder is for
      const isA     = nest.partnerA?.lineBackendId === reminder.recipientLineUserId;
      const partner = isA ? nest.partnerA : nest.partnerB;

      // b) Skip if partner hasn't followed the bot yet
      if (!partner?.dmActive) {
        console.warn(
          `[ReminderCron] ${reminder.recipientName ?? reminder.recipientLineUserId} ` +
          `hasn't followed the bot — skipping reminder ${reminder._id}`
        );
        continue;
      }

      // c) Send DM
      await lineService.sendDM(reminder.recipientLineUserId, reminder.message);

      // d) Mark sent on success
      reminder.sent   = true;
      reminder.sentAt = new Date();
      await reminder.save();

      console.log(
        `[ReminderCron] Sent reminder ${reminder._id} to ${reminder.recipientName ?? reminder.recipientLineUserId}`
      );

    } catch (err) {
      // e) On LINE error: log, do NOT mark sent (will retry next minute)
      console.error(
        `[ReminderCron] Failed to send reminder ${reminder._id}: ${err.message}`
      );
    }
  }
}

// ── startReminderCron() ───────────────────────────────────────────────────────
function startReminderCron() {
  const schedule = process.env.REMINDER_CRON_SCHEDULE || '* * * * *'; // every minute

  if (!cron.validate(schedule)) {
    console.error(`[ReminderCron] Invalid schedule "${schedule}" — falling back to "* * * * *"`);
  }

  cron.schedule(schedule, async () => {
    try {
      await sendDueReminders();
    } catch (err) {
      console.error('[ReminderCron] Fatal error:', err.message);
    }
  });

  console.log(`[ReminderCron] Started — schedule: "${schedule}"`);
}

module.exports = { startReminderCron };
