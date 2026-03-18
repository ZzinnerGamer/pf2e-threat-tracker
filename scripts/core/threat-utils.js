/**
 * @module core/threat-utils
 * Pure utility functions for threat calculation.
 * No hooks registered here — only exported helpers.
 */

import { MODULE_ID } from './constants.js';
import { Logger } from './logger.js';

// ─── Setting helpers ──────────────────────────────────────────────

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

// ─── Skill action override helpers ────────────────────────────────

/**
 * Get the custom threat value/mode for a skill action slug.
 * Checks: actor flag → global overrides setting. Returns { value, mode } or null.
 */
export function getSkillActionOverride(slug, actor = null) {
  // 1. Per-actor flag (if available)
  if (actor) {
    const actorVal = actor.getFlag?.(MODULE_ID, `skillActionValue.${slug}`);
    if (actorVal != null && Number(actorVal) > 0) {
      const actorMode = actor.getFlag?.(MODULE_ID, `skillActionMode.${slug}`) ?? 'apply';
      return { value: Number(actorVal), mode: actorMode };
    }
  }

  // 2. Global overrides (single Object setting)
  const overrides = getSetting('globalSkillActionOverrides') ?? {};
  const entry = overrides[slug];
  if (entry && Number(entry.value) > 0) {
    return { value: Number(entry.value), mode: entry.mode ?? 'apply' };
  }

  return null;
}

/**
 * Set a global skill action override.
 */
export async function setSkillActionOverride(slug, value, mode = 'apply') {
  const overrides = getSetting('globalSkillActionOverrides') ?? {};
  if (value && Number(value) > 0) {
    overrides[slug] = { value: Number(value), mode };
  } else {
    delete overrides[slug];
  }
  await setSetting('globalSkillActionOverrides', overrides);
}

// ─── Item threat override helpers ─────────────────────────────────

/**
 * Get the custom threat config for an item.
 * Checks: item flags → global item overrides (for compendium items). 
 * Returns the override object or null.
 */
export async function getItemThreatOverride(item) {
  if (!item) return null;

  // 1. Direct flags on the item (works for world items)
  const flagValue = await item.getFlag?.(MODULE_ID, 'threatItemValue');
  if (flagValue != null) {
    return {
      value: Number(flagValue) || 0,
      mode: (await item.getFlag?.(MODULE_ID, 'threatItemMode')) || 'apply',
      attackValue: Number(await item.getFlag?.(MODULE_ID, 'threatAttackValue')) || 0,
      damageValue: Number(await item.getFlag?.(MODULE_ID, 'threatDamageValue')) || 0,
      healValue: Number(await item.getFlag?.(MODULE_ID, 'threatHealValue')) || 0,
      raiseValue: Number(await item.getFlag?.(MODULE_ID, 'threatRaiseValue')) || 0,
      slug: await item.getFlag?.(MODULE_ID, 'threatItemSlug'),
    };
  }

  // 2. Global overrides (for compendium items that can't have flags)
  const key = item.uuid ?? item.sourceId ?? item.system?.slug ?? item.slug;
  if (!key) return null;

  const overrides = getSetting('itemThreatOverrides') ?? {};
  return overrides[key] ?? null;
}

/**
 * Save a threat override for an item. Tries flags first, falls back to global setting.
 */
export async function setItemThreatOverride(item, config) {
  if (!item) return;

  // Try to set flags directly (works for world/actor-owned items)
  try {
    if (item.setFlag && !item.pack) {
      await item.setFlag(MODULE_ID, 'threatItemValue', config.value ?? 0);
      await item.setFlag(MODULE_ID, 'threatItemMode', config.mode ?? 'apply');
      if (config.attackValue != null) await item.setFlag(MODULE_ID, 'threatAttackValue', config.attackValue);
      if (config.damageValue != null) await item.setFlag(MODULE_ID, 'threatDamageValue', config.damageValue);
      if (config.healValue != null) await item.setFlag(MODULE_ID, 'threatHealValue', config.healValue);
      if (config.raiseValue != null) await item.setFlag(MODULE_ID, 'threatRaiseValue', config.raiseValue);
      if (config.slug != null) await item.setFlag(MODULE_ID, 'threatItemSlug', config.slug);
      return;
    }
  } catch { /* Can't set flags — use global override */ }

  // Fall back to global overrides for compendium items
  const key = item.uuid ?? item.sourceId ?? item.system?.slug ?? item.slug;
  if (!key) return;

  const overrides = getSetting('itemThreatOverrides') ?? {};
  overrides[key] = config;
  await setSetting('itemThreatOverrides', overrides);
}

// ─── Actor / Token helpers ────────────────────────────────────────

/**
 * Determine if an actor should be considered dead/defeated.
 */
export function isActorDead(actorOrToken) {
  const actor = actorOrToken?.actor ?? actorOrToken;
  if (!actor) return false;

  const hasPF2eCond = actor.itemTypes?.condition?.some(
    c => c.slug === 'unconscious' || c.slug === 'dead'
  );

  const tokenDoc = actorOrToken?.document ?? null;
  const defeatedCombatant = !!tokenDoc?.combatant?.defeated;

  return !!(hasPF2eCond || defeatedCombatant);
}

/**
 * Get the set of enemy tokens relative to a source token.
 * Enemies are tokens in combat with opposite disposition and no player owner.
 */
export function getEnemyTokens(sourceToken, excludeIds = []) {
  return canvas.tokens.placeables.filter(t =>
    t.inCombat
    && t.document.disposition !== sourceToken.document.disposition
    && !t.actor?.hasPlayerOwner
    && !excludeIds.includes(t.id)
  );
}

/**
 * Resolve targets from context, message, or current user selection.
 * Returns an array of token IDs.
 */
export function resolveTargets(context, msg, sourceToken) {
  // 1. From PF2e context targets — can be token IDs, token objects, or full token documents
  if (Array.isArray(context?.targets) && context.targets.length > 0) {
    return context.targets.map(t => {
      if (typeof t === 'string') return t;
      // Token document objects may use .id, ._id, or be nested
      return t?.id ?? t?._id ?? t?.token?.id ?? t?.token?._id ?? null;
    }).filter(Boolean);
  }
  // 2. From message target
  if (msg?.target?.token) {
    const t = msg.target.token;
    const id = typeof t === 'string' ? t : (t?.id ?? t?._id ?? null);
    if (id) return [id];
  }
  // 3. From user's current targets
  if (game.user.targets?.size > 0) {
    return [...game.user.targets].map(t => t.id).filter(Boolean);
  }
  // 4. Fallback to source token
  if (sourceToken) {
    return [sourceToken.id];
  }
  return [];
}

/**
 * Get the highest movement speed an actor has (including other speeds).
 * PF2e 7.5+ moved speed data to system.movement.speeds.
 */
function getHighestSpeed(actor) {
  // PF2e 7.5+: system.movement.speeds
  const movement = actor?.system?.movement;
  if (movement?.speeds) {
    const all = Object.values(movement.speeds).map(s => Number(s?.value ?? s ?? 0));
    return Math.max(0, ...all);
  }
  // Legacy fallback (PF2e < 7.5)
  const speeds = actor?.system?.attributes?.speed?.otherSpeeds ?? [];
  const landSpeed = actor?.system?.attributes?.speed?.value ?? 0;
  return Math.max(landSpeed, ...speeds.map(s => s.value ?? 0));
}

/**
 * Distance-based threat multiplier.
 * Closer targets generate more threat.
 */
export function getDistanceThreatMultiplier(targetToken, sourceToken) {
  const maxSpeed = getHighestSpeed(targetToken.actor);
  const adjustedSpeed = Math.max(0, maxSpeed - 5);

  // Foundry v13+: canvas.grid.measurePath
  let distance = 0;
  if (canvas.grid.measurePath) {
    const result = canvas.grid.measurePath([sourceToken.center, targetToken.center]);
    distance = result.distance ?? 0;
  } else {
    // Legacy fallback (Foundry < v13)
    distance = canvas.grid.measureDistance(sourceToken, targetToken);
  }

  if (distance <= 5) return 1.0;
  if (distance <= adjustedSpeed) return 0.9;
  if (distance <= adjustedSpeed * 2) return 0.8;
  if (distance <= adjustedSpeed * 3) return 0.7;
  return 0.5;
}

// ─── IWR (Immunity/Weakness/Resistance) ───────────────────────────

/**
 * Build a set of "tokens" representing what an action does,
 * for matching against IWR entries.
 */
function buildTokenSet({ traitsLC = [], slugLC = '', dmgLC = '', options = [] }) {
  const set = new Set();

  for (const t of traitsLC) if (t) set.add(t);
  if (slugLC) set.add(slugLC);
  if (dmgLC) set.add(dmgLC);

  for (const opt of options ?? []) {
    const o = String(opt).toLowerCase();
    if (!o) continue;
    set.add(o);
    for (const seg of o.split(':')) {
      if (seg) set.add(seg);
      for (const sub of seg.split('-')) if (sub) set.add(sub);
    }
    const mat = o.match(/item:material:([a-z0-9-]+)/);
    if (mat?.[1]) set.add(mat[1]);
  }

  const hasSpell = [...set].some(s => s === 'spell' || s.includes('item:type:spell'));
  const hasWeapon = [...set].some(s => s === 'weapon' || s.includes('item:type:weapon'));
  const isMagical = [...set].some(s => s === 'magical' || s.includes('item:magical'));
  const hasDamage = [...set].some(s => s.startsWith('damage') || s.includes(':damage'));

  if (hasSpell) set.add('spells');
  if (hasWeapon) set.add('weapons');
  if (isMagical) set.add('magical');
  if (hasSpell && hasDamage) set.add('damage-from-spells');
  if (!isMagical) set.add('non-magical');

  return set;
}

/**
 * Calculate the IWR threat modifier for a target enemy.
 * Returns a multiplier: 0 = immune, >1 = weak, <1 = resistant.
 */
export function getThreatModifierIWR(enemy, params = {}) {
  if (!enemy?.actor) return 1;
  if (!getSetting('enableIWR')) return 1;

  let traits = [], slug = '', damageType = '', options = [];
  if (Array.isArray(params)) {
    traits = params;
  } else if (typeof params === 'string') {
    slug = params;
  } else {
    ({ traits = [], slug = '', damageType = '', options = [] } = params);
  }

  const traitsArr = Array.isArray(traits) ? traits : (traits != null ? [traits] : []);
  const traitsLC = traitsArr.filter(Boolean).map(t => String(t).toLowerCase());
  const slugLC = slug ? String(slug).toLowerCase() : '';
  const dmgLC = damageType ? String(damageType).toLowerCase() : '';

  const targetTokens = buildTokenSet({ traitsLC, slugLC, dmgLC, options });

  const I = enemy.actor.system.attributes?.immunities ?? [];
  const W = enemy.actor.system.attributes?.weaknesses ?? [];
  const R = enemy.actor.system.attributes?.resistances ?? [];

  // ── Immunities ──
  for (const i of I) {
    const t = String(i?.type ?? i?.label ?? '').toLowerCase();
    if (!t || !targetTokens.has(t)) continue;

    let exc = i?.exceptions ?? i?.exception ?? [];
    if (typeof exc === 'string') exc = exc.split(',').map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];

    const excepted = excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok));
    if (excepted) {
      Logger.debug(`Immunity '${t}' ignored by exception: ${excLC.join(', ')}`);
      continue;
    }

    Logger.debug(`${enemy.name} is IMMUNE via '${t}' → x0`);
    return 0;
  }

  // ── Weaknesses & Resistances ──
  let mult = 1;

  for (const w of W) {
    const t = String(w?.type ?? '').toLowerCase();
    const v = Number(w?.value ?? 0);
    if (!t || !v || !targetTokens.has(t)) continue;

    let exc = w?.exceptions ?? w?.exception ?? [];
    if (typeof exc === 'string') exc = exc.split(',').map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];
    if (excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok))) continue;

    Logger.debug(`${enemy.name} weakness '${t}' (+${v})`);
    mult += v;
  }

  for (const r of R) {
    const t = String(r?.type ?? '').toLowerCase();
    const v = Number(r?.value ?? 0);
    if (!t || !v || !targetTokens.has(t)) continue;

    let exc = r?.exceptions ?? r?.exception ?? [];
    if (typeof exc === 'string') exc = exc.split(',').map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];
    if (excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok))) continue;

    Logger.debug(`${enemy.name} resistance '${t}' (-${v})`);
    mult -= v;
  }

  // Normalise: raw mult of 1 → no change
  mult = mult / 10 + 1;
  if (Math.abs(mult - 1.1) < 0.001) mult = 1; // base case: no IWR matched

  return Math.max(mult, 0);
}

// ─── Threat application ───────────────────────────────────────────

/**
 * Apply a threat amount from a source to an enemy token's threat table.
 * Respects pause state and locked entries.
 */
export async function applyThreat(enemy, srcId, srcName, amount) {
  if (!game.user.isGM) return;
  if (_threatPaused) {
    Logger.debug(`Threat paused — skipping ${amount} to ${srcName}`);
    return;
  }
  if (typeof enemy === 'string') enemy = canvas.tokens.get(enemy);
  if (!enemy?.document) {
    Logger.warn('applyThreat: invalid enemy token', enemy);
    return;
  }

  // Re-evaluate dead/ignored state — auto-clear stale ignoreThreat flags
  const actuallyDead = isActorDead(enemy);
  const hasIgnoreFlag = !!enemy.actor?.getFlag(MODULE_ID, 'ignoreThreat');

  if (hasIgnoreFlag && !actuallyDead) {
    // Stale flag from a previous combat/state — clear it
    Logger.info(`applyThreat: clearing stale ignoreThreat flag on ${enemy.name}`);
    await enemy.actor.unsetFlag(MODULE_ID, 'ignoreThreat');
  } else if (actuallyDead) {
    Logger.debug(`applyThreat: ${enemy.name} is dead — skipping`);
    return;
  }

  const raw = enemy.document.getFlag(MODULE_ID, 'threatTable') ?? {};
  const current = {};
  for (const [id, v] of Object.entries(raw)) {
    current[id] = typeof v === 'object'
      ? { ...v }
      : { name: canvas.tokens.get(id)?.name ?? '???', value: Number(v) || 0 };
  }

  // Skip locked entries
  if (current[srcId]?.locked) {
    Logger.debug(`Entry locked: ${srcName} on ${enemy.name} — skipping`);
    return;
  }

  // Push undo snapshot before changing
  pushUndo(enemy.document, `${srcName} ${amount >= 0 ? '+' : ''}${amount} → ${enemy.name}`);

  if (!current[srcId]) {
    current[srcId] = { name: srcName, value: 0 };
  }

  // Track previous top threat for change detection
  const prevTopId = Object.entries(current)
    .filter(([, v]) => !v.locked)
    .sort((a, b) => b[1].value - a[1].value)[0]?.[0] ?? null;

  current[srcId].value += amount;

  await enemy.document.setFlag(MODULE_ID, 'threatTable', current);
  Logger.info(`✓ applyThreat: ${srcName} ${amount >= 0 ? '+' : ''}${amount} → ${enemy.name} (new total: ${current[srcId].value})`);

  // Record to history
  recordThreatEvent(enemy, srcId, srcName, amount);

  // Detect top threat change for alert system
  const newTopId = Object.entries(current)
    .sort((a, b) => b[1].value - a[1].value)[0]?.[0] ?? null;

  if (prevTopId && newTopId && prevTopId !== newTopId && prevTopId !== srcId) {
    const newTopName = current[newTopId]?.name ?? '???';
    _lastAggroShift = {
      enemyName: enemy.name,
      enemyId: enemy.id,
      oldTargetId: prevTopId,
      oldTargetName: current[prevTopId]?.name ?? '???',
      newTargetId: newTopId,
      newTargetName: newTopName,
      timestamp: Date.now(),
    };
    Logger.info(`⚠ AGGRO SHIFT: ${enemy.name} switches from ${current[prevTopId]?.name} to ${newTopName}`);
  }
}

// ─── Aggro shift detection ────────────────────────────────────────

/** Last detected aggro shift event (consumed by panel for alert display). */
let _lastAggroShift = null;

/**
 * Get and consume the last aggro shift event.
 * Returns null if no shift occurred since last check.
 */
export function consumeAggroShift() {
  const shift = _lastAggroShift;
  _lastAggroShift = null;
  return shift;
}

// ─── Undo stack ───────────────────────────────────────────────────

/** In-memory undo stack (per session, not persisted). Max 50 entries. */
const _undoStack = [];
const UNDO_MAX = 50;

/**
 * Push a snapshot onto the undo stack before modifying a threat table.
 */
function pushUndo(enemyDoc, description = '') {
  const table = enemyDoc.getFlag(MODULE_ID, 'threatTable') ?? {};
  _undoStack.push({
    timestamp: Date.now(),
    enemyId: enemyDoc.id ?? enemyDoc._id,
    enemyName: enemyDoc.name ?? canvas.tokens.get(enemyDoc.id)?.name ?? '???',
    snapshot: JSON.parse(JSON.stringify(table)),
    description,
  });
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
}

/**
 * Undo the last threat change. Returns a description of what was undone, or null.
 */
export async function undoLastThreatChange() {
  if (_undoStack.length === 0) return null;

  const entry = _undoStack.pop();
  const token = canvas.tokens.placeables.find(
    t => t.document.id === entry.enemyId || t.id === entry.enemyId
  );
  if (!token?.document) {
    Logger.warn('Undo: could not find token', entry.enemyId);
    return null;
  }

  await token.document.setFlag(MODULE_ID, 'threatTable', entry.snapshot);
  Logger.info(`Undo: restored ${entry.enemyName} — ${entry.description}`);
  return entry;
}

/**
 * Get the undo stack (read-only) for display.
 */
export function getUndoStack() {
  return [..._undoStack];
}

// ─── Threat lock ──────────────────────────────────────────────────

/**
 * Lock a specific entry in an enemy's threat table so it won't change.
 * Locked entries have a `locked: true` flag in the table entry.
 */
export async function setThreatLock(enemyTokenId, sourceTokenId, locked) {
  const token = canvas.tokens.get(enemyTokenId);
  if (!token?.document) return;

  const table = token.document.getFlag(MODULE_ID, 'threatTable') ?? {};
  if (!table[sourceTokenId]) return;

  if (typeof table[sourceTokenId] === 'object') {
    table[sourceTokenId].locked = !!locked;
  }

  await token.document.setFlag(MODULE_ID, 'threatTable', table);
  Logger.info(`Lock ${locked ? 'set' : 'cleared'}: ${token.name} ← ${table[sourceTokenId]?.name}`);
}

/**
 * Check if a threat entry is locked.
 */
export function isThreatLocked(enemyToken, sourceTokenId) {
  const table = enemyToken?.document?.getFlag(MODULE_ID, 'threatTable') ?? {};
  return !!table[sourceTokenId]?.locked;
}

// ─── Threat pause ─────────────────────────────────────────────────

let _threatPaused = false;

/**
 * Pause/unpause all threat calculation globally.
 */
export function setThreatPaused(paused) {
  _threatPaused = !!paused;
  Logger.info(`Threat calculation ${_threatPaused ? 'PAUSED' : 'RESUMED'}`);
}

export function isThreatPaused() {
  return _threatPaused;
}

// ─── Direct threat manipulation ───────────────────────────────────

/**
 * Set a specific threat value directly (for inline editing).
 */
export async function setThreatValue(enemyTokenId, sourceTokenId, newValue) {
  const token = canvas.tokens.get(enemyTokenId);
  if (!token?.document) return;

  const table = token.document.getFlag(MODULE_ID, 'threatTable') ?? {};
  if (!table[sourceTokenId]) return;

  // Push undo before modifying
  pushUndo(token.document, `Manual edit: ${table[sourceTokenId]?.name} → ${newValue}`);

  if (typeof table[sourceTokenId] === 'object') {
    table[sourceTokenId].value = Number(newValue) || 0;
  } else {
    table[sourceTokenId] = Number(newValue) || 0;
  }

  await token.document.setFlag(MODULE_ID, 'threatTable', table);
}

/**
 * Reset a single source's threat on a single enemy to zero.
 */
export async function resetSingleThreat(enemyTokenId, sourceTokenId) {
  const token = canvas.tokens.get(enemyTokenId);
  if (!token?.document) return;

  const table = token.document.getFlag(MODULE_ID, 'threatTable') ?? {};
  if (!table[sourceTokenId]) return;

  pushUndo(token.document, `Reset: ${table[sourceTokenId]?.name} on ${token.name}`);

  delete table[sourceTokenId];
  await token.document.setFlag(MODULE_ID, 'threatTable', table);
}

/**
 * Reset all threat for a single enemy token.
 */
export async function resetAllThreat(enemyTokenId) {
  const token = canvas.tokens.get(enemyTokenId);
  if (!token?.document) return;

  pushUndo(token.document, `Reset all threat on ${token.name}`);
  await token.document.setFlag(MODULE_ID, 'threatTable', {});
}

// ─── Pre-HP storage ───────────────────────────────────────────────

/**
 * Store pre-action HP for a token so we can calculate damage/healing threat later.
 */
export async function storePreHP(token, threat = null, responsibleToken = null, slug = null) {
  if (!game.user.isGM) return;

  const hp = token.actor?.system?.attributes?.hp?.value;
  if (typeof hp !== 'number') return;

  // Clear any existing preHP first
  const existing = token.document.getFlag(MODULE_ID, 'preHP');
  if (existing) {
    await token.document.unsetFlag(MODULE_ID, 'preHP');
  }

  const data = { hp };
  if (threat !== null) data.baseThreat = threat;
  if (responsibleToken) {
    data.attackerId = responsibleToken.id;
    data.attackerName = responsibleToken.name;
  }
  if (slug) data.slug = slug;

  await token.document.setFlag(MODULE_ID, 'preHP', data);
  Logger.debug(`storePreHP for ${token.name}: HP=${hp}, attacker=${responsibleToken?.name ?? 'N/A'}`);
}

// ─── Unconscious threat reduction ─────────────────────────────────

/**
 * Reduce threat for a token that has fallen unconscious.
 */
export async function reduceThreatForUnconscious(tokenOrDoc, percent = null) {
  const token = tokenOrDoc?.document ? tokenOrDoc : canvas.tokens.get(tokenOrDoc?.id ?? tokenOrDoc);
  if (!token) return;

  const pct = Number(percent ?? getSetting('unconsciousThreatPercent') ?? 50);
  const factor = Math.max(0, Math.min(100, pct)) / 100;
  const updates = [];

  for (const enemy of canvas.tokens.placeables) {
    const table = enemy.document.getFlag(MODULE_ID, 'threatTable');
    if (!table?.[token.id]) continue;

    const raw = table[token.id];
    const entry = typeof raw === 'object'
      ? { name: raw.name ?? '???', value: Number(raw.value) || 0 }
      : { name: canvas.tokens.get(token.id)?.name ?? '???', value: Number(raw) || 0 };

    const newVal = Math.max(0, Math.round(entry.value * factor));
    if (newVal === entry.value) continue;

    updates.push(
      enemy.document.setFlag(MODULE_ID, 'threatTable', {
        ...table,
        [token.id]: { ...entry, value: newVal },
      })
    );
  }

  if (updates.length) await Promise.all(updates);
}

// ─── Threat history (NEW feature) ─────────────────────────────────

/**
 * Record a threat event for the history log.
 * Stored per-combat, per-round.
 */
function recordThreatEvent(enemyToken, srcId, srcName, amount) {
  try {
    const combat = game.combats.active;
    if (!combat) return;

    const combatId = combat.id;
    const round = combat.round ?? 0;

    const history = getSetting('threatHistory') ?? {};
    if (!history[combatId]) history[combatId] = {};
    if (!history[combatId][round]) history[combatId][round] = [];

    history[combatId][round].push({
      timestamp: Date.now(),
      enemy: enemyToken.name,
      enemyId: enemyToken.id,
      source: srcName,
      sourceId: srcId,
      amount,
    });

    // Fire and forget — don't block on saving history
    setSetting('threatHistory', history).catch(() => {});
  } catch {
    // Non-critical — silently ignore history errors
  }
}

/**
 * Get threat history for the active combat.
 */
export function getCombatThreatHistory(combatId = null) {
  const id = combatId ?? game.combats.active?.id;
  if (!id) return {};
  const history = getSetting('threatHistory') ?? {};
  return history[id] ?? {};
}

/**
 * Clear history for a specific combat.
 */
export async function clearCombatThreatHistory(combatId) {
  const history = getSetting('threatHistory') ?? {};
  delete history[combatId];
  await setSetting('threatHistory', history);
}

// ─── Config export/import (NEW feature) ───────────────────────────

/**
 * Export all threat configuration as a JSON object.
 */
export function exportConfiguration() {
  const config = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    baseSettings: {},
    skillActions: getSetting('globalSkillActionOverrides') ?? {},
    itemOverrides: getSetting('itemThreatOverrides') ?? {},
    effectData: getSetting('effectData') ?? {},
  };

  const baseKeys = [
    'baseAttackThreat', 'attackThreatMode', 'baseSpellThreat', 'threatPerSpellRank',
    'baseHealThreat', 'skillBase', 'skillCritBonus', 'decayEnabled', 'decayFactor',
    'enableIWR', 'enableThreatFromEffects', 'applyThreatTargetOnly',
    'unconsciousThreatPercent',
  ];

  for (const key of baseKeys) {
    try { config.baseSettings[key] = getSetting(key); } catch { /* skip */ }
  }

  return config;
}

/**
 * Import a threat configuration from a JSON object.
 */
export async function importConfiguration(data) {
  if (!data || data.version == null) {
    throw new Error('Invalid configuration file');
  }

  for (const [key, val] of Object.entries(data.baseSettings ?? {})) {
    try { await game.settings.set(MODULE_ID, key, val); } catch { /* skip */ }
  }

  // Skill action overrides — merge with existing
  if (data.skillActions && typeof data.skillActions === 'object') {
    const existing = getSetting('globalSkillActionOverrides') ?? {};
    await setSetting('globalSkillActionOverrides', { ...existing, ...data.skillActions });
  }

  // Item overrides — merge with existing
  if (data.itemOverrides && typeof data.itemOverrides === 'object') {
    const existing = getSetting('itemThreatOverrides') ?? {};
    await setSetting('itemThreatOverrides', { ...existing, ...data.itemOverrides });
  }

  if (data.effectData) {
    await game.settings.set(MODULE_ID, 'effectData', data.effectData);
  }
}
