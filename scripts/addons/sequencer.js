/**
 * @module addons/sequencer
 * Optional Sequencer integration — shows a visual effect on the
 * token with the highest threat when an enemy is selected.
 */

import { MODULE_ID } from '../core/constants.js';
import { Logger } from '../core/logger.js';
import { getSetting } from '../core/threat-utils.js';

export function registerSequencerHooks() {
  // Only register if Sequencer is active
  if (!game.modules.get('sequencer')?.active) {
    Logger.debug('Sequencer not active — skipping addon');
    return;
  }

  Hooks.on('controlToken', async (token, controlled) => {
    if (!game.combats.active || !game.user.isGM) return;
    if (!getSetting('enableTopThreatEffect')) return;

    if (!controlled) {
      Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });
      return;
    }

    if (token.actor?.hasPlayerOwner) return;

    const threatTable = token.document.flags[MODULE_ID]?.threatTable ?? {};
    const sorted = Object.entries(threatTable).sort((a, b) => {
      const va = typeof a[1] === 'object' ? a[1].value : Number(a[1]) || 0;
      const vb = typeof b[1] === 'object' ? b[1].value : Number(b[1]) || 0;
      return vb - va;
    });

    const topEntry = sorted[0];
    if (!topEntry) return;

    const [topTokenId, threatData] = topEntry;
    const topThreatValue = typeof threatData === 'object' ? threatData.value : Number(threatData) || 0;
    if (!topTokenId || !topThreatValue) return;

    const topToken = canvas.tokens.get(topTokenId);
    if (!topToken) return;

    // Clear previous effect
    Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });

    const effectPath = getSetting('topThreatEffect');
    const effectType = getSetting('topThreatEffectType');
    const seq = new Sequence();

    if (effectType === 'ray') {
      seq.effect()
        .file(effectPath)
        .attachTo(token)
        .stretchTo(topToken)
        .persist()
        .fadeIn(200)
        .fadeOut(200)
        .name(`top-threat-${token.id}`)
        .forUsers([game.user.id])
        .belowTokens(false);
    } else {
      seq.effect()
        .file(effectPath)
        .attachTo(topToken)
        .scaleToObject(0.4)
        .fadeIn(500)
        .fadeOut(250)
        .persist()
        .anchor({ x: 0.5, y: 1.5 })
        .name(`top-threat-${token.id}`)
        .forUsers([game.user.id]);
    }

    seq.play();
    Logger.debug(`Sequencer effect played: ${effectType} from ${token.name} → ${topToken.name}`);
  });
}
