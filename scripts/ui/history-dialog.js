/**
 * @module ui/history-dialog
 * Displays a visual threat history log per round for the active combat.
 */

import { MODULE_ID } from '../core/constants.js';
import { getCombatThreatHistory } from '../core/threat-utils.js';

const loc = (k) => game.i18n?.localize(k) ?? k;

export function openHistoryDialog() {
  const combat = game.combats.active;
  if (!combat) {
    ui.notifications.warn('No active combat');
    return;
  }

  const history = getCombatThreatHistory(combat.id);
  const rounds = Object.keys(history).sort((a, b) => Number(b) - Number(a));

  let content = `<div style="max-height:500px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding:8px;">`;

  if (rounds.length === 0) {
    content += `<p style="text-align:center; opacity:0.7;">No threat events recorded yet.</p>`;
  }

  for (const round of rounds) {
    const events = history[round];
    content += `<div style="border:1px solid #555; border-radius:8px; padding:8px;">`;
    content += `<h3 style="margin:0 0 6px 0; font-size:14px; border-bottom:1px solid #666; padding-bottom:4px;">Round ${round}</h3>`;

    // Aggregate events by source→enemy
    const aggregated = {};
    for (const evt of events) {
      const key = `${evt.sourceId}→${evt.enemyId}`;
      if (!aggregated[key]) {
        aggregated[key] = { source: evt.source, enemy: evt.enemy, total: 0, count: 0 };
      }
      aggregated[key].total += evt.amount;
      aggregated[key].count++;
    }

    const entries = Object.values(aggregated).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    for (const entry of entries) {
      const colour = entry.total >= 0 ? '#ff7878' : '#78c8ff';
      const sign = entry.total >= 0 ? '+' : '';
      content += `
        <div style="display:grid; grid-template-columns: 1fr auto 1fr auto; gap:6px; align-items:center; padding:2px 4px; font-size:12px;">
          <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${entry.source}</span>
          <span style="opacity:0.5;">→</span>
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${entry.enemy}</span>
          <span style="color:${colour}; font-weight:700; text-align:right;">${sign}${entry.total}</span>
        </div>`;
    }

    content += `<div style="text-align:right; font-size:10px; opacity:0.5; margin-top:4px;">${events.length} event(s)</div>`;
    content += `</div>`;
  }

  content += `</div>`;

  new foundry.applications.api.DialogV2({
    window: { title: `Threat History — Round ${combat.round ?? 0}` },
    content,
    buttons: [{ action: 'close', label: loc('pf2e-threat-tracker.threatConfig.close'), default: true }],
  }).render({ force: true });
}
