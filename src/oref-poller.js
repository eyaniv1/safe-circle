const { pool } = require('./store');
const { v4: uuidv4 } = require('uuid');

const OREF_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const POLL_INTERVAL = 3000; // 3 seconds

// Track which circles already have an auto-triggered active event
const recentlyTriggered = new Map(); // circleId -> timestamp
let consecutiveErrors = 0;

async function fetchAlert() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(OREF_URL, {
      headers: {
        'Referer': 'https://www.oref.org.il/',
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    consecutiveErrors = 0;
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch (e) {
    consecutiveErrors++;
    if (consecutiveErrors % 20 === 1) {
      console.error(`[OREF] Fetch error (${consecutiveErrors}x):`, e.message);
    }
    return null;
  }
}

async function checkAndTrigger() {
  try {
    const alert = await fetchAlert();
    if (!alert || !alert.data || alert.data.length === 0) return;

    const alertAreas = alert.data;

    const { rows: members } = await pool.query(
      "SELECT DISTINCT circle_id, area FROM members WHERE area != ''"
    );

    // Group areas by circle
    const circleAreas = {};
    members.forEach(m => {
      if (!circleAreas[m.circle_id]) circleAreas[m.circle_id] = [];
      circleAreas[m.circle_id].push(m.area);
    });

    // Check each circle for area matches
    for (const [circleId, areas] of Object.entries(circleAreas)) {
      const match = alertAreas.some(alertArea =>
        areas.some(memberArea => alertArea.includes(memberArea) || memberArea.includes(alertArea))
      );

      if (match) {
        const lastTriggered = recentlyTriggered.get(circleId);
        if (lastTriggered && Date.now() - lastTriggered < 5 * 60 * 1000) continue;

        const { rows: active } = await pool.query(
          'SELECT id FROM events WHERE circle_id = $1 AND active = true', [circleId]
        );
        if (active.length > 0) {
          recentlyTriggered.set(circleId, Date.now());
          continue;
        }

        const eventId = uuidv4();
        await pool.query(
          'INSERT INTO events (id, circle_id, triggered_areas) VALUES ($1, $2, $3)',
          [eventId, circleId, alertAreas.join(',')]
        );
        recentlyTriggered.set(circleId, Date.now());
        console.log(`[OREF] Auto-triggered check-in for circle ${circleId} — matched areas: ${alertAreas.join(', ')}`);
      }
    }
  } catch (e) {
    console.error('[OREF] Error in checkAndTrigger:', e.message);
  }
}

function start() {
  console.log('[OREF] Pikud HaOref poller started (every 3s)');
  setInterval(checkAndTrigger, POLL_INTERVAL);
  checkAndTrigger();
}

module.exports = { start };
