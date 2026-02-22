'use strict';

const express  = require('express');
const router   = express.Router();
const { nanoid } = require('nanoid');

const Nest = require('../models/Nest');

// ── Middleware helpers ────────────────────────────────────────────────────────

/** Require an active LINE OAuth session; return 401 otherwise. */
function requireSession(req, res, next) {
  if (req.session?.lineUserId) return next();
  return res.status(401).json({ error: 'Authentication required. Please log in via LINE.' });
}

/** Generate a 6-char uppercase alphanumeric code, e.g. "LVB4A2" */
function generateNestCode() {
  // nanoid(10) gives enough entropy; trim & upper to 6 chars
  return nanoid(10).replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
}

// ── POST /api/register — Partner A creates a new nest ─────────────────────────
/**
 * Partner A must be authenticated via LINE OAuth before calling this.
 * req.session.lineUserId is their LINE Login user ID.
 *
 * Body: { nestName, partnerAName, timezone }
 * Returns: { nestCode, inviteUrl }
 */
router.post('/register', requireSession, async (req, res) => {
  const { nestName, partnerAName, timezone } = req.body;

  const missing = [];
  if (!nestName)    missing.push('nestName');
  if (!timezone)    missing.push('timezone');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    // Generate a collision-resistant nestCode (retry once on duplicate key)
    let nest;
    for (let attempt = 0; attempt < 3; attempt++) {
      const nestCode = generateNestCode();
      try {
        nest = await Nest.create({
          nestCode,
          nestName,
          partnerA: {
            lineLoginId: req.session.lineUserId,
            lineUserId:  req.session.lineUserId, // MVP: same ID (see auth.js)
            name:        partnerAName || req.session.name || null,
            dmActive:    false,
          },
          timezone,
          status: 'pending_partner',
        });
        break; // success
      } catch (err) {
        if (err.code === 11000 && attempt < 2) continue; // duplicate nestCode — retry
        throw err;
      }
    }

    const inviteUrl = `${process.env.BASE_URL}/join/${nest.nestCode}`;

    console.log(`[Portal] Nest created — ${nest.nestCode} by ${nest.partnerA.name ?? req.session.lineUserId}`);

    return res.status(201).json({
      success:   true,
      nestCode:  nest.nestCode,
      inviteUrl,
    });
  } catch (err) {
    console.error('[Portal] register error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/nest/:nestCode — nest status (no sensitive IDs) ──────────────────
router.get('/nest/:nestCode', async (req, res) => {
  try {
    const nest = await Nest.findOne({
      nestCode: req.params.nestCode.toUpperCase(),
    })
      .select('nestCode nestName status timezone partnerA.name partnerB.name createdAt')
      .lean();

    if (!nest) return res.status(404).json({ error: 'Nest not found' });

    return res.json({ success: true, nest });
  } catch (err) {
    console.error('[Portal] nest status error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/join — Partner B joins an existing nest ─────────────────────────
/**
 * Partner B must be authenticated via LINE OAuth before calling this.
 *
 * Body: { nestCode, partnerBName }
 * Returns: { success, nestName, instructions }
 */
router.post('/join', requireSession, async (req, res) => {
  const { nestCode, partnerBName } = req.body;

  if (!nestCode)    return res.status(400).json({ error: 'nestCode is required' });

  try {
    const nest = await Nest.findOne({
      nestCode:  nestCode.toUpperCase(),
      status:    'pending_partner',
    });

    if (!nest) {
      return res.status(404).json({
        error: 'Nest not found or already has two partners. Double-check the code.',
      });
    }

    nest.partnerB.lineLoginId = req.session.lineUserId;
    nest.partnerB.lineUserId  = req.session.lineUserId; // MVP: same ID
    nest.partnerB.name        = partnerBName || req.session.name || null;
    nest.status               = 'pending_line';
    await nest.save();

    console.log(`[Portal] Partner B joined nest ${nest.nestCode}`);

    return res.json({
      success:  true,
      nestName: nest.nestName,
      instructions:
        `You're in! 🌙 Here's what to do next:\n` +
        `1. Create a LINE group with ${nest.partnerA.name ?? 'your partner'}\n` +
        `2. Add @LumiBot to the group\n` +
        `3. One of you type /link ${nest.nestCode} in the group\n` +
        `Lumi will confirm once the nest is active 💛`,
    });
  } catch (err) {
    console.error('[Portal] join error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
