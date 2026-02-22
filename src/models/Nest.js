'use strict';

const mongoose = require('mongoose');

// ── Partner sub-document ──────────────────────────────────────────────────────
const partnerSchema = new mongoose.Schema(
  {
    lineUserId:  { type: String, default: null }, // LINE Messaging API UID (for DMs)
    lineLoginId: { type: String, default: null }, // LINE Login OAuth UID (for portal auth)
    name:        { type: String, default: null },
    dmActive:    { type: Boolean, default: false }, // true once they follow the bot
    likesAndDislikes: { type: [String], default: [] }, // Learned preferences
  },
  { _id: false }
);

// ── Nest schema ───────────────────────────────────────────────────────────────
/**
 * Nest – represents a couple's shared space.
 * nestCode is the primary business key (6-char uppercase, e.g. "LVB4A2").
 * One Nest document per couple; groupChatId is set later via /link command.
 */
const nestSchema = new mongoose.Schema(
  {
    nestCode: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
      uppercase: true,
      trim:     true,
      minlength: 6,
      maxlength: 6,
    },
    nestName: {
      type: String,
      trim: true,
    },
    partnerA: { type: partnerSchema, default: () => ({}) },
    partnerB: { type: partnerSchema, default: () => ({}) },
    groupChatId: {
      type: String,
      default: null,
    },
    timezone: {
      type:    String,
      default: 'Asia/Bangkok',
    },
    status: {
      type:    String,
      enum:    ['pending_partner', 'pending_line', 'active'],
      default: 'pending_partner',
      index:   true,
    },
    createdAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Nest', nestSchema);
