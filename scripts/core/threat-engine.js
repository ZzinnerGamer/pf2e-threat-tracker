/**
 * @module core/threat-engine
 * Processes chat messages and calculates threat.
 * Single createChatMessage handler that dispatches to focused sub-handlers.
 */

import { MODULE_ID, ATTACK_SKILLS } from './constants.js';
import { Logger } from './logger.js';
import {
  getSetting, resolveTargets, getEnemyTokens, getDistanceThreatMultiplier,
  getThreatModifierIWR, applyThreat, storePreHP, isThreatPaused,
  getSkillActionOverride, getItemThreatOverride,
} from './threat-utils.js';
import { calculateAutoSkillThreat } from './auto-defaults.js';

const loc = (k) => game.i18n?.localize(k) ?? k;

// ─── Shared helpers ───────────────────────────────────────────────

/**
 * Resolve the responsible token (the actor doing the action).
 */
async function resolveResponsibleToken(msg, context) {
  const actor = msg.actor;
  const originUUID = msg.flags?.pf2e?.origin?.uuid;

  let origin = null;
  if (originUUID) {
    try { origin = await fromUuid(originUUID); } catch { /* ignore */ }
  }

  let token = null;
  if (origin?.isEmbedded && origin.documentName === 'Token') token = origin.object;
  if (!token && origin?.actor) {
    token = canvas.tokens.placeables.find(t => t.actor?.id === origin.actor.id);
  }
  if (!token && actor) {
    token = canvas.tokens.get(actor.token?.id)
      ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
  }

  Logger.debug(`resolveResponsibleToken: actor=${actor?.name}, token=${token?.name ?? 'NULL'}, origin=${origin?.name ?? origin?.type ?? 'NULL'}`);
  return { token, origin };
}

/**
 * Extract the action slug from context/options.
 */
function extractActionSlug(context, item) {
  const fromOpts = context?.options?.find(o => typeof o === 'string' && o.startsWith('item:slug:'));
  return fromOpts?.split('item:slug:')[1]
    ?? context?.options?.find(o => o?.startsWith?.('action:'))?.split(':')[1]
    ?? item?.system?.slug
    ?? item?.slug
    ?? '';
}

/**
 * Extract traits from context, message, or origin item.
 */
function extractTraits(context, msg, origin) {
  if (Array.isArray(context?.traits)) return context.traits.map(t => t.toLowerCase());
  if (Array.isArray(msg?.flags?.pf2e?.traits)) return msg.flags.pf2e.traits.map(t => t.toLowerCase());
  return origin?.system?.traits?.value?.map(t => t.toLowerCase()) ?? [];
}

/**
 * Extract damage type from an item.
 */
function extractDamageType(item, options = []) {
  const d = item?.system?.damage;
  if (d) {
    const first = typeof d === 'object' ? Object.values(d).find(Boolean) : null;
    const dt = first?.damageType ?? d?.damageType ?? '';
    if (dt) return dt;
  }
  // Fallback: from options
  const opt = options?.find(o => o?.startsWith?.('item:damage:type:'));
  return opt?.split(':')[3] ?? '';
}

/**
 * Check if a context has the attack trait.
 */
function hasAttackTrait(context) {
  const traits = Array.isArray(context?.traits) ? context.traits : [];
  const options = Array.isArray(context?.options) ? context.options : [];
  return (
    traits.includes('attack')
    || options.includes('trait:attack')
    || options.includes('attack')
    || options.some(o => typeof o === 'string' && /(^|:)trait:attack$/.test(o))
  );
}

/**
 * Resolve which enemies to apply threat to, respecting the "target only" setting.
 */
function resolveEnemies(sourceToken, targetIds, primaryTarget) {
  const applyOnlyToPrimary = !!getSetting('applyThreatTargetOnly');

  if (applyOnlyToPrimary && primaryTarget) {
    const isEnemy = primaryTarget.inCombat
      && primaryTarget.document.disposition !== sourceToken.document.disposition
      && !primaryTarget.actor?.hasPlayerOwner;
    return isEnemy ? [primaryTarget] : [];
  }

  return getEnemyTokens(sourceToken);
}

/**
 * Apply threat to a set of enemies with IWR checking and logging.
 */
async function applyThreatToEnemies(enemies, sourceToken, threatAmount, iwrParams, label) {
  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE_ID, 'ignoreThreat')) {
      Logger.info(`${enemy.name} is dead/ignored — skipping`);
      continue;
    }

    const IWRMult = getThreatModifierIWR(enemy, iwrParams);
    if (IWRMult <= 0) {
      Logger.info(`${enemy.name} is immune to [${(iwrParams.traits ?? []).join(', ')}]`);
      continue;
    }

    const finalThreat = Math.round(threatAmount * IWRMult);

    Logger.info(
      `${label} → ${enemy.name}: base=${threatAmount}, IWR=${IWRMult}, final=${finalThreat}`
    );

    await applyThreat(enemy, sourceToken.id, sourceToken.name, finalThreat);
  }
}

// ─── Type-specific handlers ───────────────────────────────────────

/**
 * Handle attack rolls.
 */
async function handleAttack(msg, context, sourceToken, origin, item) {
  const outcome = context.outcome ?? 'failure';
  const actionSlug = extractActionSlug(context, origin);

  Logger.info(`handleAttack: source=${sourceToken.name} (disposition=${sourceToken.document.disposition}), outcome=${outcome}, slug=${actionSlug}`);

  let base = Number(getSetting('baseAttackThreat')) || 0;

  // Custom per-item attack value
  if (origin instanceof Item && ['weapon', 'shield', 'spell'].includes(origin.type)) {
    const custom = Number(await origin.getFlag(MODULE_ID, 'threatAttackValue')) || 0;
    if (custom > 0) base = custom;
  }

  let threatGlobal = base;
  switch (outcome) {
    case 'success': threatGlobal += 10; break;
    case 'criticalSuccess': threatGlobal += 20; break;
  }

  const targetIds = resolveTargets(context, msg, sourceToken);
  const primaryTarget = targetIds[0] ? canvas.tokens.get(targetIds[0]) : null;

  Logger.info(`handleAttack: targets=${JSON.stringify(targetIds)}, primaryTarget=${primaryTarget?.name ?? 'NONE'}, threatGlobal=${threatGlobal}`);

  // Store preHP for targets
  const applyOnlyToPrimary = !!getSetting('applyThreatTargetOnly');
  if (applyOnlyToPrimary && primaryTarget) {
    await storePreHP(primaryTarget, null, sourceToken, actionSlug);
  } else {
    for (const id of targetIds) {
      const t = canvas.tokens.get(id);
      if (t) await storePreHP(t, null, sourceToken, actionSlug);
    }
  }

  const enemies = resolveEnemies(sourceToken, targetIds, primaryTarget);
  Logger.info(`handleAttack: enemies resolved = [${enemies.map(e => `${e.name}(disp=${e.document.disposition}, inCombat=${e.inCombat}, playerOwned=${e.actor?.hasPlayerOwner})`).join(', ')}]`);

  const damageType = extractDamageType(item);
  const traits = extractTraits(context, msg, origin);
  const options = context?.options ?? [];

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE_ID, 'ignoreThreat')) continue;

    const distMult = getDistanceThreatMultiplier(enemy, sourceToken);
    const itemMode = (await origin?.getFlag?.(MODULE_ID, 'threatItemMode')) || 'apply';

    let amount = Math.round(threatGlobal * distMult);
    if (itemMode === 'reduce' || getSetting('attackThreatMode') === true) {
      amount = -amount;
    }

    const IWRMult = getThreatModifierIWR(enemy, { traits, slug: actionSlug, damageType, options });
    if (IWRMult <= 0) continue;

    const finalThreat = Math.round(amount * IWRMult);
    Logger.info(`Attack → ${enemy.name}: base=${base}, outcome=${outcome}, dist=${distMult}, IWR=${IWRMult}, final=${finalThreat}`);

    await applyThreat(enemy, sourceToken.id, sourceToken.name, finalThreat);
  }
}

/**
 * Handle spell casts (non-attack spells).
 */
async function handleSpellCast(msg, context, sourceToken, origin, item) {
  if (hasAttackTrait(context)) return; // Attack spells handled by attack handler

  // Store preHP for all tokens in combat
  for (const token of canvas.tokens.placeables) {
    if (!token.inCombat) continue;
    const hp = token.actor?.system?.attributes?.hp?.value;
    if (typeof hp === 'number') await storePreHP(token, null, sourceToken);
  }

  // Skip healing spells
  const spellTraits = context?.options ?? item?.system?.options?.value ?? [];
  if (spellTraits.some(t => String(t).toLowerCase() === 'healing')) {
    Logger.info('Healing spell detected — skipping spell threat');
    return;
  }

  // Get spell rank
  const rankRaw = context?.options?.find(opt => opt?.startsWith?.('item:rank:'))?.split(':')[2];
  const spellRank = Number(rankRaw);
  if (Number.isNaN(spellRank)) {
    Logger.warn('Spell has no rank — cannot calculate threat');
    return;
  }

  const base = Number(getSetting('baseSpellThreat')) || 0;
  const threatPerRank = Number(getSetting('threatPerSpellRank')) || 3;
  const bonus = Number(await item?.getFlag?.(MODULE_ID, 'threatAttackValue')) || 0;
  const rankAdjustment = threatPerRank * 0.1;
  const threatGlobal = (base + bonus) * rankAdjustment;

  const traits = spellTraits.map(t => String(t).toLowerCase());
  const slug = item?.system?.slug ?? item?.slug ?? '';
  const damageType = extractDamageType(item);
  const options = context?.options ?? [];

  await applyThreatToEnemies(
    getEnemyTokens(sourceToken), sourceToken, threatGlobal,
    { traits, slug, damageType, options },
    `Spell (rank ${spellRank})`
  );
}

/**
 * Handle skill attack checks (grapple, trip, etc.).
 */
async function handleSkillAttack(msg, context, sourceToken, origin, item) {
  const actor = msg.actor;
  const slug =
    context.options?.find(opt => opt?.startsWith?.('action:'))?.split(':')[1]
    ?? context.options?.find(opt => opt?.startsWith?.('origin:action:'))?.split(':')[2]
    ?? '';

  if (!slug || !ATTACK_SKILLS.has(slug)) {
    Logger.warn(`Skill attack slug '${slug}' not recognised`);
    return;
  }

  const outcome = context.outcome ?? 'failure';
  const level = actor?.system?.details?.level?.value ?? 0;
  const base = Number(getSetting('baseAttackThreat')) || 0;

  // Check for custom per-actor or global values
  let threatGlobal;
  const override = getSkillActionOverride(slug, actor);

  if (override) {
    threatGlobal = override.mode === 'reduce' ? -override.value : override.value;
  } else {
    const levelAdj = 1 + level * 0.1;
    switch (outcome) {
      case 'criticalFailure': threatGlobal = 0; break;
      case 'failure': threatGlobal = Math.ceil(base * levelAdj); break;
      case 'success': threatGlobal = Math.ceil((base + 10) * levelAdj); break;
      case 'criticalSuccess': threatGlobal = Math.ceil((base + 20) * levelAdj); break;
      default: threatGlobal = base; break;
    }
  }

  const targetIds = resolveTargets(context, msg, sourceToken);
  if (!targetIds.length) { Logger.warn('No targets for skill attack'); return; }

  const primaryTarget = targetIds[0] ? canvas.tokens.get(targetIds[0]) : null;
  const enemies = resolveEnemies(sourceToken, targetIds, primaryTarget);
  const traits = context.traits ?? item?.system?.traits?.value ?? [];
  const options = context?.options ?? [];

  await applyThreatToEnemies(
    enemies, sourceToken, threatGlobal,
    { traits, slug, options },
    `Skill attack (${slug}, ${outcome})`
  );
}

/**
 * Handle non-attack skill checks (demoralize, hide, etc.).
 */
async function handleSkillAction(msg, context, sourceToken, origin, item) {
  const actor = msg.actor;
  const actionSlug = extractActionSlug(context, item);

  const slug =
    context.options?.find(opt => opt?.startsWith?.('action:'))?.split(':')[1]
    ?? context.options?.find(opt => opt?.startsWith?.('origin:action:'))?.split(':')[2]
    ?? '';

  if (!slug) { Logger.warn('Cannot determine skill action slug'); return; }
  if (slug === 'treat-wounds') return; // Handled via healing

  const actorLevel = Number(
    context.options?.find(opt => opt?.startsWith?.('self:level:'))?.split(':')[2]
  ) || 1;
  const outcome = context.outcome ?? 'failure';
  const traits = context.traits ?? [];

  // Check custom values — actor override → global override → auto-defaults → formula
  const override = getSkillActionOverride(slug, actor);

  let threatGlobal = 0;

  if (override) {
    threatGlobal = override.mode === 'reduce' ? -Math.abs(override.value) : override.value;
  } else {
    // Use auto-defaults heuristic which has per-slug base values
    threatGlobal = calculateAutoSkillThreat(slug, { outcome, actorLevel });
    if (threatGlobal === 0 && outcome === 'failure') return;
  }

  const targetIds = resolveTargets(context, msg, sourceToken);
  if (!targetIds.length) { Logger.warn('No targets for skill action'); return; }

  const primaryTarget = targetIds[0] ? canvas.tokens.get(targetIds[0]) : null;
  const enemies = resolveEnemies(sourceToken, targetIds, primaryTarget);
  const options = context?.options ?? [];

  await applyThreatToEnemies(
    enemies, sourceToken, threatGlobal,
    { traits, slug, options },
    `Skill (${slug}, ${outcome})`
  );
}

/**
 * Handle healing received.
 */
async function handleHeal(msg, context, sourceToken, origin) {
  const originItem = origin instanceof Item ? origin : null;

  // Determine base heal threat
  let baseHeal = 0;
  const lastHealAction = await sourceToken?.document?.getFlag(MODULE_ID, 'lastHealAction');
  const isTreatWounds = lastHealAction === 'treat-wounds'
    || (context.type?.toLowerCase() === 'skill-check'
      && context.options?.some(opt => opt?.toLowerCase?.().includes('action:treat-wounds')));

  if (isTreatWounds) {
    baseHeal = Number(await sourceToken.actor?.getFlag(MODULE_ID, 'skillActionValue.treat-wounds'))
      || Number(getSetting('baseHealThreat')) || 0;
    await sourceToken?.document?.unsetFlag(MODULE_ID, 'lastHealAction');
  } else if (originItem?.getFlag) {
    baseHeal = Number(await originItem.getFlag(MODULE_ID, 'threatHealValue'))
      || Number(getSetting('baseHealThreat')) || 0;
  } else {
    baseHeal = Number(getSetting('baseHealThreat')) || 0;
  }

  // Find the healed token
  const targetIds = resolveTargets(context, msg, sourceToken);
  let healedToken = null;
  for (const tgtId of targetIds) {
    const t = canvas.tokens.get(tgtId);
    if (t && t.document.disposition === sourceToken.document.disposition) {
      healedToken = t;
      break;
    }
  }

  if (!healedToken) { Logger.warn('No valid healing target found'); return; }

  const preData = healedToken.document.getFlag(MODULE_ID, 'preHP');
  const preHP = preData?.hp;
  const { hp } = healedToken.actor.system.attributes;
  const healAmt = Math.max(0, hp.value - (preHP ?? hp.value));
  const threatLocal = Math.ceil(baseHeal + healAmt);

  if (threatLocal <= 0) return;

  const enemies = canvas.tokens.placeables.filter(t =>
    t.inCombat
    && t.document.disposition !== sourceToken.document.disposition
    && t.document.disposition !== 0
    && sourceToken.document.disposition !== 0
    && !t.actor?.hasPlayerOwner
  );

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE_ID, 'ignoreThreat') || isActorDeadCheck(enemy)) continue;
    Logger.info(`Heal → ${enemy.name}: base=${baseHeal}, healed=${healAmt}, total=${threatLocal}`);
    await applyThreat(enemy, sourceToken.id, sourceToken.name, threatLocal);
  }
}

function isActorDeadCheck(tokenOrActor) {
  const actor = tokenOrActor?.actor ?? tokenOrActor;
  return actor?.getFlag?.(MODULE_ID, 'ignoreThreat') || false;
}

/**
 * Handle damage taken.
 */
async function handleDamageTaken(msg, context, sourceToken) {
  const targetIdsFromEvent = [];
  const getId = (ref) => (typeof ref === 'string' ? ref.split('.').pop() : null);
  if (context?.target?.token) targetIdsFromEvent.push(getId(context.target.token));
  if (msg?.target?.token) targetIdsFromEvent.push(getId(msg.target.token));

  const candidates = targetIdsFromEvent.filter(Boolean).length
    ? targetIdsFromEvent.filter(Boolean).map(id => canvas.tokens.get(id)).filter(Boolean)
    : canvas.tokens.placeables;

  const damagedTokens = candidates.filter(t => {
    if (!t?.inCombat || t.actor?.hasPlayerOwner) return false;
    if (t.document.disposition === sourceToken.document.disposition) return false;

    const pre = t.document.getFlag(MODULE_ID, 'preHP');
    if (!pre || typeof pre.hp !== 'number') return false;

    const atkTok = pre.attackerId ? canvas.tokens.get(pre.attackerId) : null;
    if (!atkTok) return false;
    if (t.document.disposition === atkTok.document.disposition) return false;

    return true;
  });

  for (const token of damagedTokens) {
    const preData = token.document.getFlag(MODULE_ID, 'preHP');
    const { hp: preHP, attackerId } = preData ?? {};
    if (!attackerId) continue;

    const atkToken = canvas.tokens.get(attackerId);
    if (!atkToken) continue;

    const currHP = token.actor?.system?.attributes?.hp?.value ?? 0;
    let damage = Math.max(0, preHP - currHP);
    let threat = damage;

    // Bonus for massive damage (>50% of pre-HP)
    if (damage > preHP * 0.5) {
      threat += Math.floor(damage - preHP * 0.5);
    }

    // Custom item bonus
    const actionSlug = context?.options?.find(opt => opt?.startsWith?.('item:slug:'))?.split(':')[2];
    if (actionSlug) {
      const item = sourceToken.actor?.items?.find(i => i.slug === actionSlug);
      if (item?.getFlag) {
        const itemMode = (await item.getFlag(MODULE_ID, 'threatItemMode')) || 'apply';
        let ab = Number(await item.getFlag(MODULE_ID, 'threatDamageValue'))
          || Number(await item.getFlag(MODULE_ID, 'threatAttackValue'))
          || Number(await item.getFlag(MODULE_ID, 'threatItemValue'))
          || 0;
        if (itemMode === 'reduce') ab = -Math.abs(ab);
        threat += ab;
      }
    }

    // Multipliers
    const distMult = getDistanceThreatMultiplier(token, atkToken);
    const traits = context?.traits ?? [];
    const options = context?.options ?? [];
    const damageType = extractDamageType(null, options);
    const IWRMult = getThreatModifierIWR(token, { traits, slug: actionSlug, damageType, options });

    if (IWRMult <= 0) continue;

    threat = Math.round(threat * distMult * IWRMult);
    Logger.info(`Damage → ${token.name}: dmg=${damage}, dist=${distMult}, IWR=${IWRMult}, final=${threat}`);

    await applyThreat(token, atkToken.id, atkToken.name, threat);
    await token.document.unsetFlag(MODULE_ID, 'preHP');
    await token.document.unsetFlag(MODULE_ID, 'attackThreat');
  }
}

/**
 * Handle actions with no PF2e context (custom item actions).
 */
async function handleNoContext(msg, context, sourceToken, origin, item, actionSlug) {
  if (!actionSlug) { Logger.warn('Empty context and no slug — cannot process'); return; }
  if (!item) return;

  const targetIds = resolveTargets(context, msg, sourceToken);
  const primaryTarget = targetIds[0] ? canvas.tokens.get(targetIds[0]) : null;
  const applyOnlyToPrimary = !!getSetting('applyThreatTargetOnly');

  // Store preHP
  if (applyOnlyToPrimary && primaryTarget) {
    await storePreHP(primaryTarget, null, sourceToken, actionSlug);
  } else {
    for (const enemy of getEnemyTokens(sourceToken)) {
      await storePreHP(enemy, null, sourceToken, actionSlug);
    }
  }

  const itemBase = Number(await item.getFlag?.(MODULE_ID, 'threatItemValue')) || 0;
  const itemMode = (await item.getFlag?.(MODULE_ID, 'threatItemMode')) || 'apply';
  const settingsBase = Number(getSetting('skillBase')) || 0;

  const base = itemBase > 0 ? itemBase : settingsBase;
  const bonus = Number(await item.getFlag?.(MODULE_ID, 'threatAttackValue'))
    || Number(await item.getFlag?.(MODULE_ID, 'threatDamageValue'))
    || 0;

  const taunterLevel = sourceToken.actor?.system?.details?.level?.value ?? 1;
  const levelAdjustment = taunterLevel * 0.1 + 1;
  let threatGlobal = (base + bonus) * levelAdjustment;
  if (itemMode === 'reduce') threatGlobal = -threatGlobal;

  const traits = context.traits ?? item?.system?.traits?.value ?? [];
  const options = context?.options ?? [];
  const damageType = extractDamageType(item);
  const enemies = resolveEnemies(sourceToken, targetIds, primaryTarget);

  await applyThreatToEnemies(
    enemies, sourceToken, threatGlobal,
    { traits, slug: actionSlug, damageType, options },
    `Action (${actionSlug})`
  );
}

// ─── Main dispatcher ──────────────────────────────────────────────

/**
 * Main handler for createChatMessage. Identifies message type and dispatches.
 * @param {ChatMessage} msg
 */
export async function processChatMessage(msg) {
  const combat = game.combats.active;
  if (!combat || !game.user.isGM) return;
  if (isThreatPaused()) {
    Logger.info('⏸ Threat paused — skipping message');
    return;
  }

  const context = msg.flags?.pf2e?.context ?? {};
  const actor = msg.actor;

  // Relaxed guard: only require actor for processing, not author/pf2e flags
  if (!actor) {
    Logger.debug('No actor on message — skipping');
    return;
  }

  // If no PF2e context at all, nothing to process
  if (!msg.flags?.pf2e) {
    Logger.debug('No PF2e flags on message — skipping');
    return;
  }

  Logger.info('Processing chat message:', context.type, '| actor:', actor.name);

  const { token: sourceToken, origin } = await resolveResponsibleToken(msg, context);
  if (!sourceToken) return;

  // Resolve item
  let item = msg.item ?? null;
  if (!item && origin && ['weapon', 'action', 'spell', 'shield', 'feat', 'consumable'].includes(origin?.type)) {
    item = origin;
  }

  // Check for custom slug override
  let actionSlug = extractActionSlug(context, item);
  if (item) {
    const customSlug = await item.getFlag?.(MODULE_ID, 'threatItemSlug');
    if (customSlug) actionSlug = customSlug;
  }

  const traits = extractTraits(context, msg, origin);

  // ── Classify message type ──
  const isAttack = context.type === 'attack-roll';
  const isSkillAttack = context.type === 'skill-check' && context.options?.includes('attack');
  const isDamageRoll = context.type === 'damage-roll' && !context.domains?.includes('healing-received');
  const isDamageTaken = context.type === 'damage-taken' && !context.domains?.includes('healing-received');
  const isSpellCast = context.type === 'spell-cast' || context.type === 'cast-spell';
  const isHeal = Array.isArray(context.domains) && context.domains.includes('healing-received');
  const isSkillAction = context.type === 'skill-check' && !context.options?.includes('attack');
  const isNoContext = Object.keys(context).length === 0;

  const matched = [
    isAttack && 'attack', isSkillAttack && 'skillAttack', isDamageRoll && 'damageRoll',
    isDamageTaken && 'damageTaken', isSpellCast && 'spellCast', isHeal && 'heal',
    isSkillAction && 'skillAction', isNoContext && 'noContext',
  ].filter(Boolean);
  Logger.info(`Dispatch: type="${context.type}", matched=[${matched.join(',')}], source=${sourceToken.name}, item=${item?.name ?? 'none'}`);

  // ── Dispatch ──
  try {
    if (isNoContext) {
      await handleNoContext(msg, context, sourceToken, origin, item, actionSlug);
    }
    if (isSpellCast) {
      await handleSpellCast(msg, context, sourceToken, origin, item);
    }
    if (isSkillAttack) {
      await handleSkillAttack(msg, context, sourceToken, origin, item);
    }
    if (isSkillAction && !ATTACK_SKILLS.has(actionSlug)) {
      await handleSkillAction(msg, context, sourceToken, origin, item);
    }
    if (isAttack) {
      await handleAttack(msg, context, sourceToken, origin, item);
    }
    if (isHeal) {
      await handleHeal(msg, context, sourceToken, origin);
    }
    if (isDamageTaken) {
      await handleDamageTaken(msg, context, sourceToken);
    }
  } catch (err) {
    Logger.error('Error processing threat from chat message:', err);
  }
}
