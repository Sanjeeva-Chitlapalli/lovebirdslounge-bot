'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Extracted event sub-document ──────────────────────────────────────────────
const eventSchema = new Schema(
  {
    type:           { type: String },                    // e.g. 'date', 'anniversary', 'task'
    description:    { type: String },
    datetime:       { type: Date },
    involvedPerson: { type: String },                   // 'A', 'B', or 'both'
  },
  { _id: false }
);

// ── Message schema ────────────────────────────────────────────────────────────
/**
 * Message – stores every group-chat message seen by the bot.
 * `extracted` is populated by the Gemini extraction pipeline after the message
 * is saved and carries structured intelligence derived from the raw text.
 */
const messageSchema = new Schema(
  {
    nestId: {
      type:     Schema.Types.ObjectId,
      ref:      'Nest',
      required: true,
      index:    true,
    },
    senderId:   { type: String, required: true },
    senderName: { type: String },
    text: {
      type:     String,
      required: true,
    },
    timestamp: {
      type:    Date,
      default: Date.now,
      index:   true,
    },
    lineMessageId: {
      type:   String,
      unique: true,
      sparse: true,  // allow null/undefined without violating unique constraint
    },

    /** Structured data extracted by Gemini – populated after AI processing */
    extracted: {
      events:      { type: [eventSchema], default: [] },
      emotion:     { type: String },           // e.g. 'happy', 'anxious', 'neutral'
      keyFacts:    { type: [String], default: [] },
      hasReminders: { type: Boolean, default: false },
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Message', messageSchema);
