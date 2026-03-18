/**
 * @module core/auto-defaults
 * Heuristic-based automatic threat value calculator.
 *
 * Instead of requiring the GM to manually assign threat values to 6000+ effects,
 * skills and feats, this module analyses the properties of each item/action and
 * produces a reasonable default threat value based on:
 *
 *   - Action economy (3-action = more threat than free action)
 *   - Traits (attack, healing, mental, fear, etc.)
 *   - Spell rank (higher rank = more threat)
 *   - Damage presence and type
 *   - Area of effect
 *   - Duration (sustained effects = more threat)
 *   - Custom category multipliers (offensive, defensive, utility, healing)
 *
 * The GM can still override any value manually — this just provides the baseline
 * so the system works out of the box.
 */

import { MODULE_ID } from './constants.js';
import { Logger } from './logger.js';

// ─── Trait weights ────────────────────────────────────────────────
// Positive = generates threat. Negative = reduces/redirects threat.
// 0 = trait is recognised but neutral for threat calculation.
//
// Organised by AoN categories + damage types + creature/class traits.
// Only traits that meaningfully affect threat are assigned non-zero values.
// Traits not listed here are ignored (weight 0) by default.

const TRAIT_WEIGHTS = {

  // ═══ AFFLICTION TRAITS ═══
  curse:        8,
  disease:      6,
  poison:       7,
  virulent:     4,   // Makes afflictions worse

  // ═══ MECHANICS TRAITS — COMBAT / HIGH THREAT ═══
  attack:           15,
  death:            15,
  incapacitation:   15,
  fear:             12,
  possession:       12,
  sleep:            10,
  mental:           10,
  emotion:          8,
  charm:            9,
  radiation:        8,
  splash:           6,    // AoE damage component
  press:            4,    // Requires setup = committed to aggression
  flourish:         5,    // Once-per-turn power move
  'certain-kill':   12,   // Finisher-style
  reckless:         6,    // Risky = high aggro

  // ═══ MECHANICS TRAITS — CONTROL / BATTLEFIELD ═══
  polymorph:    8,
  morph:        5,
  teleportation: 4,
  summon:       7,
  summoned:     3,
  incarnate:    6,
  darkness:     5,
  light:        3,
  scrying:      2,
  revelation:   3,
  prediction:   2,
  fortune:      4,
  misfortune:   7,   // Debuffing enemies = threat
  sanctified:   4,
  holy:         5,
  unholy:       5,

  // ═══ MECHANICS TRAITS — DEFENSIVE / SUPPORT ═══
  healing:      10,   // Healing draws aggro
  aura:         8,    // Persistent area = sustained threat
  consecration: 5,
  contingency:  3,

  // ═══ MECHANICS TRAITS — ACTIONS / MODIFIERS ═══
  move:         3,
  manipulate:   2,
  concentrate:  2,
  open:         2,
  vocal:        2,
  subtle:       -2,   // Hard to notice = less threat
  secret:       -2,
  telepathy:    3,

  // ═══ MECHANICS TRAITS — SENSORY ═══
  visual:       3,
  auditory:     5,
  linguistic:   2,
  olfactory:    1,

  // ═══ MECHANICS TRAITS — MISC ═══
  exploration:  1,
  downtime:     0,
  cantrip:      -3,   // Weaker by nature
  focus:        2,
  spellshape:   3,    // Metamagic = empowered spell
  minion:       3,
  skirmish:     4,
  tea:          0,

  // ═══ DAMAGE TYPES ═══
  fire:         10,
  electricity:  8,
  acid:         8,
  cold:         7,
  sonic:        8,
  force:        8,
  vitality:     6,
  void:         6,
  metal:        5,
  wood:         4,
  water:        4,
  earth:        5,
  air:          4,

  // ═══ MAGIC SCHOOLS / TRADITIONS ═══
  evocation:      10,
  necromancy:     8,
  enchantment:    7,
  transmutation:  4,
  conjuration:    5,
  illusion:       5,
  abjuration:     4,
  divination:     2,
  arcane:         2,
  divine:         2,
  occult:         2,
  primal:         2,

  // ═══ EQUIPMENT / CONSUMABLE TRAITS ═══
  bomb:         8,
  alchemical:   3,
  elixir:       3,
  mutagen:      5,
  drug:         4,
  snare:        6,    // Trap = proactive threat
  trap:         5,
  catalyst:     2,
  gadget:       3,
  talisman:     2,
  fulu:         2,
  oil:          2,
  potion:       3,
  scroll:       2,
  wand:         2,
  staff:        3,
  structure:    4,    // Deploying structures = tactical threat
  clockwork:    2,
  steam:        2,
  spellgun:     5,
  spellheart:   3,

  // ═══ CLASS-SPECIFIC TRAITS — AGGRESSIVE ═══
  rage:         10,   // Barbarian rage = maximum threat
  finisher:     12,   // Swashbuckler finisher = big hit
  brandish:     6,
  bravado:      5,
  overflow:     8,    // Kineticist overflow = big blast
  impulse:      6,    // Kineticist impulse
  unstable:     7,    // Inventor unstable = risky/powerful
  hex:          7,    // Witch hex
  litany:       6,    // Champion litany
  spellshot:    6,    // Gunslinger spellshot
  apparition:   5,    // Animist
  cursebound:   5,    // Oracle

  // ═══ CLASS-SPECIFIC TRAITS — SUPPORT / TACTICAL ═══
  composition:  5,    // Bard compositions
  stance:       4,    // Entering a fighting stance
  banner:       4,    // Commander banner
  tactic:       5,    // Commander tactic
  tandem:       4,    // Paired action
  oath:         3,    // Champion oath
  eidolon:      4,    // Summoner eidolon action
  evolution:    3,    // Summoner eidolon evolution
  ikon:         5,    // Exemplar ikon
  transcendence: 8,   // Exemplar transcendence = power spike
  modification: 3,    // Inventor
  infusion:     3,    // Alchemist
  social:       2,    // Social actions
  vigilante:    3,
  wandering:    2,

  // ═══ CREATURE TYPE TRAITS (used for IWR matching) ═══
  // These don't directly generate threat but help with categorisation
  aberration: 0, animal: 0, beast: 0, celestial: 0, construct: 0,
  daemon: 0, demon: 0, devil: 0, dragon: 0, elemental: 0,
  fey: 0, fiend: 0, giant: 0, humanoid: 0, monitor: 0,
  ooze: 0, plant: 0, spirit: 0, undead: 0,

  // ═══ WEAPON PROPERTY TRAITS ═══
  backstabber:  3,
  deadly:       5,
  fatal:        6,
  'fatal-aim':  5,
  forceful:     3,
  sweep:        4,
  twin:         3,
  brutal:       4,
  disarm:       4,
  grapple:      4,
  shove:        3,
  trip:         4,
  nonlethal:    -2,   // Less threatening
  reach:        2,
  thrown:        2,
  volley:       1,
  scatter:      5,
  kickback:     2,
  concussive:   3,
  'ranged-trip': 3,
  tearing:      3,
  razing:       3,
  hampering:    3,
};

// ─── Action cost multipliers ──────────────────────────────────────

const ACTION_COST_MULT = {
  free:     0.5,
  reaction: 0.7,
  1:        1.0,
  2:        1.3,
  3:        1.6,
};

// ─── Category detection ───────────────────────────────────────────

/**
 * Detect the primary category of an item based on its traits and properties.
 * Uses a weighted scoring system across multiple signals.
 * Returns: 'offensive', 'defensive', 'healing', 'utility', 'control', 'summon'
 */
function detectCategory(item) {
  const traits = new Set(
    (item?.system?.traits?.value ?? []).map(t => String(t).toLowerCase())
  );
  const hasDamage = item?.system?.damage && Object.keys(item.system.damage).length > 0;
  const isAttack = traits.has('attack') || item?.system?.defense?.passive?.statistic === 'ac';

  // Scoring per category
  const scores = { offensive: 0, control: 0, healing: 0, defensive: 0, summon: 0, utility: 0 };

  // Offensive signals
  if (isAttack) scores.offensive += 10;
  if (hasDamage) scores.offensive += 8;
  for (const t of ['fire', 'electricity', 'acid', 'cold', 'sonic', 'force', 'vitality', 'void',
    'evocation', 'bomb', 'splash', 'fatal', 'deadly', 'backstabber', 'brutal',
    'rage', 'finisher', 'overflow', 'brandish', 'spellshot', 'certain-kill',
    'scatter', 'concussive', 'tearing', 'razing']) {
    if (traits.has(t)) scores.offensive += 3;
  }

  // Control signals
  for (const t of ['fear', 'incapacitation', 'mental', 'emotion', 'charm', 'sleep',
    'polymorph', 'possession', 'misfortune', 'curse', 'disease', 'poison',
    'darkness', 'enchantment', 'hex', 'trip', 'grapple', 'shove', 'disarm',
    'demoralize', 'radiation', 'hampering']) {
    if (traits.has(t)) scores.control += 3;
  }

  // Healing signals
  for (const t of ['healing', 'vitality']) {
    if (traits.has(t)) scores.healing += 8;
  }

  // Defensive signals
  for (const t of ['abjuration', 'aura', 'consecration', 'fortune', 'stance',
    'contingency', 'sanctified', 'holy', 'banner']) {
    if (traits.has(t)) scores.defensive += 3;
  }

  // Summon signals
  for (const t of ['summon', 'summoned', 'incarnate', 'minion', 'eidolon', 'conjuration']) {
    if (traits.has(t)) scores.summon += 4;
  }

  // Utility signals
  for (const t of ['exploration', 'downtime', 'detection', 'divination', 'scrying',
    'prediction', 'revelation', 'secret', 'subtle', 'illusion', 'social',
    'linguistic', 'tea']) {
    if (traits.has(t)) scores.utility += 2;
  }

  // Pick highest
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : 'utility';
}

// Category base multipliers
const CATEGORY_MULT = {
  offensive:  1.2,
  control:    1.1,
  summon:     1.0,
  healing:    1.0,
  defensive:  0.8,
  utility:    0.5,
};

// ─── Core calculation ─────────────────────────────────────────────

/**
 * Calculate a heuristic threat value for any PF2e item (spell, feat, action, effect).
 *
 * @param {Item} item - A Foundry PF2e Item document
 * @returns {{ value: number, mode: 'apply'|'reduce', breakdown: string[] }}
 */
export function calculateAutoThreat(item) {
  if (!item) return { value: 0, mode: 'apply', breakdown: ['No item'] };

  const breakdown = [];
  let base = 5; // Minimum base for doing *anything*
  breakdown.push(`Base: ${base}`);

  const traits = (item.system?.traits?.value ?? []).map(t => String(t).toLowerCase());
  const type = item.type; // spell, feat, action, effect, equipment, etc.

  // ── 1. Trait-based scoring ──
  let traitScore = 0;
  for (const trait of traits) {
    const weight = TRAIT_WEIGHTS[trait];
    if (weight != null) {
      traitScore += weight;
      if (weight >= 5) breakdown.push(`Trait "${trait}": +${weight}`);
    }
  }
  if (traitScore > 0) {
    base += traitScore;
    breakdown.push(`Trait total: +${traitScore}`);
  }

  // ── 2. Spell rank scaling ──
  if (type === 'spell') {
    const rank = item.system?.level?.value ?? item.rank ?? 0;
    const rankBonus = rank * 5;
    base += rankBonus;
    breakdown.push(`Spell rank ${rank}: +${rankBonus}`);
  }

  // ── 3. Damage presence ──
  const hasDamage = item.system?.damage && Object.keys(item.system.damage).length > 0;
  if (hasDamage) {
    base += 10;
    breakdown.push('Has damage: +10');
  }

  // ── 4. Area of effect ──
  if (item.system?.area) {
    const areaSize = item.system.area.value ?? 0;
    const areaBonus = Math.min(15, Math.floor(areaSize / 5));
    if (areaBonus > 0) {
      base += areaBonus;
      breakdown.push(`Area ${areaSize}ft: +${areaBonus}`);
    }
  }

  // ── 5. Duration (sustained or long-lasting = more threat) ──
  const duration = item.system?.duration;
  if (duration) {
    const durVal = String(duration.value ?? '').toLowerCase();
    if (durVal.includes('sustained')) {
      base += 5;
      breakdown.push('Sustained: +5');
    } else if (durVal.includes('minute') || durVal.includes('hour')) {
      base += 3;
      breakdown.push('Long duration: +3');
    }
  }

  // ── 6. Action cost ──
  const actions = item.system?.actions?.value ?? item.system?.time?.value;
  const actionType = item.system?.actionType?.value; // free, reaction
  let costKey = actionType ?? String(actions ?? 1);
  const costMult = ACTION_COST_MULT[costKey] ?? 1.0;
  base = Math.round(base * costMult);
  if (costMult !== 1.0) {
    breakdown.push(`Action cost (${costKey}): ×${costMult}`);
  }

  // ── 7. Category multiplier ──
  const category = detectCategory(item);
  const catMult = CATEGORY_MULT[category] ?? 1.0;
  base = Math.round(base * catMult);
  breakdown.push(`Category "${category}": ×${catMult}`);

  // ── 8. Determine mode ──
  // Some things reduce threat rather than apply it
  const isDefensive = category === 'defensive';
  const hasHide = traits.includes('stealth') || item.system?.slug?.includes('hide');
  const mode = (isDefensive || hasHide) ? 'reduce' : 'apply';
  if (mode === 'reduce') breakdown.push('Mode: reduce');

  // Clamp
  const value = Math.max(1, Math.min(200, Math.round(base)));

  return { value, mode, category, breakdown };
}

/**
 * Calculate auto-threat for a skill action by its slug and outcome.
 * Returns the threat value (not the full breakdown).
 */
export function calculateAutoSkillThreat(slug, {
  outcome = 'success',
  actorLevel = 1,
  customValue = null,
  customMode = null,
} = {}) {
  if (customValue != null && Number(customValue) > 0) {
    const val = Number(customValue);
    return customMode === 'reduce' ? -val : val;
  }

  // Base values by skill action type
  const SKILL_BASE = {
    // High threat (combat maneuvers)
    grapple: 15, trip: 15, shove: 12, disarm: 12, reposition: 12,
    'force-open': 10, escape: 8,
    // Medium threat (tactical)
    demoralize: 18, feint: 12, 'create-a-diversion': 10,
    'tumble-through': 8, balance: 5,
    // Support
    'administer-first-aid': 15, 'treat-wounds': 20,
    'treat-disease': 10, 'treat-poison': 12,
    'command-an-animal': 8,
    // Stealth
    hide: 6, sneak: 6, 'conceal-an-object': 3,
    // Thievery
    'disable-device': 8, 'pick-a-lock': 5,
    'palm-an-object': 3, steal: 5,
    // Other
    perform: 5, request: 4, repair: 3,
    climb: 3, swim: 3, 'high-jump': 3, 'long-jump': 3,
    'maneuver-in-flight': 5, squeeze: 2,
    'identify-magic': 2, 'recall-knowledge': 2,
    'sense-motive': 3, seek: 3,
  };

  const baseThreat = SKILL_BASE[slug] ?? 5;
  const levelFactor = 1 + actorLevel * 0.1;

  let threat;
  switch (outcome) {
    case 'criticalFailure': threat = Math.round(-baseThreat * 0.5 * levelFactor); break;
    case 'failure':         threat = 0; break;
    case 'success':         threat = Math.round(baseThreat * levelFactor); break;
    case 'criticalSuccess': threat = Math.round(baseThreat * 1.5 * levelFactor); break;
    default:                threat = Math.round(baseThreat * levelFactor); break;
  }

  return threat;
}

/**
 * Bulk-generate default threat values for items across compendiums.
 *
 * Performance strategy:
 * - Non-effects: use enriched index data (traits come from getIndex) — NO full doc load
 * - Effects: load full documents only when we need description for correlation
 * - Batch processing with event loop yields to keep UI responsive
 *
 * @param {Object} options
 * @param {boolean} options.overwriteExisting - If true, replace existing custom values
 * @param {Function} options.onProgress - Called with (current, total) during processing
 * @returns {Object} Map of uuid → { value, mode, origin }
 */
export async function generateEffectDefaults({ overwriteExisting = false, onProgress = null } = {}) {
  const currentData = game.settings.get(MODULE_ID, 'effectData') ?? {};
  const excludedRaw = (game.settings.get(MODULE_ID, 'effectExcludedPacks') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const itemPacks = game.packs.filter(p => {
    if (p.documentName !== 'Item') return false;
    const coll = String(p.collection || '').toLowerCase();
    const title = String(p.title || '').toLowerCase();
    return !excludedRaw.some(term => coll.includes(term) || title.includes(term));
  });

  const RELEVANT_TYPES = new Set([
    'effect', 'spell', 'feat', 'action', 'consumable', 'equipment', 'weapon', 'shield',
  ]);

  const result = overwriteExisting ? {} : { ...currentData };

  // ── Phase 1: Gather enriched indices ──
  // Request traits/level/damage/etc directly from the index to avoid full doc loads
  const INDEX_FIELDS = [
    'system.slug', 'system.traits.value', 'system.level.value',
    'system.damage', 'system.area', 'system.duration',
    'system.actions.value', 'system.actionType.value',
    'system.defense', 'type',
  ];

  let total = 0;
  const allEntries = [];   // { entry, pack, isEffect }
  const nameLookup = new Map(); // lowercase name → index entry (for effect correlation)

  for (const pack of itemPacks) {
    let index;
    try {
      index = await pack.getIndex({ fields: INDEX_FIELDS });
    } catch {
      // Some packs may not support enriched index — fall back to basic
      index = await pack.getIndex();
    }

    for (const entry of index) {
      if (!RELEVANT_TYPES.has(entry.type)) continue;

      total++;
      const isEffect = entry.type === 'effect';
      allEntries.push({ entry, pack, isEffect });

      // Build name lookup (non-effects only)
      if (!isEffect) {
        const key = String(entry.name ?? '').toLowerCase().trim();
        if (key && !nameLookup.has(key)) {
          nameLookup.set(key, { entry, pack });
        }
      }
    }
  }

  Logger.info(`Auto-defaults: ${total} items to process (${nameLookup.size} in name lookup)`);

  // ── Phase 2: Process all items ──
  let current = 0;
  const BATCH_SIZE = 200; // Yield to event loop every N items

  for (const { entry, pack, isEffect } of allEntries) {
    const uuid = entry.uuid || entry.id;
    current++;

    // Skip already-configured items (unless overwriting)
    if (!overwriteExisting && currentData[uuid]?.value) {
      if (onProgress && current % BATCH_SIZE === 0) onProgress(current, total);
      continue;
    }

    try {
      let threatResult;

      if (isEffect) {
        // Effects: try name-based correlation first (fast), only load doc if needed
        threatResult = resolveEffectThreatFast(entry, nameLookup);

        if (!threatResult) {
          // Load full document for description parsing (slower, but only for unresolved effects)
          try {
            const item = await pack.getDocument(entry._id);
            if (item) {
              threatResult = await calculateEffectThreat(item, nameLookup);
            }
          } catch { /* skip */ }
        }

        if (!threatResult) {
          threatResult = estimateFromName(entry.name);
        }
      } else {
        // Non-effects: calculate directly from index data (no doc load needed)
        // Build a fake item-like object from index fields
        threatResult = calculateAutoThreat(asItemLike(entry));
      }

      if (!threatResult || threatResult.value <= 0) continue;

      // Determine origin
      let origin = 'self';
      if (isEffect) {
        // Simple heuristic from name — full desc parsing only if we loaded the doc
        const n = String(entry.name ?? '').toLowerCase();
        if (n.includes('target') || n.includes('enemy') || n.includes('foe')) {
          origin = 'target';
        }
      }

      result[uuid] = {
        value: threatResult.value,
        mode: threatResult.mode,
        origin,
      };
    } catch {
      // Skip failed items
    }

    // Yield to event loop periodically
    if (current % BATCH_SIZE === 0) {
      if (onProgress) onProgress(current, total);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(total, total);
  Logger.info(`Auto-defaults complete: ${Object.keys(result).length} items configured`);
  return result;
}

/**
 * Create an item-like object from an enriched index entry
 * so that calculateAutoThreat can process it without a full document.
 */
function asItemLike(entry) {
  return {
    name: entry.name,
    type: entry.type,
    system: {
      traits: { value: entry.system?.traits?.value ?? [] },
      slug: entry.system?.slug ?? '',
      level: { value: entry.system?.level?.value ?? 0 },
      damage: entry.system?.damage ?? null,
      area: entry.system?.area ?? null,
      duration: entry.system?.duration ?? null,
      actions: { value: entry.system?.actions?.value ?? null },
      actionType: { value: entry.system?.actionType?.value ?? null },
      defense: entry.system?.defense ?? null,
    },
  };
}

/**
 * Fast effect correlation using name only (no document load).
 * Strips "Effect:", "Spell Effect:", etc. and looks up in nameLookup.
 */
function resolveEffectThreatFast(effectEntry, nameLookup) {
  const cleanName = String(effectEntry.name ?? '')
    .replace(/^(?:Effect|Spell Effect|Stance|Aura):\s*/i, '')
    .trim()
    .toLowerCase();

  if (!cleanName) return null;

  // Exact match
  const exact = nameLookup.get(cleanName);
  if (exact) {
    return calculateAutoThreat(asItemLike(exact.entry));
  }

  // Partial match (effect name contains or is contained by a source name)
  for (const [key, info] of nameLookup) {
    if (key.length > 3 && (key.includes(cleanName) || cleanName.includes(key))) {
      return calculateAutoThreat(asItemLike(info.entry));
    }
  }

  return null;
}

// ─── Effect-to-source correlation (full document version) ─────────

/**
 * Calculate threat for an effect by correlating it with its source item.
 * Called only when resolveEffectThreatFast couldn't resolve via name alone,
 * so this version has access to the full document for description parsing.
 *
 * Uses index data (asItemLike) for matched sources to avoid cascading doc loads.
 * Only loads remote docs via fromUuid for @UUID references.
 */
async function calculateEffectThreat(effectItem, nameLookup) {
  // Strategy 1: Parse @UUID references from description
  const desc = String(effectItem.system?.description?.value ?? '');
  const uuidMatches = desc.matchAll(/@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g);
  for (const match of uuidMatches) {
    const refUuid = match[1];
    try {
      const sourceItem = await fromUuid(refUuid);
      if (sourceItem && sourceItem.type !== 'effect') {
        const result = calculateAutoThreat(sourceItem);
        Logger.debug(`Effect "${effectItem.name}" → @UUID: "${sourceItem.name}" (${result.value})`);
        return result;
      }
    } catch { /* UUID might not resolve */ }
  }

  // Strategy 2: Parse "Granted by X" text patterns → use index data
  const grantPatterns = [
    /granted\s+by\s+(?:the\s+)?(?:@UUID\[[^\]]*\]\{)?([^}<.]+)/i,
    /from\s+(?:the\s+)?(?:@UUID\[[^\]]*\]\{)?([^}<.]+?)(?:\s+(?:spell|feat|action|ability))?/i,
    /created\s+by\s+(?:the\s+)?(?:@UUID\[[^\]]*\]\{)?([^}<.]+)/i,
    /applied\s+by\s+(?:the\s+)?(?:@UUID\[[^\]]*\]\{)?([^}<.]+)/i,
  ];

  for (const pattern of grantPatterns) {
    const m = desc.match(pattern);
    if (m?.[1]) {
      const sourceName = m[1].trim().toLowerCase();
      const found = nameLookup.get(sourceName);
      if (found) {
        const result = calculateAutoThreat(asItemLike(found.entry));
        Logger.debug(`Effect "${effectItem.name}" → text match: "${found.entry.name}" (${result.value})`);
        return result;
      }
    }
  }

  // Strategy 3: Fall back to own traits + name heuristic
  const result = calculateAutoThreat(effectItem);
  if (result.value <= 6) {
    const nameBoost = estimateFromName(effectItem.name);
    if (nameBoost.value > result.value) return nameBoost;
  }

  return result;
}

/**
 * Last-resort: estimate threat from the effect's name using keyword matching.
 */
function estimateFromName(name) {
  const n = String(name ?? '').toLowerCase();

  // Keyword → base value mapping
  const keywords = [
    // High threat names
    [/(?:rage|frenzy|bloodlust)/,         { value: 25, mode: 'apply' }],
    [/(?:smite|strike|blast|explosion)/,  { value: 20, mode: 'apply' }],
    [/(?:frighten|terrif|panic|dread)/,   { value: 18, mode: 'apply' }],
    [/(?:stun|paralyze|petrif|immobil)/,  { value: 20, mode: 'apply' }],
    [/(?:poison|venom|toxic)/,            { value: 15, mode: 'apply' }],
    [/(?:curse|hex|bane)/,                { value: 15, mode: 'apply' }],
    [/(?:flame|fire|burn|blaze|inferno)/, { value: 15, mode: 'apply' }],
    [/(?:lightning|thunder|storm|shock)/,  { value: 14, mode: 'apply' }],
    [/(?:cold|frost|freeze|ice)/,         { value: 12, mode: 'apply' }],

    // Medium threat
    [/(?:inspire|courag|hero|bless)/,     { value: 12, mode: 'apply' }],
    [/(?:haste|quicken|speed)/,           { value: 12, mode: 'apply' }],
    [/(?:enlarg|giant|grow)/,             { value: 10, mode: 'apply' }],
    [/(?:shield|protect|ward|barrier)/,   { value: 10, mode: 'apply' }],
    [/(?:heal|restor|regenerat|mend)/,    { value: 12, mode: 'apply' }],
    [/(?:summon|conjur|call)/,            { value: 12, mode: 'apply' }],
    [/(?:buff|empower|strengthen)/,       { value: 10, mode: 'apply' }],

    // Lower threat
    [/(?:stealth|hide|invis|conceal)/,    { value: 8, mode: 'reduce' }],
    [/(?:detect|reveal|see|sense)/,       { value: 5, mode: 'apply' }],
    [/(?:fly|levitat|float)/,             { value: 6, mode: 'apply' }],
    [/(?:resist|immun|absorb)/,           { value: 8, mode: 'apply' }],

    // Stance / form
    [/(?:stance|form|shape)/,             { value: 8, mode: 'apply' }],
  ];

  for (const [pattern, result] of keywords) {
    if (pattern.test(n)) return result;
  }

  return { value: 5, mode: 'apply' }; // True fallback
}
