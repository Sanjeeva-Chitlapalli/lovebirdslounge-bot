'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Reminder – a scheduled LINE push message to one partner.
 * The cron job queries { sent: false, scheduledAt: { $lte: now } } to find
 * due reminders, so the compound index on (sent, scheduledAt) is critical.
 */
const reminderSchema = new Schema(
  {
    nestId: {
      type:     Schema.Types.ObjectId,
      ref:      'Nest',
      required: true,
    },
    recipientLineUserId: {
      type:     String,
      required: true,
    },
    recipientName: { type: String },
    partnerName:   { type: String },
    message: {
      type:     String,
      required: true,
    },
    scheduledAt: {
      type:     Date,
      required: true,
    },
    sent: {
      type:    Boolean,
      default: false,
    },
    sentAt: {
      type:    Date,
      default: null,
    },
    /** Reference back to the Message that spawned this reminder (optional) */
    sourceMessageId: {
      type:    Schema.Types.ObjectId,
      ref:     'Message',
      default: null,
    },
    createdAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Cron job: find unsent reminders that are due
reminderSchema.index({ sent: 1, scheduledAt: 1 });

// De-dupe / portal queries: by nest × time × recipient
reminderSchema.index({ nestId: 1, scheduledAt: 1, recipientLineUserId: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
