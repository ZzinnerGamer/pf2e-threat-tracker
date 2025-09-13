import { getUserTargets, storePreHP, getEnemyTokens, getDistanceThreatMultiplier, getThreatModifierIWR, _applyThreat, _updateFloatingPanel, getLoggingMode } from "../logic/threat-utils.js";

const MODULE = 'pf2e-threat-tracker';
const hasSkillCheck = new Set(["seek,", "sense-motive", "balance", "maneuver-in-flight", "squeeze", "tumble-through", "identify-magic", "recall-knowledge", "climb", "disarm", "force-open", "grapple", "high-jump", "long-jump", "reposition", "shove", "swim", "trip", "create-a-diversion", "feint", "request", "demoralize", "administer-first-aid", "treat-poison", "command-an-animal", "perform", "hide", "sneak", "disable-device", "palm-an-object", "pick-a-lock", "steal"]);
const ATTACK_SKILLS = new Set(["disarm", "escape", "force-open", "grapple", "reposition", "shove", "trip"]);

const loc = (k) => game?.i18n?.localize?.(k) ?? k;

const log = {
  all:  (...a) => { if (getLoggingMode() === 'all') console.log(...a); },
  min:  (...a) => { const m = getLoggingMode(); if (m === 'minimal' || m === 'all') console.log(...a); },
  warn: (...a) => { if (getLoggingMode() !== 'none') console.warn(...a); }
};


Hooks.on('createChatMessage', async(msg) => {
    const combat = game.combats.active
        if (!combat) {
        return;
    }
    if (!game.user.isGM)
        return;
    const context = msg.flags.pf2e?.context ?? {};
    const actor = msg.actor;
    if (!actor || !msg.author || !msg.flags?.pf2e)
        return;
    log.all(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.context"), context);

    const originUUID = msg.flags.pf2e.origin?.uuid;
    const origin = originUUID ? await fromUuid(originUUID) : null;
    let responsibleToken = origin?.isEmbedded && origin.documentName === 'Token' ? origin.object : null;
    if (!responsibleToken && origin?.actor)
        responsibleToken = canvas.tokens.placeables.find(t => t.actor?.id === origin.actor.id);
    responsibleToken = responsibleToken ?? canvas.tokens.get(actor.token?.id) ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
    if (!responsibleToken)
        return;

    const traits = Array.isArray(context.traits)
         ? context.traits.map(t => t.toLowerCase())
         : Array.isArray(msg.flags.pf2e?.traits)
         ? msg.flags.pf2e.traits.map(t => t.toLowerCase())
         : origin?.system?.traits?.value?.map(t => t.toLowerCase()) ?? [];

    const actionOpt = context.options?.find(o => typeof o === "string" && o.startsWith("item:slug:"));
    let actionSlug = actionOpt?.split("item:slug:")[1] || context.options?.find(o => typeof o === hasSkillCheck);

    let item = null;
    if (msg.item) {
        item = msg.item;
    } else if (origin && origin.type && ["weapon", "action", "spell", "shield", "feat", "consumable"].includes(origin.type)) {
        item = origin;
    }

    let customThreatSlug;
    if (item) {
        customThreatSlug = await item.getFlag(MODULE, "threatItemSlug");
        if (customThreatSlug !== undefined && customThreatSlug !== null) {
            actionSlug = customThreatSlug;
        }
    }

    const isAttack = context.type === 'attack-roll';
    const isSkillAttack = context.type === 'skill-check' && context.options?.includes("attack");
    const isDamageRoll = context.type === 'damage-roll' && !context.domains.includes("healing-received");
    const isDamageTaken = context.type === 'damage-taken' && !context.domains.includes("healing-received");
    const isDamage = isDamageRoll || isDamageTaken;


    const isWeaponDamage = isDamage && context.type === 'attack';
    const isSpellDamage = context.type === 'damage-taken' && context.domains.includes("action:cast-a-spell") || context.type === 'damage-received' && context.domains.includes("action:cast-a-spell");

    const isSpellCast = context.type === 'spell-cast' || context.type === 'cast-spell';
    const isHeal = Array.isArray(context.domains) && context.domains.includes('healing-received');

    const isSkillAction = context.type === "skill-check" && !context.options?.includes("attack");

    const knownTypes = [isAttack, isDamageRoll, isDamageTaken, isWeaponDamage, isSpellDamage, isSpellCast, isHeal, isSkillAction, isSkillAttack];

    const isKnown = knownTypes.some(Boolean);

    log.all(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.sourceType"), context.type, {
            domains: context.domains
    });

    if (!isKnown && !hasSkillCheck) {
        log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.unknownMessageType"));

        for (const token of canvas.tokens.placeables) {
            if (token.inCombat) {
                await storePreHP(token, null, responsibleToken, actionSlug);
            }
        }
    }

if (Object.keys(context).length === 0) {
  log.all(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.emptyContextSlug"));

  if (!actionSlug) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.cannotGetSlug"));
    return;
  }

  const targetsRaw = getUserTargets(context, msg, responsibleToken) ?? [];
  const targetIds = targetsRaw.map(t => (typeof t === "string" ? t : t?.id)).filter(Boolean);
  const applyOnlyToPrimary = !!game.settings.get(MODULE, "applyThreatTargetOnly");
  const primaryTargetId = targetIds[0] ?? null;
  const primaryTarget   = primaryTargetId ? canvas.tokens.get(primaryTargetId) : null;

  if (applyOnlyToPrimary) {
    if (primaryTarget) {
      await storePreHP(primaryTarget, null, responsibleToken, actionSlug);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${primaryTarget.name} (primary-only)`);
    } else {
      for (const enemy of canvas.tokens.placeables.filter(t =>
        t.inCombat &&
        t.document.disposition !== responsibleToken.document.disposition &&
        !t.actor.hasPlayerOwner
      )) {
        await storePreHP(enemy, null, responsibleToken, actionSlug);
      }
    }
  } else {
    for (const enemy of canvas.tokens.placeables.filter(t =>
      t.inCombat &&
      t.document.disposition !== responsibleToken.document.disposition &&
      !t.actor.hasPlayerOwner
    )) {
      await storePreHP(enemy, null, responsibleToken, actionSlug);
    }
  }

  const itemBase     = Number(await item.getFlag(MODULE, "threatItemValue")) || 0;
  const itemMode     = (await item.getFlag(MODULE, "threatItemMode")) || "apply";
  const settingsBase = Number(game.settings.get(MODULE, "skillBase")) || 0;

  const base  = itemBase > 0 ? itemBase : settingsBase;
  const bonus =
    Number(await item.getFlag(MODULE, "threatAttackValue")) ||
    Number(await item.getFlag(MODULE, "threatDamageValue")) ||
    0;

  const taunterLevel    = responsibleToken.actor?.system?.details?.level?.value ?? 1;
  const levelAdjustment = taunterLevel * 0.1 + 1;
  let threatGlobal      = (base + bonus) * levelAdjustment;

  if (itemMode === "reduce") {
    threatGlobal = -threatGlobal;
    log.all(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.reduceModeDetected"));
  }

  const traits   = context.traits ?? item?.system?.traits?.value ?? [];
  const slug     = actionSlug;
  const options  = context?.options ?? [];
  const damageType = (() => {
    const d = item?.system?.damage;
    if (!d) return "";
    const first = typeof d === "object" ? Object.values(d).find(Boolean) : null;
    return first?.damageType ?? d?.damageType ?? "";
  })();

  const enemies = (() => {
    if (applyOnlyToPrimary && primaryTarget) {
      const isEnemy = primaryTarget.inCombat
        && primaryTarget.document.disposition !== responsibleToken.document.disposition
        && !primaryTarget.actor?.hasPlayerOwner;
      return isEnemy ? [primaryTarget] : [];
    }
    return getEnemyTokens(responsibleToken);
  })();

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isDeadSkipping")}`);
      continue;
    }
    const IWRMult = getThreatModifierIWR(enemy, { traits, slug, damageType, options });

    if (IWRMult <= 0) {
      log.min(`[${MODULE}] `, enemy.name, loc("pf2e-threat-tracker.logs.isImmuneTo"), traits.join(", ") || "—");
      continue;
    }

    const finalThreat = Math.round(threatGlobal * IWRMult);

    let logBlock = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.actionThreat")}\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.baseThreat")} ${base}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.originActorLevel")} ${taunterLevel}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.levelAdjustment")} ${levelAdjustment}.\n`;
    if (game.settings.get(MODULE, 'enableIWR') === true){
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")} ${IWRMult}\n`;
    }
        logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${finalThreat}\n`;

    log.min(logBlock);

    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
  }

  _updateFloatingPanel();
}

if (isSpellCast) {
  function hasAttackTrait(context) {
  const traits  = Array.isArray(context?.traits)  ? context.traits  : [];
  const options = Array.isArray(context?.options) ? context.options : [];

  return (
    traits.includes('attack') ||
    options.includes('trait:attack') ||
    options.includes('attack') ||
    options.some(o => typeof o === 'string' && /(^|:)trait:attack$/.test(o))
  );
}
  if (hasAttackTrait(context)) return;

  for (const token of canvas.tokens.placeables) {
    if (!token.inCombat) continue;
    const hp = token.actor.system.attributes.hp?.value;
    if (typeof hp === "number") {
      await storePreHP(token, null, responsibleToken);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")} ${token.name}: ${hp}`);
    }
  }

  const spellTraits = context?.options ?? item?.system?.options?.value ?? [];
  const hasIgnoredTrait = spellTraits.some(t => String(t).toLowerCase() === "healing");
  if (hasIgnoredTrait) {
    log.min(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.healingSpellDetected"));
    return;
  }

  const spellRankRaw = context?.options?.find(opt => opt.startsWith("item:rank:"))?.split(":")[2];
  const spellRank = Number(spellRankRaw);
  if (Number.isNaN(spellRank)) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.spellNoRank"));
    return;
  }

  const base          = Number(game.settings.get(MODULE, "baseSpellThreat")) || 0;
  const threatPerRank = Number(game.settings.get(MODULE, "threatPerSpellRank")) || 3;
  const bonus         = Number(await item.getFlag(MODULE, "threatAttackValue")) || 0;

  const rankAdjustment = threatPerRank * 0.1;
  const threatGlobal   = (base + bonus) * rankAdjustment;

  const traits      = spellTraits;
  const slug        = item?.system?.slug ?? item?.slug ?? "";
  const options     = context?.options ?? [];

  const damageType = (() => {
    const dmg = item?.system?.damage;
    if (!dmg) return "";
    const first = Object.values(dmg).find(Boolean);
    return first?.damageType ?? "";
  })();

  for (const enemy of getEnemyTokens(responsibleToken)) {
    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isDeadSkipping")}`);
      continue;
    }
    const IWRMult = getThreatModifierIWR(enemy, { traits, slug, damageType, options });
    const finalThreat = Math.round(threatGlobal * IWRMult);

    let logBlock  = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")}\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.baseThreat")} ${base}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.configurableBonus")} ${bonus}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.spellRank")} ${spellRank}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.threatPerRank")} ${threatPerRank}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.rankMultiplier")} ${rankAdjustment}.\n`;
    if (game.settings.get(MODULE, 'enableIWR') === true){
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")} ${IWRMult}\n`;
    }
        logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${finalThreat}\n`;
        logBlock += `${loc("pf2e-threat-tracker.logs.threatAppliedTo")} ${enemy.name}: ${finalThreat >= 0 ? "+" : ""}${finalThreat}\n`;

    log.min(logBlock);

    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
  }

  _updateFloatingPanel();
}

if (isSkillAttack) {
  const slug =
    context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
    context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
    msg.flags?.[MODULE]?.slug ??
    (await msg.getFlag(MODULE, "slug")) ??
    undefined;

  if (!slug || !ATTACK_SKILLS.has(slug)) {
    log.warn(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.attackSkillNotRecogniced")} ${slug}`);
    return;
  }

  const outcome = context.outcome ?? "failure";
  const level   = actor.system.details.level.value ?? 0;
  const base    = Number(game.settings.get(MODULE, "baseAttackThreat")) || 0;

  let threatGlobal;
  let value = await actor.getFlag(MODULE, `skillActionValue.${slug}`);
  let mode  = await actor.getFlag(MODULE, `skillActionMode.${slug}`);
  if (value == null) value = game.settings.get(MODULE, `globalSkillActionValue.${slug}`);
  if (mode  == null) mode  = game.settings.get(MODULE, `globalSkillActionMode.${slug}`);

  if (typeof value === "number" && value > 0) {
    threatGlobal = value;
    if (mode === "reduce") threatGlobal *= -1;
    log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.reduceModeDetected")} '${slug}': ${value} (${mode ?? "apply"})`);
  }

  if (threatGlobal == null) {
    const levelAdj = 1 + level * 0.1;
    switch (outcome) {
      case "criticalFailure": threatGlobal = 0; break;
      case "failure":         threatGlobal = Math.ceil(base * levelAdj); break;
      case "success":         threatGlobal = Math.ceil((base + 10) * levelAdj); break;
      case "criticalSuccess": threatGlobal = Math.ceil((base + 20) * levelAdj); break;
      default:                threatGlobal = base; break;
    }
  }

  const targetsRaw = getUserTargets(context, msg, responsibleToken) ?? [];
  const targetIds = targetsRaw.map(t => (typeof t === "string" ? t : t?.id)).filter(Boolean);

  const applyOnlyToPrimary = !!game.settings.get(MODULE, "applyThreatTargetOnly");
  const primaryTargetId = targetIds[0] ?? null;
  const primaryTarget   = primaryTargetId ? canvas.tokens.get(primaryTargetId) : null;

  if (!targetIds.length) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.reduceModeDetected"));
    return;
  }

  if (applyOnlyToPrimary) {
    if (primaryTarget) {
      await storePreHP(primaryTarget, null, responsibleToken, actionSlug);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${primaryTarget.name} (primary-only)`);
    } else {
      log.min(`[${MODULE}] No hay objetivo principal resuelto para preHP (applyThreatTargetOnly activo).`);
    }
  } else {
    for (const id of targetIds) {
      const targetToken = canvas.tokens.get(id);
      if (targetToken) {
        await storePreHP(targetToken, null, responsibleToken, actionSlug);
        log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${targetToken.name}`);
      }
    }
  }

  const enemies = (() => {
    if (applyOnlyToPrimary && primaryTarget) {
      const isEnemy = primaryTarget.inCombat
        && primaryTarget.document.disposition !== responsibleToken.document.disposition
        && !primaryTarget.actor?.hasPlayerOwner;
      return isEnemy ? [primaryTarget] : [];
    }
    return getEnemyTokens(responsibleToken, targetIds);
  })();

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isDeadSkipping")}`);
      continue;
    }
       const traits   = context.traits ?? item?.system?.traits?.value ?? [];
       const options  = context?.options ?? [];
       const IWRMult  = getThreatModifierIWR(enemy, { traits, slug, options });

    if (IWRMult <= 0) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isImmuneTo")} ${traits.join(", ")}`);
      continue;
    }

    const finalThreat = Math.round(threatGlobal * IWRMult);

    let logBlock  = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")}\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.skillSlug")} ${slug}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.baseThreat")} ${base}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.originActorLevel")} ${level}.\n`;
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.rollOutcome")} ${outcome}.\n`;
    if (game.settings.get(MODULE, 'enableIWR') === true){
        logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")}  ${IWRMult}\n`;
    }
        logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${finalThreat}\n`;
    log.min(logBlock);

    if (finalThreat >= 0) {
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatAppliedTo")} ${enemy.name}: +${finalThreat}`);
    } else {
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatReduction")} ${enemy.name}: ${finalThreat}`);
    }

    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
  }

  _updateFloatingPanel();
}

if (isSkillAction && !ATTACK_SKILLS.has(actionSlug)) {
  const slug =
    context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
    context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
    msg.flags?.[MODULE]?.slug ??
    (await msg.getFlag(MODULE, "slug")) ??
    undefined;

  if (!slug) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.cannotGetSlug"));
    return;
  }
  if (slug === "treat-wounds") return;

  log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.skillSlug")} ${slug}`);

  const actorLevel = Number(context.options?.find(opt => opt.startsWith("self:level:"))?.split(":")[2]) || 1;
  const outcome    = context.outcome ?? "failure";
  const traits     = context.traits ?? [];

  let value = await actor.getFlag(MODULE, `customSkillValue.${slug}`);
  let mode  = await actor.getFlag(MODULE, `customSkillMode.${slug}`);

  if (value == null) value = game.settings.get(MODULE, `globalSkillActionValue.${slug}`);
  if (mode  == null) mode  = game.settings.get(MODULE, `globalSkillActionMode.${slug}`);

  let threatGlobal = 0;

  if (Number(value) > 0) {
    threatGlobal = Number(value);
    if (mode === "reduce") threatGlobal = -Math.abs(threatGlobal);
    log.all(`[${MODULE}] Usando amenaza personalizada para ${slug}: ${value} (mode=${mode})`);
  } else {
    if (outcome === "failure") {
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingCustomThreat")} ${slug}`);
      return;
    }
    

    const baseSkillThreat = Number(game.settings.get(MODULE, "skillBase")) || 0;
    const baseSkillCrit   = Number(game.settings.get(MODULE, "skillCritBonus")) || 0;
    const levelFactor     = 1 + actorLevel * 0.1;

    let outcomeThreat = baseSkillThreat;
    if (outcome === "success") {
      outcomeThreat += Math.ceil(baseSkillThreat * levelFactor);
    } else if (outcome === "criticalSuccess") {
      outcomeThreat += Math.ceil(baseSkillThreat + baseSkillCrit * levelFactor);
    } else if (outcome === "criticalFailure") {
      outcomeThreat += -baseSkillThreat * levelFactor;
    }

    threatGlobal = outcomeThreat;
    log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")} "${slug}": ${threatGlobal} (outcome=${outcome}, level=${actorLevel})`);
  }

  const targetsRaw = getUserTargets(context, msg, responsibleToken) ?? [];
  const targetIds = targetsRaw.map(t => (typeof t === "string" ? t : t?.id)).filter(Boolean);

  const applyOnlyToPrimary = !!game.settings.get(MODULE, "applyThreatTargetOnly");
  const primaryTargetId = targetIds[0] ?? null;
  const primaryTarget   = primaryTargetId ? canvas.tokens.get(primaryTargetId) : null;

  if (!targetIds.length) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.reduceModeDetected"));
    return;
  }

  if (applyOnlyToPrimary) {
    if (primaryTarget) {
      await storePreHP(primaryTarget, null, responsibleToken, actionSlug);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${primaryTarget.name} (primary-only)`);
    } else {
      log.min(`[${MODULE}] No hay objetivo principal resuelto para preHP (applyThreatTargetOnly activo).`);
    }
  } else {
    for (const id of targetIds) {
      const targetToken = canvas.tokens.get(id);
      if (targetToken) {
        await storePreHP(targetToken, null, responsibleToken, actionSlug);
        log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${targetToken.name}`);
      }
    }
  }

  const enemies = (() => {
    if (applyOnlyToPrimary && primaryTarget) {
      const isEnemy = primaryTarget.inCombat
        && primaryTarget.document.disposition !== responsibleToken.document.disposition
        && !primaryTarget.actor?.hasPlayerOwner;
      return isEnemy ? [primaryTarget] : [];
    }
    return getEnemyTokens(responsibleToken);
  })();

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isDeadSkipping")}`);
      continue;
    }
       const options = context?.options ?? [];
       const IWRMult = getThreatModifierIWR(enemy, { traits, slug, options });
    if (IWRMult <= 0) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isImmuneTo")} ${traits.join(", ") || "—"}`);
      continue;
    }

    const finalThreat = Math.round(threatGlobal * IWRMult);

    let logBlock = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.actionSlug")} ${slug}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.mode")} ${mode ?? "apply"}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.rollOutcome")} ${outcome}\n`;
    if (outcome === "criticalFailure") {
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.criticalFailureRevert")}\n`;
    }
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.originActorLevel")} ${actorLevel}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.levelAdjustment")} ${1 + actorLevel * 0.1}\n`;
    if (game.settings.get(MODULE, 'enableIWR') === true){
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")} ${IWRMult}\n`;
    }
    logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${finalThreat}\n`;
    logBlock += `${loc("pf2e-threat-tracker.logs.threatAppliedTo")} ${enemy.name}: ${finalThreat >= 0 ? "+" : ""}${finalThreat}\n`;

    log.min(logBlock);

    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
  }

  _updateFloatingPanel();
}

if (isAttack) {

  const outcome = context.outcome ?? "failure";

  let actionSlug =
    context.options?.find(o => o.startsWith("origin:action:slug:"))?.split(":")[3] ??
    context.options?.find(o => o.startsWith("item:slug:"))?.split(":")[2] ??
    origin?.system?.slug ?? origin?.slug ?? "";

  const item = origin instanceof Item ? origin : null;

  let base = Number(game.settings.get(MODULE, "baseAttackThreat")) || 0;

  if (origin instanceof Item && ["weapon", "shield", "spell"].includes(origin.type)) {
    const customValue = Number(await origin.getFlag(MODULE, "threatAttackValue")) || 0;
    if (customValue > 0) {
      base = customValue;
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingCustomThreat")}: ${base}`);
    } else {
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")}: ${base}`);
    }
  } else {
    log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")}: ${base}`);
  }

  let threatGlobal = base;
  switch (outcome) {
    case "success":          threatGlobal += 10; break;
    case "criticalSuccess":  threatGlobal += 20; break;
    case "failure":
    default: break;
  }

  const targets = getUserTargets(context, msg, responsibleToken);

  const targetIds = targets
    .map(t => (typeof t === "string" ? t : t?.id))
    .filter(Boolean);

  const applyOnlyToPrimary = !!game.settings.get(MODULE, "applyThreatTargetOnly");

  const primaryTargetId = targetIds[0] ?? null;
  const primaryTarget   = primaryTargetId ? canvas.tokens.get(primaryTargetId) : null;

  log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.targets")}:`, targetIds);

  
  if (applyOnlyToPrimary) {
    if (primaryTarget) {
      await storePreHP(primaryTarget, null, responsibleToken, actionSlug);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${primaryTarget.name} (primary-only)`);
    } else {
      log.min(`[${MODULE}] No hay objetivo principal resuelto para preHP (applyThreatTargetOnly activo).`);
    }
  } else {
  for (const id of targetIds) {
    const targetToken = canvas.tokens.get(id);
    if (targetToken) {
      await storePreHP(targetToken, null, responsibleToken, actionSlug);
      log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${targetToken.name}`);
    }
  }
}

let enemies = [];
  if (applyOnlyToPrimary && primaryTarget) {
    const isEnemy =
      primaryTarget.inCombat &&
      primaryTarget.document.disposition !== responsibleToken.document.disposition &&
      !primaryTarget.actor?.hasPlayerOwner;
    enemies = isEnemy ? [primaryTarget] : [];
  } else {
    enemies = getEnemyTokens(responsibleToken);
  }

  for (const enemy of enemies) {
    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${enemy.name} ${loc("pf2e-threat-tracker.logs.isDeadSkipping")}`);
      continue;
    }
       const damageType = (() => {
         const d = item?.system?.damage;
         if (!d) return "";
         const first = typeof d === "object" ? Object.values(d).find(Boolean) : null;
         return first?.damageType ?? d?.damageType ?? "";
       })();
    const distMult   = getDistanceThreatMultiplier(enemy, responsibleToken);
    const itemMode   = (await origin?.getFlag(MODULE, "threatItemMode")) || "apply";

    let amount = Math.round(threatGlobal * distMult);
    if (itemMode === "reduce" || game.settings.get(MODULE, "attackThreatMode") === true) {
      amount = -amount;
      log.all(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.reduceModeDetected"));
    }

    const traits  = context.traits ?? item?.system?.traits?.value ?? [];
    const options = context?.options ?? [];
    const IWRMult = getThreatModifierIWR(enemy, { traits, slug: actionSlug, damageType, options });

    if (IWRMult <= 0) {
      log.min(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ") || "—"}`);
      continue;
    }

    const finalThreat = Math.round(amount * IWRMult);

    let logBlock = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")} ${enemy.name}:\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.actionSlug")} ${actionSlug || "—"}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.damageType")} ${damageType ?? "—"}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.baseThreat")} ${base}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.rollOutcome")} ${outcome}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.distanceMutiplier")} ${distMult}\n`;
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.mode")} ${itemMode}\n`;
    if (game.settings.get(MODULE, 'enableIWR') === true){
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")} ${IWRMult}\n`;
    }
    logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${finalThreat}\n`;
    log.min(logBlock);

    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
  }

  _updateFloatingPanel();
}


if (isHeal) {
  const originItem = origin instanceof Item ? origin : responsibleToken?.actor?.items?.get(origin?.id);

  let baseHealThreat = 0;
  let baseHeal = 0;

  const lastHealAction = await responsibleToken?.document?.getFlag(MODULE, "lastHealAction");

  const isTreatWounds =
    (context.type?.toLowerCase() === "skill-check" &&
     context.options?.some(opt => opt.toLowerCase().includes("action:treat-wounds"))) ||
    lastHealAction === "treat-wounds";

  if (isTreatWounds) {
    baseHealThreat = Number(await responsibleToken.actor?.getFlag(MODULE, "skillActionValue.treat-wounds"));
    if (!baseHealThreat || baseHealThreat <= 0) {
      baseHealThreat = game.settings.get(MODULE, "baseHealThreat") || 0;
      log.warn(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")} ${baseHealThreat}`);
    }
    baseHeal = baseHealThreat;
    await responsibleToken?.document?.unsetFlag(MODULE, "lastHealAction");
  } else {
    // Buscar ítem origen si hace falta
    let foundItem = originItem;
    if (!foundItem || !(foundItem instanceof Item)) {
      const actor = origin?.actor ?? responsibleToken?.actor;
      if (actor && origin?.id) {
        const found = actor.items.get(origin.id);
        if (found) foundItem = found;
      }
    }

    if (foundItem?.getFlag) {
      baseHealThreat = Number(await foundItem.getFlag(MODULE, "threatHealValue"));
      if (!baseHealThreat || baseHealThreat <= 0) {
        baseHealThreat = game.settings.get(MODULE, "baseHealThreat") || 0;
        log.warn(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")} ${baseHealThreat}`);
      } else {
        log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingCustomThreat")} ${baseHealThreat}`);
      }
    } else {
      baseHealThreat = game.settings.get(MODULE, "baseHealThreat") || 0;
      log.warn(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.usingGlobalThreat")} ${baseHealThreat}`);
    }
    baseHeal = baseHealThreat;
  }

  // Garantiza fallback coherente
  baseHeal = baseHealThreat > 0 ? baseHealThreat : (game.settings.get(MODULE, "baseHealThreat") || 0);

  const targets = getUserTargets(context, msg, responsibleToken);

  // Toma el primer aliado válido a curar
  let token = null;
  for (const tgtId of targets) {
    const tempToken = canvas.tokens.get(tgtId);
    if (!tempToken || tempToken.document.disposition !== responsibleToken.document.disposition) {
      if (tempToken) log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.enemyHealingIgnored")}: ${tempToken.name}`);
      continue;
    }
    token = tempToken;
    break;
  }

  if (!token) {
    log.warn(`[${MODULE}] `, loc("pf2e-threat-tracker.logs.noValidHealingToken"));
    return;
  }

  const preData = await token.document.getFlag(MODULE, "preHP");
  const preHP   = preData?.hp;
  const { hp }  = token.actor.system.attributes;
  const maxHP   = hp.max;

  const healAmt      = Math.max(0, hp.value - preHP);
  const healPossible = Math.max(0, maxHP - preHP);
  const threatLocal  = Math.ceil(baseHeal + healAmt);

  if (threatLocal > 0) {
    for (const enemy of canvas.tokens.placeables.filter(t =>
      t.inCombat &&
      t.document.disposition !== responsibleToken.document.disposition &&
      t.document.disposition !== 0 &&
      responsibleToken.document.disposition !== 0 &&
      !t.actor.hasPlayerOwner
    )) {
      const amount = threatLocal;

    if (enemy.actor?.getFlag(MODULE, 'ignoreThreat')) {
      log.min(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.targetIsDeadSkipping")}: ${canvas.tokens.get(target.id)?.name}`);
      return;
    }

      // Bloque detallado al estilo “sin contexto”
      let logBlock  = `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")}\n`;
      logBlock     += ` ├─ ${loc("pf2e-threat-tracker.logs.previousHP")} ${preHP}\n`;
      logBlock     += ` ├─ ${loc("pf2e-threat-tracker.logs.maxHP")} ${maxHP}\n`;
      logBlock     += ` ├─ ${loc("pf2e-threat-tracker.logs.possibleHealing")} ${healPossible}\n`;
      logBlock     += ` ├─ ${loc("pf2e-threat-tracker.logs.baseThreat")} ${baseHeal}\n`;
      logBlock     += ` ├─ ${loc("pf2e-threat-tracker.logs.healingAmount")} ${healAmt} curado)\n`;
      logBlock     += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${amount}\n`;
      log.min(logBlock);

      await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
    }
    _updateFloatingPanel();
  }
  return;
}


if (isDamageTaken) {

const targetIdsFromEvent = [];
const getId = (ref) => (typeof ref === "string" ? ref.split(".").pop() : null);
if (context?.target?.token) targetIdsFromEvent.push(getId(context.target.token));
if (msg?.target?.token)     targetIdsFromEvent.push(getId(msg.target.token));

const candidates = (targetIdsFromEvent.filter(Boolean).length
  ? targetIdsFromEvent
      .filter(Boolean)
      .map(id => canvas.tokens.get(id))
      .filter(Boolean)
  : canvas.tokens.placeables);
  
const damagedTokens = candidates.filter(t => {
  if (!t?.inCombat) return false;
  if (t.actor?.hasPlayerOwner) return false;
  if (t.document.disposition === responsibleToken.document.disposition) return false;

  const pre = t.document.getFlag(MODULE, "preHP");
  if (!pre || typeof pre.hp !== "number") return false;

  const atkTok = pre.attackerId ? canvas.tokens.get(pre.attackerId) : null;
  if (!atkTok) return false;
  
  if (t.document.disposition === atkTok.document.disposition) return false;

  return true;
});

  log.all(`[${MODULE}] Tokens con preHP registrado: ${damagedTokens.map(t => t.name).join(", ") || "—"}`);

  for (const token of damagedTokens) {
    log.all(`[${MODULE}] ${loc("pf2e-threat-tracker.logs.tokenDataSavedFor")}: ${token.name}`);

    const preData = token.document.getFlag(MODULE, "preHP");

    const { hp: preHP, attackerId } = preData ?? {};
    if (!attackerId) {
      continue;
    }

    const atkToken = canvas.tokens.get(attackerId);
    if (!atkToken) continue;

    const currHP = token.actor?.system?.attributes?.hp?.value ?? 0;
    let damage = Math.max(0, preHP - currHP);

    let threat = damage;
    let logBlock =
      `[${MODULE}] ${loc("pf2e-threat-tracker.logs.threatCalculation")} ${token.name}:\n`;
      logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.damage")} ${damage}\n`;
      logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.previousHP")} ${preHP}\n`;
      logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.currentHP")} ${currHP})\n`;

    // Bonus por exceso de daño > 50% de vida previa
    if (damage > preHP * 0.5) {
      const bonusExcess = Math.floor(damage - preHP * 0.5);
      threat += bonusExcess;
      logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.massiveDamage")} ${bonusExcess}\n`;
    } else {
    }

    // Bonus configurable por acción (desde flags del item)
    const actionSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
    if (actionSlug) {
      let ab = 0;
      if (item?.getFlag) {
        const mode = item.getFlag(MODULE, "threatItemMode") || "apply";
        ab =
          Number(item.getFlag(MODULE, "threatDamageValue")) ||
          Number(item.getFlag(MODULE, "threatAttackValue")) ||
          Number(item.getFlag(MODULE, "threatItemValue")) ||
          0;
        if (mode === "reduce") ab = -Math.abs(ab);
      }
      if (ab) threat += ab;
      logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.massiveDamage")} (${actionSlug}) ${ab >= 0 ? "+" : ""}${ab}\n`;
    }

    // Multiplicadores
    const distMult   = getDistanceThreatMultiplier(token, atkToken);
    const traits     = context?.traits ?? item?.system?.traits?.value ?? [];
    const options    = context?.options ?? [];
    let damageType = (() => {
      const d = item?.system?.damage;
      if (!d) return "";
        const first = typeof d === "object" ? Object.values(d).find(Boolean) : null;
        return first?.damageType ?? d?.damageType ?? "";
      })();

    if (!damageType && Array.isArray(options)) {
      const opt = options.find(o => o.startsWith("item:damage:type:"));
      if (opt) damageType = opt.split(":")[3] || "";
    }


    const IWRMult = getThreatModifierIWR(token, { traits, slug: actionSlug, damageType, options });

    if (IWRMult <= 0) {
    const list = [...traits, damageType].filter(Boolean).join(", ");
    log.min(`[${MODULE}] ${token.name} ${loc("pf2e-threat-tracker.logs.isImmuneTo")} ${list || "—"}`);
    continue;
    }

    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.distanceMutiplier")} ${distMult}\n`
    if (game.settings.get(MODULE, 'enableIWR') === true){
    logBlock += ` ├─ ${loc("pf2e-threat-tracker.logs.IWRMultiplier")} ${IWRMult}\n`;
    }
    threat = Math.round(threat * distMult * IWRMult);

    logBlock += ` └─ ${loc("pf2e-threat-tracker.logs.finalThreat")} ${threat >= 0 ? "+" : ""}${threat}\n`;

    log.min(logBlock);

    await _applyThreat(token, atkToken.id, atkToken.name, threat);

    await token.document.unsetFlag(MODULE, "preHP");
    await token.document.unsetFlag(MODULE, "attackThreat");
  }

  _updateFloatingPanel();
}


});
