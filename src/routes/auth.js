'use strict';

/**
 * LINE Login OAuth routes
 * ──────────────────────
 * LINE provides TWO distinct user ID namespaces:
 *
 *   • lineUserId   – issued by the Messaging API (channel type: bot).
 *                    Used to send DMs via the bot (push messages).
 *
 *   • lineLoginId  – issued by LINE Login (channel type: login).
 *                    Used to identify who is authenticated on the web portal.
 *
 * In production these IDs come from DIFFERENT LINE channels and will differ.
 * For MVP we treat them as the same value (single LINE Login channel) and
 * store the same userId in both fields.  The code is structured so that
 * splitting them later only requires changing where lineUserId is sourced.
 *
 * MVP assumption documented here ↑
 */

const express = require('express');
const axios   = require('axios');

const Nest = require('../models/Nest');

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const LINE_AUTH_URL  = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

// ── GET /auth/line ────────────────────────────────────────────────────────────
/**
 * Kick off LINE Login OAuth.
 * Expects ?nestCode=XXXXXX in the query string so we can pass it through
 * as the OAuth `state` param and recover it in the callback.
 */
router.get('/line', (req, res) => {
  const { nestCode } = req.query;

  // 'new' is a special sentinel value used when Partner A hasn't created a nest yet.
  // Any other value must be a 6-char nest code (Partner B join flow).
  if (!nestCode || (nestCode !== 'new' && nestCode.length !== 6)) {
    return res.status(400).json({ error: 'nestCode query param is required ("new" or 6 chars)' });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri:  `${process.env.BASE_URL}/auth/line/callback`,
    state:         nestCode,
    scope:         'profile openid',
  });

  return res.redirect(`${LINE_AUTH_URL}?${params.toString()}`);
});

// ── GET /auth/line/callback ───────────────────────────────────────────────────
/**
 * LINE redirects here after the user grants permission.
 * Flow:
 *   1. Exchange `code` for an access token
 *   2. Fetch the user's LINE profile
 *   3. Locate the nest by nestCode (from `state`)
 *   4. Assign the user to partnerA or partnerB (whichever slot is still empty)
 *   5. Save a lightweight session and redirect to /portal.html
 */
router.get('/line/callback', async (req, res) => {
  const { code, state: nestCode, error: oauthError } = req.query;

  // User denied access or LINE returned an error
  if (oauthError) {
    console.warn('[Auth] LINE OAuth denied:', oauthError);
    return res.redirect('/?error=oauth_denied');
  }

  if (!code || !nestCode) {
    return res.status(400).json({ error: 'Missing code or state (nestCode)' });
  }

  try {
    // 1 ── Exchange authorisation code for access token ──────────────────────
    const tokenRes = await axios.post(
      LINE_TOKEN_URL,
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${process.env.BASE_URL}/auth/line/callback`,
        client_id:     process.env.LINE_LOGIN_CHANNEL_ID,
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token: accessToken } = tokenRes.data;

    // 2 ── Fetch LINE profile ─────────────────────────────────────────────────
    const profileRes = await axios.get(LINE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { userId: lineLoginId, displayName: name } = profileRes.data;

    // MVP: lineUserId === lineLoginId (single LINE Login channel)
    // In production, lineUserId would come from a Messaging API webhook event.
    const lineUserId = lineLoginId;

    // 3a ── Partner A pre-auth: no nest exists yet — just save session ─────────
    if (nestCode === 'new') {
      req.session.lineUserId  = lineUserId;
      req.session.lineLoginId = lineLoginId;
      req.session.name        = name;
      req.session.nestCode    = null;
      console.log(`[Auth] Partner A pre-auth complete for ${name} (${lineUserId})`);
      return res.redirect('/'); // index.html detects session and shows the nest creation form
    }

    // 3b ── Partner B join flow: find the nest by nestCode ─────────────────────
    const nest = await Nest.findOne({ nestCode: nestCode.toUpperCase() });
    if (!nest) {
      console.warn(`[Auth] Nest not found for nestCode: ${nestCode}`);
      return res.redirect('/?error=nest_not_found');
    }

    // 4 ── Assign to first available partner slot ─────────────────────────────
    if (!nest.partnerA.lineLoginId) {
      nest.partnerA.lineLoginId = lineLoginId;
      nest.partnerA.lineUserId  = lineUserId;
      nest.partnerA.name        = nest.partnerA.name || name;
      // Status stays 'pending_partner' until both partners have logged in
    } else if (!nest.partnerB.lineLoginId) {
      nest.partnerB.lineLoginId = lineLoginId;
      nest.partnerB.lineUserId  = lineUserId;
      nest.partnerB.name        = nest.partnerB.name || name;
      nest.status = 'pending_line'; // Both partners authenticated; awaiting group link
    } else {
      // Both slots taken — user may already be registered
      console.info(`[Auth] Both partner slots full for nest ${nestCode}`);
    }

    await nest.save();

    // 5 ── Persist session ────────────────────────────────────────────────────
    req.session.lineUserId  = lineUserId;
    req.session.lineLoginId = lineLoginId;
    req.session.name        = name;
    req.session.nestCode    = nestCode.toUpperCase();

    return res.redirect('/portal.html');
  } catch (err) {
    console.error('[Auth] LINE OAuth callback error:', err.response?.data ?? err.message);
    return res.redirect('/?error=auth_failed');
  }
});

// ── GET /auth/session — lightweight session check for portal pages ─────────────
/**
 * Returns the current session data (no sensitive tokens) so portal pages
 * can detect whether the user is already signed in without a full redirect.
 */
router.get('/session', (req, res) => {
  if (req.session?.lineUserId) {
    return res.json({
      lineUserId: req.session.lineUserId,
      name:       req.session.name,
      nestCode:   req.session.nestCode,
    });
  }
  return res.status(401).json({ lineUserId: null });
});

module.exports = router;
