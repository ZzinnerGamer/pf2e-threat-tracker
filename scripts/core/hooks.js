/**
 * @module core/hooks
 * Centralised hook registrations. Each hook is documented and focused.
 */

import { MODULE_ID } from './constants.js';
import { Logger } from './logger.js';
import {
  getSetting, isActorDead, reduceThreatForUnconscious,
  clearCombatThreatHistory,
} from './threat-utils.js';
import { processChatMessage } from './threat-engine.js';

/** @type {Function|null} Panel update callback, set by the panel module. */
let _panelUpdateFn = null;

/**
 * Register the panel update function. Called by the panel module after init.
 */
export function setPanelUpdateFn(fn) {
  _panelUpdateFn = fn;
}

function updatePanel() {
  _panelUpdateFn?.();
}

/**
 * Handle effect-based threat. Fires on createItem for effect items.
 */
async function handleThreatFromEffect({ item, action }) {
  if (!getSetting('enableThreatFromEffects')) return;

  const uuid = item?._stats?.compendiumSource;
  if (!uuid) return;

  const data = getSetting('effectData') || {};
  const cfg = data[uuid];
  if (!cfg || cfg.value === 0) return;

  const affectedToken = canvas.tokens.placeables.find(t => t.actor?.id === item.actor?.id);
  if (!affectedToken) return;

  const origin = item.system?.context?.origin;
  if (!origin?.actor) return;

  const originToken = origin?.token
    ? canvas.tokens.get(origin.token.split('.').pop())
    : affectedToken;

  let amount = cfg.value;
  if (action === 'delete' && originToken.id === affectedToken.id) {
    amount = cfg.mode === 'apply' ? -amount : amount;
  } else {
    amount = cfg.mode === 'reduce' ? -amount : amount;
  }

  const isAlly = affectedToken.document.disposition === 1;
  const isSelf = originToken.id === affectedToken.id || isAlly;
  const allEnemies = canvas.tokens.placeables.filter(
    t => t.document.disposition !== 1 && t.combatant?.combat
  );

  // Lazy import to avoid circular dependency
  const { applyThreat } = await import('./threat-utils.js');

  if (isSelf) {
    for (const enemy of allEnemies) {
      await applyThreat(enemy, affectedToken.id, affectedToken.name, amount);
    }
    if (isAlly && originToken.id !== affectedToken.id) {
      const half = Math.floor(amount / 2);
      for (const enemy of allEnemies) {
        await applyThreat(enemy, originToken.id, originToken.name, half);
      }
    }
  } else {
    await applyThreat(affectedToken, originToken.id, originToken.name, amount);
    const half = Math.floor(amount / 2);
    for (const enemy of allEnemies) {
      if (enemy.id === affectedToken.id) continue;
      await applyThreat(enemy, originToken.id, originToken.name, half);
    }
  }

  Logger.debug(`Effect threat applied: ${item.name} (${action}), amount=${amount}`);
  updatePanel();
}

/**
 * Register all hooks for the module.
 */
export function registerHooks() {

  // ── Pre-update HP tracking ──
  Hooks.on('preUpdateActor', async (actor, update) => {
    const newHP = update?.system?.attributes?.hp?.value;
    if (typeof newHP !== 'number') return;
    const currentHP = actor.system.attributes.hp.value;
    if (newHP > currentHP) {
      for (const token of actor.getActiveTokens()) {
        await token.document.setFlag(MODULE_ID, 'preHP', { hp: currentHP });
      }
    }
  });

  // ── Panel update triggers ──
  Hooks.on('canvasReady', () => { if (game.user.isGM) updatePanel(); });
  Hooks.on('createCombat', () => { if (game.user.isGM) updatePanel(); });
  Hooks.on('canvasPan', () => updatePanel());
  Hooks.on('updateToken', () => updatePanel());

  Hooks.on('updateCombat', (_c, changed) => {
    if (!game.user.isGM) return;
    if ('active' in changed || 'round' in changed || 'turn' in changed) updatePanel();
  });

  // ── Combat deletion: clean up all flags ──
  Hooks.on('deleteCombat', async (combat) => {
    if (!game.user.isGM) return;
    for (const token of canvas.tokens.placeables) {
      await token.document.unsetFlag(MODULE_ID, 'threatTable');
      await token.document.unsetFlag(MODULE_ID, 'attackThreat');
      await token.document.unsetFlag(MODULE_ID, 'preHP');
      await token.document.unsetFlag(MODULE_ID, 'lastHealAction');
    }
    // Clean up threat history for this combat
    await clearCombatThreatHistory(combat.id);
    updatePanel();
  });

  // ── Token selection: focus threat card ──
  Hooks.on('controlToken', (token, controlled) => {
    if (!game.user.isGM) return;
    const body = document.querySelector('#threat-tracker-panel .tt-body');
    if (!body) return;

    if (controlled) {
      focusThreatCard(token.id);
    } else {
      const still = canvas.tokens.controlled;
      if (still.length > 0) {
        focusThreatCard(still[still.length - 1].id); // Fixed: was length - 0
      } else {
        clearThreatFocus();
      }
    }
  });

  // ── Unconscious ally: reduce threat ──
  Hooks.on('createItem', async (item) => {
    if (!game.user.isGM) return;

    // Handle unconscious condition
    if (item?.type === 'condition') {
      const slug = item.slug ?? item.system?.slug;
      if (slug === 'unconscious') {
        const tok = canvas.tokens.placeables.find(t => t.actor?.id === item.actor?.id);
        if (tok?.document?.disposition === 1) {
          try { await reduceThreatForUnconscious(tok); } catch (err) {
            Logger.warn('Error applying unconscious reduction:', err);
          }
        }
      }

      // Update ignore flag for dead actors
      const actor = item.actor;
      if (actor) {
        await actor.setFlag(MODULE_ID, 'ignoreThreat', isActorDead(actor));
        updatePanel();
      }
    }

    // Handle effect-based threat
    if (getSetting('enableThreatFromEffects')) {
      setTimeout(() => handleThreatFromEffect({ item, action: 'create' }), 50);
    }
  });

  // ── Condition removed ──
  Hooks.on('deleteItem', async (item) => {
    if (!game.user.isGM || item.type !== 'condition') return;
    const actor = item.actor;
    if (actor) {
      const stillDead = isActorDead(actor);
      if (stillDead) {
        await actor.setFlag(MODULE_ID, 'ignoreThreat', true);
      } else {
        await actor.unsetFlag(MODULE_ID, 'ignoreThreat');
      }
      updatePanel();
    }
  });

  // ── Combatant defeated toggle ──
  Hooks.on('updateCombatant', async (combatant, changes) => {
    if (!game.user.isGM || !('defeated' in changes)) return;

    const scene = game.scenes.get(combatant.sceneId);
    const tokenDoc = scene?.tokens?.get(combatant.tokenId)
      ?? canvas.tokens.get(combatant.tokenId)?.document;
    const actor = tokenDoc?.actor;
    if (!actor) return;

    if (changes.defeated) {
      await actor.setFlag(MODULE_ID, 'ignoreThreat', true);
      Logger.info(`${actor.name} marked as defeated`);
    } else {
      await actor.unsetFlag(MODULE_ID, 'ignoreThreat');
      Logger.info(`${actor.name} unmarked as defeated`);
    }
    updatePanel();
  });

  // ── Turn change: clean per-turn flags ──
  Hooks.on('combatTurn', async () => {
    if (!game.user.isGM) return;
    for (const token of canvas.tokens.placeables.filter(t => t.inCombat)) {
      await token.document.unsetFlag(MODULE_ID, 'preHP');
      await token.document.unsetFlag(MODULE_ID, 'attackThreat');
    }
    updatePanel();
  });

  // ── Round change: apply threat decay ──
  Hooks.on('combatRound', async () => {
    if (!getSetting('decayEnabled')) return;

    const decayFactor = getSetting('decayFactor');

    for (const tok of canvas.tokens.placeables) {
      const table = tok.document.getFlag(MODULE_ID, 'threatTable');
      if (!table) continue;

      const values = Object.values(table).map(e =>
        typeof e === 'object' ? e.value : Number(e) || 0
      );
      if (values.length === 0) continue;

      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      for (const id of Object.keys(table)) {
        const entry = table[id];
        const oldValue = typeof entry === 'object' ? entry.value : Number(entry) || 0;
        const newValue = Math.floor(avg + (oldValue - avg) * decayFactor);
        if (typeof entry === 'object') {
          table[id].value = newValue;
        } else {
          table[id] = newValue;
        }
        Logger.info(`Decay ${tok.name} → ${table[id]?.name ?? id}: ${oldValue} → ${newValue}`);
      }

      await tok.document.setFlag(MODULE_ID, 'threatTable', table);
    }
    updatePanel();
  });

  // ── Main threat calculation hook ──
  Hooks.on('createChatMessage', async (msg) => {
    Logger.info(`📨 createChatMessage fired | type: ${msg.flags?.pf2e?.context?.type ?? 'N/A'} | actor: ${msg.actor?.name ?? 'none'} | flags.pf2e: ${!!msg.flags?.pf2e}`);
    await processChatMessage(msg);
    updatePanel();
  });

  Logger.info('All hooks registered ✓');
}

// ─── Panel focus helpers (exported for panel use) ─────────────────

export function focusThreatCard(tokenId) {
  const body = document.querySelector('#threat-tracker-panel .tt-body');
  if (!body) return;

  const cards = Array.from(body.querySelectorAll('.tt-card'));
  const target = cards.find(c => c.dataset.tokenId === tokenId);
  if (!target) { clearThreatFocus(); return; }

  for (const c of cards) {
    if (c === target) {
      c.classList.remove('is-dim');
      c.classList.add('is-focus');
    } else {
      c.classList.add('is-dim');
      c.classList.remove('is-focus');
    }
  }

  if (target !== body.firstElementChild) {
    body.insertBefore(target, body.firstElementChild);
  }
}

export function clearThreatFocus() {
  const body = document.querySelector('#threat-tracker-panel .tt-body');
  if (!body) return;

  const cards = Array.from(body.querySelectorAll('.tt-card'));
  for (const c of cards) c.classList.remove('is-dim', 'is-focus');

  const ordered = cards.sort(
    (a, b) => (Number(a.dataset.index) || 0) - (Number(b.dataset.index) || 0)
  );
  for (const c of ordered) body.appendChild(c);
}
