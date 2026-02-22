'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Memory – a rolling AI-generated summary of a nest's conversation history.
 * Exactly ONE document per nest (enforced via unique index + upsert helper).
 */
const memorySchema = new Schema(
  {
    nestId: {
      type:     Schema.Types.ObjectId,
      ref:      'Nest',
      required: true,
      unique:   true,
    },
    summary: {
      type:    String,
      default: '',
    },
    messageCount: {
      type:    Number,
      default: 0,
    },
    generatedAt: {
      type:    Date,
      default: Date.now,
    },
    isProcessing: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: false }
);

/**
 * Upsert helper – always use this instead of Memory.create() so the
 * one-per-nest invariant is maintained.
 *
 * @param {import('mongoose').Types.ObjectId|string} nestId
 * @param {{ summary?: string, messageCount?: number, generatedAt?: Date }} updates
 * @returns {Promise<import('mongoose').Document>}
 */
memorySchema.statics.upsertForNest = function (nestId, updates = {}) {
  return this.findOneAndUpdate(
    { nestId },
    {
      $set: {
        ...updates,
        generatedAt: updates.generatedAt ?? new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('Memory', memorySchema);
