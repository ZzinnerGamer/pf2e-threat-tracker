// ===========================
// 1. CONSTANTES Y DEPENDENCIAS
// ===========================
const MODULE = 'pf2e-threat-tracker';
const { ApplicationV2 } = foundry.applications.api;
const HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;

const ATTACK_SKILLS = new Set(["disarm", "escape", "force-open", "grapple", "reposition", "shove", "trip"]);
const hasSkillCheck = new Set(["seek,", "sense-motive", "balance", "maneuver-in-flight", "squeeze", "tumble-through", "identify-magic", "recall-knowledge", "climb", "disarm", "force-open", "grapple", "high-jump", "long-jump", "reposition", "shove", "swim", "trip", "create-a-diversion", "feint", "request", "demoralize", "administer-first-aid", "treat-poison", "command-an-animal", "perform", "hide", "sneak", "disable-device", "palm-an-object", "pick-a-lock", "steal"]);

    // ===========================
    // 2. CLASE DE CONFIGURACIÓN
    // ===========================
    export class ThreatTrackerConfig extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "threat-tracker-config",
            title: game.i18n.localize("pf2e-threat-tracker.config.title"),
            template: `modules/pf2e-threat-tracker/templates/threat-tracker-config.html`,
            width: 400,
            height: "auto",
            closeOnSubmit: true,
        });
    }}

// ===========================
// 3. HOOK INIT: CARGA JSON + REGISTRO DE SETTINGS
// ===========================
Hooks.once('init', async() => {
    console.log(`[${MODULE}] Inicializado`);

    const loadJSONSetting = async(path, settingKey, globalKey) => {
        let data = {};
        try {
            const response = await fetch(`modules/${MODULE}/config/${path}`);
        } catch (err) {
            console.warn(`[${MODULE}] No se pudo cargar ${path}`, err);
        }
        try {
            const settingData = game.settings.get(MODULE, settingKey);
            globalThis[globalKey] = settingData ? JSON.parse(settingData) : data;
        } catch {
            globalThis[globalKey] = data;
        }
    };

    await Promise.all([
            loadJSONSetting('trait-vulnerability.json', 'traitVulnerabilities', 'TRAIT_VULNERABILITY'),
            loadJSONSetting('action-threats.json', null, 'ACTION_THREAT'),
            loadJSONSetting('effects-threats.json', null, 'EFFECTS_THREAT'),
            loadJSONSetting('threat-immunity.json', null, 'THREAT_IMMUNITY')
        ]);

    game.settings.register(MODULE, 'xFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.xFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.xFactor.hint"),
        scope: 'client',
        config: true,
    default:
        10,
        type: Number
    });

    game.settings.register(MODULE, 'yFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.yFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.yFactor.hint"),
        scope: 'client',
        config: true,
    default:
        10,
        type: Number
    });

    game.settings.register(MODULE, 'decayEnabled', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.hint"),
        scope: 'world',
        config: true,
    default:
        true,
        type: Boolean
    });

    game.settings.register(MODULE, 'decayFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.Settings.decayFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.Settings.decayFactor.hint"),
        scope: 'world',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 1,
            step: 0.01
        },
    default:
        0.5,
        onChange: value => {
            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.decayFactor"));            
            location.reload();
        }
    })
    game.settings.register(MODULE, 'baseAttackThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.hint"),
        scope: 'world',
        config: true,
        type: Number,
    default:
        10
    });

    
    game.settings.register(MODULE, 'attackThreatMode', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.attackThreatMode.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.attackThreatMode.hint"),
        scope: 'world',
        config: true,
        type: Boolean,
    default:
        false
    });

    game.settings.register(MODULE, 'baseSpellThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseSpellThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseSpellThreat.hint"),
        scope: 'world',
        config: true,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'threatPerSpellRank', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.threatPerSpellRank.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.threatPerSpellRank.hint"),
        scope: 'world',
        config: true,
    default:
        10,
        type: Number
    });

    game.settings.register(MODULE, 'baseHealThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.hint"),
        scope: 'world',
        config: true,
    default:
        30,
        type: Number
    });

    game.settings.register(MODULE, 'skillBase', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.skillBase.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.skillBase.hint"),
        scope: 'world',
        config: true,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'skillCritBonus', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.skillCritBonus.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.skillCritBonus.hint"),
        scope: 'world',
        config: true,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'traitVulnerabilities', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.traitVulnerabilities.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.traitVulnerabilities.hint"),
        scope: 'world',
        config: true,
    default:
        JSON.stringify(globalThis.TRAIT_VULNERABILITY || {}),
        type: String,
        onChange: value => {
            try {
                globalThis.TRAIT_VULNERABILITY = JSON.parse(value);
                ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.traitVulnerabilities.updated"));
            } catch {
                ui.notifications.error(game.i18n.localize("pf2e-threat-tracker.notifications.traitVulnerabilities.invalid"));
            }
        }
    });

    game.settings.register(MODULE, 'enableThreatPanel', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.hint"),
        scope: 'client',
        config: true,
    default:
        true,
        type: Boolean,
        onChange: () => {
            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.enableThreatPanel.updated"));
            location.reload();
        }
    });

    game.settings.register(MODULE, 'enableTopThreatEffect', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.hint"),
        scope: "client",
        config: true,
    default:
        true,
        type: Boolean
    });

    game.settings.register(MODULE, 'topThreatEffect', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.hint"),
        scope: 'world',
        config: true,
    default:
        'jb2a.icon.skull.dark_red',
        type: String
    });

    globalThis.TRAIT_VULNERABILITY = JSON.parse(game.settings.get(MODULE, 'traitVulnerabilities') || '{}');

    console.log(`[${MODULE}] Settings registrados:`);
    [...game.settings.settings.entries()]
    .filter(([key]) => key.startsWith(`${MODULE}.`))
    .forEach(([key, setting]) => {
        console.log(`→ ${key}: type=${setting.type?.name}, default=${setting.default}, config=${setting.config}`);
    });


});

// ===========================
// 4. HELPER FUNCTIONS (CORE)
// ===========================

// APLICAR AMENAZA EN LA TABLITA
async function _applyThreat(enemy, srcId, srcName, amount) {
    if (!game.user.isGM) return;
    const raw = enemy.document.getFlag(MODULE, 'threatTable') ?? {};
    const current = Object.entries(raw).reduce((acc, [id, v]) => {
        acc[id] = typeof v === 'object' ? {
            ...v
        }
         : {
            name: canvas.tokens.get(id)?.name ?? '???',
            value: v
        };
        return acc;
    }, {});
    if (!current[srcId])
        current[srcId] = {
            name: srcName,
            value: 0
        };
    current[srcId].value += amount;
    await enemy.document.setFlag(MODULE, 'threatTable', current);
}

function getThreatModifierIDR(enemy, { traits = [], slug = "", damageType = "" } = {}) {
    if (!enemy?.actor) return 1;

    traits = traits.map(t => t.toLowerCase());
    damageType = damageType?.toLowerCase() || "";

    const immunities = enemy.actor.system.traits?.immunities?.map(i => i.type || i.label?.toLowerCase()) || [];
    const weaknesses = enemy.actor.system.traits?.weaknesses || [];
    const resistances = enemy.actor.system.traits?.resistances || [];

    // --- 1. Inmunidades absolutas ---
    for (const trait of traits) {
        if (immunities.includes(trait)) {
            console.log(`[${MODULE}] ${enemy.name} es inmune a '${trait}', amenaza anulada`);
            return 0;
        }
    }
    if (damageType && immunities.includes(damageType)) {
        console.log(`[${MODULE}] ${enemy.name} es inmune a daño de tipo '${damageType}', amenaza anulada`);
        return 0;
    }
    if (slug && immunities.includes(slug)) {
        console.log(`[${MODULE}] ${enemy.name} es inmune a acción '${slug}', amenaza anulada`);
        return 0;
    }

    let multiplier = 1;

    // --- 2. Debilidades ---
    for (const w of weaknesses) {
        if (w.type && (traits.includes(w.type) || w.type === damageType || w.type === slug)) {
            console.log(`[${MODULE}] ${enemy.name} tiene debilidad contra '${w.type}' (+${w.value} amenaza)`);
            multiplier += (w.value / 2);
        }
    }

    // --- 3. Resistencias ---
    for (const r of resistances) {
        if (r.type && (traits.includes(r.type) || r.type === damageType || r.type === slug)) {
            console.log(`[${MODULE}] ${enemy.name} tiene resistencia contra '${r.type}' (-${r.value} amenaza)`);
            multiplier -= (r.value * 2);
        }
    }

    return Math.max(multiplier, 0);
}


async function applyThreatToEnemies(responsibleToken, baseThreat, traits = []) {
    if (!game.user.isGM) return;
    for (const enemy of canvas.tokens.placeables) {
        if (!enemy.inCombat)
            continue;
        if (enemy.document.disposition === responsibleToken.document.disposition)
            continue;
        if (enemy.actor.hasPlayerOwner)
            continue;
        if (!Array.isArray(traits)) {
            traits = traits != null ? [traits] : [];
        }

        traits = traits.map(t => t.toLowerCase());

        const idrMult = getThreatModifierIDR(enemy, {
            traits: context.traits || [],
            slug: actionSlug,
            damageType: context.damageType || ""
        });
        const finalThreat = Math.round(threatGlobal * idrMult);


        if (finalThreat > 0) {
            console.log(`[${MODULE}] Aplicando ${finalThreat} amenaza a ${enemy.name} (mod=${modifier})`);
            await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
        } else {
            console.log(`[${MODULE}] ${enemy.name} es inmune a la amenaza (${traits.join(", ")})`);
        }
    }

    _updateFloatingPanel();
}

function getVulnerabilityMultiplier(enemy, traits) {
    const types = enemy?.actor?.system?.traits?.value ?? [];
    let multiplier = 1;

    for (const type of types) {
        const vulnData = globalThis.TRAIT_VULNERABILITY?.[type.toLowerCase()];
        if (!vulnData?.weakness)
            continue;

        for (const trait of traits) {
            const traitMult = vulnData.weakness[trait.toLowerCase()];
            if (traitMult && traitMult !== 1) {
                multiplier *= traitMult;
            }
        }
    }

    return multiplier;
}

function getEnemyTokens(responsibleToken, excludeIds = []) {
    return canvas.tokens.placeables.filter(t =>
        t.inCombat &&
        t.document.disposition !== responsibleToken.document.disposition &&
        !t.actor.hasPlayerOwner &&
        !excludeIds.includes(t.id));
}

function getUserTargets(context, msg, responsibleToken) {
    if (Array.isArray(context.targets) && context.targets.length > 0) {
        if (typeof context.targets[0] === "object" && context.targets[0].id) {
            return context.targets.map(t => t.id);
        }
        if (typeof context.targets[0] === "string") {
            return context.targets;
        }
    }

    if (msg?.target?.token) {
        return [msg.target.token];
    }

    if (game.user.targets && game.user.targets.size > 0) {
        return [...game.user.targets].map(t => t.id);
    }

    if (responsibleToken) {
        return [responsibleToken.id];
    }

    return [];
}

// INMUNIDAD DE TRAITS

function isImmuneToThreat(enemy, actionTraits) {
    if (!enemy?.actor)
        return false;
    const enemyTypes = enemy.actor.system.traits?.value ?? [];
    for (const type of enemyTypes) {
        const vulnData = globalThis.TRAIT_VULNERABILITY[type.toLowerCase()];
        if (!vulnData?.immunityTo)
            continue;
        if (vulnData.immunityTo.some(immuneTrait => actionTraits.includes(immuneTrait.toLowerCase()))) {
            return true;
        }
    }
    return false;
}

// OBTENER PUNTOS DE GOLPE Y ATACANTE RESPONSABLE

async function storePreHP(token, threat = null, responsibleToken = null, slug = null) {
    if (!game.user.isGM) return;

    const alreadyStored = await token.document.getFlag(MODULE, 'preHP');
    const hp = token.actor.system.attributes.hp?.value;

    console.log(`[${MODULE}] storePreHP called for ${token.name} | alreadyStored=${!!alreadyStored} | HP=${hp} | threat=${threat} | attacker=${responsibleToken?.name ?? "N/A"} | slug=${slug ?? "N/A"}`);

    if (alreadyStored) {
        await token.document.unsetFlag(MODULE, 'preHP');
        console.log(`[${MODULE}] preHP flag removed for ${token.name}`);
    }

    if (typeof hp === 'number') {
        const data = { hp };
        if (threat !== null) data.baseThreat = threat;
        if (responsibleToken) {
            data.attackerId = responsibleToken.id;
            data.attackerName = responsibleToken.name;
        }
        if (slug) data.slug = slug;

        await token.document.setFlag(MODULE, 'preHP', data);
        console.log(`[${MODULE}] preHP flag set for ${token.name}:`, data);
    }
}


// TOP DE AMENAZA
function getTopThreatTarget(enemyToken) {
    const threatTable = enemyToken.document.getFlag(MODULE, 'threatTable') || {};
    if (!Object.keys(threatTable).length)
        return null;

    const sorted = Object.entries(threatTable).sort((a, b) => b[1].value - a[1].value);
    const [topTokenId, value] = sorted[0];

    const topToken = canvas.tokens.get(topTokenId);
    if (!topToken)
        return null;

    return {
        token: topToken,
        amount: value
    };
}

// VELOCIDAD MÁXIMA DEL ENEMIGO
function getHighestSpeed(actor) {
    const speeds = actor.system.attributes.speed.otherSpeeds || [];
    const landSpeed = actor.system.attributes.speed.value || 0;
    const allSpeeds = [landSpeed, ...speeds.map(s => s.value)];
    return Math.max(...allSpeeds);
}

function getDistanceThreatMultiplier(tokenTarget, tokenSource) {
    const maxSpeed = getHighestSpeed(tokenTarget.actor);
    const adjustedSpeed = Math.max(0, maxSpeed - 5);
    const distance = canvas.grid.measureDistance(tokenSource, tokenTarget);

    if (distance <= 5)
        return 1.0;
    if (distance <= adjustedSpeed)
        return 0.9;
    if (distance <= adjustedSpeed * 2)
        return 0.8;
    if (distance <= adjustedSpeed * 3)
        return 0.7;
    return 0.5;
}

// UPDATE DE LA TABLITA
function _updateFloatingPanel() {
    if (!game.settings.get(MODULE, 'enableThreatPanel'))
        return;
    if (!game.user.isGM)
        return;
    const combat = game.combats.active;
    const id = 'threat-tracker-panel';
    let panel = document.getElementById(id);
    if (!combat) {
        panel?.remove();
        return;
    }

    const savedPos = {
        left: game.settings.get(MODULE, 'xFactor'),
        top: game.settings.get(MODULE, 'yFactor')
    };

    if (!panel) {
        panel = document.createElement('div');
        panel.id = id;
        Object.assign(panel.style, {
            position: 'absolute',
            top: savedPos.top + 'px',
            left: savedPos.left + 'px',
            zIndex: '100',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px',
            borderRadius: '6px',
            maxHeight: '80vh',
            overflow: 'auto',
            cursor: 'move',
            width: '200px',
            userSelect: 'none'
        });

        const header = document.createElement('div');
        header.style.cssText = 'font-weight: bold; margin-bottom: 8px; cursor: move;';
        header.textContent = 'Threat Tracker';
        panel.appendChild(header);

        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        header.addEventListener('mousedown', e => {
            isDragging = true;
            dragOffsetX = e.clientX - panel.offsetLeft;
            dragOffsetY = e.clientY - panel.offsetTop;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                game.settings.set(MODULE, 'xFactor', panel.offsetLeft);
                game.settings.set(MODULE, 'yFactor', panel.offsetTop);
            }
            isDragging = false;
            document.body.style.userSelect = '';
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging)
                return;
            let x = e.clientX - dragOffsetX;
            let y = e.clientY - dragOffsetY;
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;
            x = Math.min(Math.max(0, x), maxX);
            y = Math.min(Math.max(0, y), maxY);
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;
        });

        document.body.appendChild(panel);
    } else if (!panel.querySelector('div')) {
        const newHeader = document.createElement('div');
        newHeader.style.cssText = 'font-weight: bold; margin-bottom: 8px; cursor: move;';
        newHeader.textContent = 'Threat Tracker';
        panel.prepend(newHeader);
    }

    while (panel.childNodes.length > 1)
        panel.removeChild(panel.lastChild);

    for (const tok of canvas.tokens.placeables) {
        const table = tok.document.getFlag(MODULE, 'threatTable');
        if (!table || Object.keys(table).length === 0)
            continue;
        const sorted = Object.entries(table).sort((a, b) => b[1].value - a[1].value).slice(0, 3);
        const rows = sorted.map(([_, o]) => `<div>${o.name}: ${o.value}</div>`).join('');
        const block = document.createElement('div');
        block.style.marginBottom = '0.5em';
        block.innerHTML = `<strong>${tok.name}</strong><br>${rows}`;
        panel.appendChild(block);
    }

    const configBtn = document.createElement('button');
    configBtn.textContent = game.i18n.localize('pf2e-threat-tracker.ui.configureTraits');
    configBtn.addEventListener('click', () => new ThreatTrackerConfig().render(true));
    panel.appendChild(configBtn);
}

// ===========================
// 5. HOOK createChatMessage (FLUJO PRINCIPAL)
// ===========================
Hooks.on('createChatMessage', async(msg) => {
    if (!game.user.isGM) return;
    const context = msg.flags.pf2e?.context ?? {};
    const actor = msg.actor;
    if (!actor || !msg.author || !msg.flags?.pf2e)
        return;

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
    const isSkillAttack = context.type === 'skill-check' && ATTACK_SKILLS.has(actionSlug) && Array.isArray(context.traits) && context.traits?.includes("attack");
    const isDamageRoll = context.type === 'damage-roll' && !context.domains.includes("healing-received");
    const isDamageTaken = context.type === 'damage-taken' && !context.domains.includes("healing-received");
    const isDamage = isDamageRoll || isDamageTaken;

    const isSavingThrow = context.type === 'saving-throw';

    const isWeaponDamage = isDamage && context.sourceType === 'attack';
    const isSpellDamage = context.type === 'damage-taken' && context.domains.includes("action:cast-a-spell") || context.type === 'damage-received' && context.domains.includes("action:cast-a-spell");

    const isSpellCast = context.type === 'spell-cast' || context.type === 'cast-spell';
    const isHeal = Array.isArray(context.domains) && context.domains.includes('healing-received');

    const isSkillAction = context.type === "skill-check";

    const targets = getUserTargets(context, msg, responsibleToken);

    const knownTypes = [isAttack, isSkillAttack, isDamageRoll, isDamageTaken, isWeaponDamage, isSpellDamage, isSpellCast, isHeal, isSavingThrow, isSkillAction];

    const isKnown = knownTypes.some(Boolean);

    console.log(`[${MODULE}] sourceType: ${context.sourceType}`, {
        domains: context.domains
    });

    if (!isKnown && !hasSkillCheck) {
        console.log(`[${MODULE}] Tipo de mensaje desconocido. Guardando preHP por precaución.`);

        for (const token of canvas.tokens.placeables) {
            if (token.inCombat) {
                await storePreHP(token, null, responsibleToken, actionSlug);
            }
        }
    }

    //  ACCIONES SIN CONTEXT MODO DE DETECCIÓN DE OBJETO APLICADO!! AHORA AL MODO DE DAÑO -------------------------------------------------------------------------------------------------------------------------------

if (Object.keys(context).length === 0) {
    console.log(`[${MODULE}] Contexto vacío, buscando por slug previamente definido`);

    if (!actionSlug) {
        console.log(`[${MODULE}] No se pudo obtener un slug para este mensaje`);
        return;
    }

    for (const enemy of canvas.tokens.placeables.filter(t =>
        t.inCombat &&
        t.document.disposition !== responsibleToken.document.disposition &&
        !t.actor.hasPlayerOwner
    )) {
        await storePreHP(enemy, null, responsibleToken, actionSlug);
    }

    if (globalThis.ACTION_THREAT?.[actionSlug] !== undefined) {
        const itemBase = Number(await item.getFlag(MODULE, "threatItemValue")) || 0;
        const itemMode = await item.getFlag(MODULE, "threatItemMode") || "apply";
        const settingsBase = Number(game.settings.get(MODULE, "skillBase")) || 0;

        const base = itemBase > 0 ? itemBase : settingsBase;
        const bonus = globalThis.ACTION_THREAT[actionSlug];
        const taunterLevel = responsibleToken.actor?.system?.details?.level?.value ?? 1;
        const levelAdjustment = taunterLevel * 0.1 + 1;
        let threatGlobal = (base + bonus) * levelAdjustment;

        if (itemMode === "reduce") {
            threatGlobal = -threatGlobal;
            console.log(`[${MODULE}] Modo 'reduce' detectado, invirtiendo amenaza`);
        }

    for (const enemy of getEnemyTokens(responsibleToken)) {
    const traits = context.traits ?? item?.system?.traits?.value ?? [];
    const idrMult = getThreatModifierIDR(enemy, traits);
    if (idrMult <= 0) {
        console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
        continue;
    }

    const finalThreat = Math.round(threatGlobal * idrMult);

    let logBlock = `[${MODULE}] Amenaza por provocación:\n`;
    logBlock += ` ├─ Provocación por Habilidad ${base}.\n`;
    logBlock += ` ├─ Bonus por Slug ${bonus}.\n`;
    logBlock += ` ├─ Cálculo de amenaza: (${base}(Provocación Base) + ${bonus}(Cantidad por Slug)) × ${levelAdjustment}(Ajuste de nivel)\n`;
    logBlock += ` └─ Amenaza Final: ${finalThreat}\n`;
    console.log(logBlock);

    console.log(`[${MODULE}] Chat habilidad/dote detectado: slug='${actionSlug}' → base=${base}, bonus=${bonus}, total=${finalThreat}`);

    if (finalThreat >= 0) {
        console.log(`[${MODULE}] Burla a ${enemy.name}: +${finalThreat}`);
    } else {
        console.log(`[${MODULE}] Reducción de amenaza a ${enemy.name}: ${finalThreat}`);
    }
    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
}
_updateFloatingPanel();

}
}




    // GUARDADO DE PUNTOS DE GOLPE PREVIOS AL CASTEAR UN CONJURO

    if (isSavingThrow) {
        console.log(`[${MODULE}] Procesando Saving Throw`);
        const token = actor.getActiveTokens()[0];

        if (
            token.inCombat &&
            !token.actor.hasPlayerOwner) {
            const alreadyStored = await token.document.getFlag(MODULE, 'preHP');
            const hp = token.actor.system.attributes.hp?.value;
            if (alreadyStored) {
                await token.document.unsetFlag(MODULE, 'preHP');
                await storePreHP(token, null, responsibleToken, actionSlug);
                console.log(`[${MODULE}] ${token.name} preHP sobreescrito: ${hp}`);
            } else {
                if (typeof hp === 'number') {
                    await storePreHP(token, null, responsibleToken, actionSlug);
                    console.log(`[${MODULE}] HP previo guardado para ${token.name}: ${hp}`);
                }

                await storePreHP(token);
            }
        }
    }

if (isSpellCast) {
    for (const token of canvas.tokens.placeables) {
        if (token.inCombat) {
            const hp = token.actor.system.attributes.hp?.value;
            if (typeof hp === 'number') {
                await storePreHP(token, null, responsibleToken);
                console.log(`[${MODULE}] HP previo guardado para ${token.name}: ${hp}`);
            }
        }
    }

    const ignoredTraits = ['healing'];
    const hasIgnoredTrait = context?.options?.some(opt =>
        ignoredTraits.some(trait => opt === `${trait}`)
    );

    if (!hasIgnoredTrait) {
        const spellSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
        const spellRankRaw = context?.options?.find(opt => opt.startsWith("item:rank:"))?.split(":")[2];
        const spellRank = Number(spellRankRaw);

        if (!isNaN(spellRank)) {
            const base          = game.settings.get(MODULE, 'baseSpellThreat') || 0;
            const threatPerRank = game.settings.get(MODULE, 'threatPerSpellRank') || 3;
            const bonus         = globalThis.ACTION_THREAT[spellSlug] || 0;
            const fixedRank     = threatPerRank * 0.1;
            const threatGlobal  = (base + bonus) * fixedRank;

            for (const enemy of getEnemyTokens(responsibleToken)) {
                const traits = context.traits ?? item?.system?.traits?.value ?? [];
                const idrMult = getThreatModifierIDR(enemy, traits);
                if (idrMult <= 0) {
                    console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
                    continue;
                }

                const finalThreat = Math.round(threatGlobal * idrMult);
                console.log(`[${MODULE}] Conjuro lanzado (${base} + ${bonus}) x ${fixedRank} = ${finalThreat}`);
                console.log(`[${MODULE}] Amenaza global aplicada a ${enemy.name}: +${finalThreat}`);

                await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
            }

            _updateFloatingPanel();
        } else {
            console.log(`[${MODULE}] Conjuro lanzado pero no tiene rank numérico válido`);
        }
    } else {
        console.log(`[${MODULE}] Conjuro con trait 'healing', amenaza no aplicada (se manejará como curación)`);
    }
}


    // ATAQUES DE SKILLS
if (isSkillAttack) {
    const actionSlug =
        context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
        context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
        msg.flags?.[MODULE]?.slug ??
        (await msg.getFlag(MODULE, "slug")) ??
        undefined;

    if (!actionSlug || !ATTACK_SKILLS.has(actionSlug)) {
        console.log(`[${MODULE}] Acción de skill-attack no reconocida o no en ATTACK_SKILLS: ${actionSlug}`);
        return;
    }

    const outcome = context.outcome ?? "failure";
    const level = actor.system.details.level.value;
    const base = game.settings.get(MODULE, "baseAttackThreat") || 0;
    let threatGlobal;

    const primaryTarget = canvas.tokens.get(targets[0]);
    console.log(`[${MODULE}] Primary target: ${primaryTarget?.name}`);

    switch (outcome) {
        case "criticalFailure":
            threatGlobal = 0;
            break;
        case "failure":
            threatGlobal = Math.ceil(base * (level * 0.1));
            break;
        case "success":
            threatGlobal = Math.ceil((base + 10) * (level * 0.1));
            break;
        case "criticalSuccess":
            threatGlobal = Math.ceil((base + 20) * (level * 0.1));
            break;
        default:
            threatGlobal = base;
    }

    const customSkillAttackValue = Number(await responsibleToken.actor.getFlag(MODULE, `skillActionValue.${actionSlug}`)) || 0;
const customSkillAttackMode  = await responsibleToken.actor.getFlag(MODULE, `skillActionMode.${actionSlug}`) ?? "apply";

if (customSkillAttackValue > 0) {
    threatGlobal = customSkillAttackValue;
    if (customSkillAttackMode === "reduce") threatGlobal *= -1;
    console.log(`[${MODULE}] Usando amenaza personalizada del actor para skill-attack ${actionSlug}: ${customSkillAttackValue} (${customSkillAttackMode})`);
}

         for (const enemy of getEnemyTokens(responsibleToken)) {
            const damageType = item?.system?.damage?.damageType ?? null;
            const traits = context.traits ?? item?.system?.traits?.value ?? [];
        const idrMult = getThreatModifierIDR(enemy, traits, damageType);
        if (idrMult <= 0) {
            console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
            continue;
        }
        const finalThreat = Math.round(threatGlobal * idrMult);

    console.log(`[${MODULE}] Skill-Attack '${actionSlug}' (${outcome}) → threatGlobal = ${finalThreat}`);
    await applyThreatToEnemies(primaryTarget, responsibleToken.id, responsibleToken.name, finalThreat);

    _updateFloatingPanel();
}
}

    // ATAQUES SIRVEN LOS CONJUROS TAMBIÉN
if (isAttack) {
    const outcome = context.outcome ?? 'failure';

    let base = game.settings.get(MODULE, 'baseAttackThreat') || 0;
    if (origin instanceof Item && ['weapon', 'shield', 'spell'].includes(origin.type)) {
        const customValue = Number(await origin.getFlag(MODULE, "threatAttackValue")) || 0;
        if (customValue > 0) {
            base = customValue;
            console.log(`[${MODULE}] Usando amenaza de ataque personalizada del ítem: ${base}`);
        } else {
            console.log(`[${MODULE}] Amenaza de ataque del ítem no configurada, usando valor global: ${base}`);
        }
    } else {
        console.log(`[${MODULE}] No es ítem con ataque configurado, usando valor global: ${base}`);
    }

    let threatGlobal = base;
    switch (outcome) {
        case 'success': threatGlobal += 10; break;
        case 'criticalSuccess': threatGlobal += 20; break;
        case 'failure': default: break;
    }

    console.log(`[${MODULE}] Attack outcome: ${outcome}, base threat: ${base}, total base threat: ${threatGlobal}`);

    const targets = getUserTargets(context, msg, responsibleToken);
    console.log(`[${MODULE}] Targets array:`, targets);

    
    for (const target of targets) {
    const targetToken = canvas.tokens.get(target.id);
    if (targetToken) {
        await storePreHP(targetToken, null, responsibleToken, actionSlug);
        console.log(`[${MODULE}] preHP registrado para ${targetToken.name} antes del daño.`);
    }
}

    for (const enemy of getEnemyTokens(responsibleToken, targets)) {
        const damageType = item?.system?.damage?.damageType ?? null;
        const distMult = getDistanceThreatMultiplier(enemy, responsibleToken);
        const vulnMult = getThreatModifierIDR(enemy, damageType);
        const itemMode = await origin?.getFlag(MODULE, "threatItemMode") || "apply";

        let amount = Math.round(threatGlobal * distMult * vulnMult);
        if (itemMode === "reduce" || game.settings.get(MODULE, 'attackThreatMode') === true) {
            amount = -amount;
            console.log(`[${MODULE}] Modo 'reduce' detectado, invirtiendo amenaza`);
        }
        const traits = context.traits ?? item?.system?.traits?.value ?? [];
        const idrMult = getThreatModifierIDR(enemy, traits);        
        if (idrMult <= 0) {
            console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
            continue;
        }
        const finalThreat = Math.round(amount * idrMult);

        console.log(`[${MODULE}] ${enemy.name}: Distance mult ${distMult}, Vulnerability mult ${vulnMult}, final threat ${finalThreat}`);
        await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
    }

    _updateFloatingPanel();
}


    // CURACIÓN INDEPENDIENTEMENTE DE LA FUENTE ALQUÍMICA, MÁGICA O ACCIÓN
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
        baseHealThreat = game.settings.get(MODULE, 'baseHealThreat') || 0;
        console.log(`[${MODULE}] Amenaza Treat Wounds no configurada en el actor, usando valor global: ${baseHealThreat}`);
    }
    baseHeal = baseHealThreat;
    console.log(`[${MODULE}] Detectado Treat Wounds → Amenaza del actor: ${baseHeal}`);
    await responsibleToken?.document?.unsetFlag(MODULE, "lastHealAction");
} else {
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
            baseHealThreat = game.settings.get(MODULE, 'baseHealThreat') || 0;
            console.log(`[${MODULE}] Amenaza de curación del ítem no configurada, usando valor global: ${baseHealThreat}`);
        } else {
            console.log(`[${MODULE}] Amenaza de curación personalizada del ítem: ${baseHealThreat}`);
        }
    } else {
        baseHealThreat = game.settings.get(MODULE, 'baseHealThreat') || 0;
        console.log(`[${MODULE}] Amenaza de curación del ítem no configurada, usando valor global: ${baseHealThreat}`);
    }
    baseHeal = baseHealThreat;
}

    baseHeal = baseHealThreat > 0
        ? baseHealThreat
        : game.settings.get(MODULE, 'baseHealThreat') || 0;

    const targets = getUserTargets(context, msg, responsibleToken);

    let token = null;
    for (const tgtId of targets) {
        const tempToken = canvas.tokens.get(tgtId);
        if (!tempToken || tempToken.document.disposition !== responsibleToken.document.disposition) {
            if (tempToken) console.log(`[${MODULE}] Curación a enemigo ignorada: ${tempToken.name}`);
            continue;
        }
        token = tempToken;
        break;
    }

    if (!token) {
        console.log(`[${MODULE}] No hay token válido para curar`);
        return;
    }

    const preData = await token.document.getFlag(MODULE, 'preHP');
    let preHP = preData?.hp;
    const { hp } = token.actor.system.attributes;
    const maxHP = hp.max;
    const healedOpt = context.options?.find(o => o.startsWith('hp-remaining:'));
    const healAmt = Math.max(0, hp.value - preHP);
    const healPossible = Math.max(0, maxHP - preHP);
    const threatLocal = Math.ceil(baseHeal + healAmt);

    if (threatLocal > 0) {
        for (const enemy of canvas.tokens.placeables.filter(t =>
            t.inCombat &&
            t.document.disposition !== responsibleToken.document.disposition &&
            t.document.disposition !== 0 &&
            responsibleToken.document.disposition !== 0 &&
            !t.actor.hasPlayerOwner)) {
            const primary = targets.includes(enemy.id);
            let amount = primary ? threatLocal : threatLocal;
            if (amount <= 0) continue;

            let logBlock = `[${MODULE}] Amenaza por curación general:\n`;
            logBlock += ` ├─ Puntos de golpe previos del objetivo a curar ${healedOpt}\n`;
            logBlock += ` ├─ Puntos de golpe máximos ${maxHP}\n`;
            logBlock += ` ├─ Cantidad de curación posible ${healPossible}\n`;
            logBlock += ` ├─ Cálculo de curación: (${baseHeal}(Curación Base) + ${healAmt}(Cantidad Curada))\n`;
            logBlock += ` └─ Amenaza de Curación Final: +${amount}\n`;

            console.log(logBlock);
            await applyThreatToEnemies(enemy, responsibleToken.id, responsibleToken.name, amount);
        }
        _updateFloatingPanel();
    }
    return;
}

if (isSkillAction) {
    let slug =
        context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
        context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
        msg.flags?.[MODULE]?.slug ??
        (await msg.getFlag(MODULE, "slug")) ??
        undefined;

    if (!slug) {
        console.log(`[${MODULE}] No se pudo detectar un slug para acción de habilidad`);
        return;
    }

    if (ATTACK_SKILLS.has(slug)) {
    console.log(`[${MODULE}] Acción ${slug} es una habilidad de ataque, manejada como ataque`);
    return;
}
    console.log(`[${MODULE}] Slug detectado para acción de habilidad: ${slug}`);

    const actorLevel = Number(
        context.options?.find(opt => opt.startsWith("self:level:"))?.split(":")[2]
    ) || 1;

    const outcome = context.outcome ?? 'failure';
    let threatGlobal = 0;

    const customSkillValue = Number(await responsibleToken.actor.getFlag(MODULE, `skillActionValue.${slug}`)) || 0;
    const customSkillMode  = await responsibleToken.actor.getFlag(MODULE, `skillActionMode.${slug}`) ?? "apply";

    if (customSkillValue > 0) {
        threatGlobal = customSkillValue
        if (customSkillMode === "reduce") threatGlobal *= -1;
        console.log(`[${MODULE}] Usando amenaza personalizada del actor para ${slug}: ${customSkillValue} (${customSkillMode})`);
    } else {
        if (outcome === 'failure') return;

        const baseSkillThreat      = game.settings.get(MODULE, 'skillBase') || 0;
        const baseSkillCrit        = game.settings.get(MODULE, 'skillCritBonus') || 0;

        let outcomeThreat = baseSkillThreat;
        if (outcome === "failure") outcomeThreat === baseSkillThreat;
        if (outcome === "success") outcomeThreat += Math.ceil(baseSkillThreat * (1 + actorLevel * 0.1));
        if (outcome === "criticalSuccess") outcomeThreat += Math.ceil(baseSkillThreat + baseSkillCrit * (1 + actorLevel * 0.1));

        threatGlobal = outcomeThreat;
        console.log(`[${MODULE}] Usando configuración global para skillAction: ${threatGlobal}`);
    }

    for (const enemy of getEnemyTokens(responsibleToken)) {
    const idrMult = getThreatModifierIDR(enemy, traits);
    if (idrMult <= 0) {
        console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
        continue;
    }

    const finalThreat = Math.round(threatGlobal * idrMult);

    let logBlock = `[${MODULE}] Amenaza por acción de habilidad:\n`;
    logBlock += ` ├─ Acción: ${slug}\n`;
    logBlock += ` └─ Amenaza Final: ${finalThreat}\n`;
    console.log(logBlock);

    console.log(`[${MODULE}] Amenaza aplicada a ${enemy.name}: ${finalThreat >= 0 ? "+" : ""}${finalThreat}`);
    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
}

    _updateFloatingPanel();
}




    // GENERACIÓN DE AMENAZA POR DAÑO

if (isDamageTaken) {
    console.log(`[${MODULE}] Entering damage block`);

    const damagedTokens = canvas.tokens.placeables.filter(t => {
        const preHP = t.document.getFlag(MODULE, 'preHP')?.hp;
        return typeof preHP === 'number';
    });
    console.log(`[${MODULE}] Tokens con preHP registrado: ${damagedTokens.map(t => t.name).join(", ")}`);

    for (const token of damagedTokens) {
        console.log(`[${MODULE}] Procesando token: ${token.name}`);
        const preData = await token.document.getFlag(MODULE, 'preHP');
        console.log(`[${MODULE}] preData:`, preData);
        const { hp: preHP, attackerId } = preData || {};

        if (!attackerId) {
            console.warn(`[${MODULE}] ${token.name} no tiene attackerId, se omite`);
            continue;
        }

        const responsibleToken = canvas.tokens.get(attackerId);
        console.log(`[${MODULE}] Attacker encontrado: ${responsibleToken?.name ?? "NINGUNO"}`);
        if (!responsibleToken) continue;

        const currHP = token.actor.system.attributes.hp?.value ?? 0;
        const damage = Math.max(0, preHP - currHP);
        console.log(`[${MODULE}] HP actual: ${currHP}, Daño calculado: ${damage}`);
        if (damage === 0) continue;

        let threat = damage;
        let logBlock = `[${MODULE}] Amenaza para ${token.name}:\n`;
        logBlock += ` ├─ Daño infligido: ${damage} (de ${preHP} a ${currHP})\n`;

        if (context.options?.includes('action:strike') && !context.options.includes('origin:action:slug:cast-a-spell')) {
            const baseAttackThreat = game.settings.get(MODULE, 'baseAttackThreat') || 0;
            const outcome = context.options?.find(opt => opt.startsWith("check:outcome:"))?.split(":")[2] ?? "failure";
            const outcomeBonus = { failure: 0, success: 10, "critical-success": 20 }[outcome] ?? 0;
            threat += baseAttackThreat + outcomeBonus;
            logBlock += ` ├─ Bonus base por ataque: +${baseAttackThreat + outcomeBonus}\n`;
        }

        if (context.options?.includes('origin:action:slug:cast-a-spell')) {
            const baseSpellThreat = game.settings.get(MODULE, 'baseSpellThreat') || 0;
            threat += baseSpellThreat;
            logBlock += ` ├─ Bonus base por CONJURO: +${baseSpellThreat}\n`;
        }

        if (damage > preHP * 0.5) {
            const bonusExcess = Math.floor(damage - preHP * 0.5);
            threat += bonusExcess;
            logBlock += ` ├─ Bonus por exceso de daño: +${bonusExcess}\n`;
        } else {
            logBlock += ` ├─ Bonus por exceso de daño: +0\n`;
        }

        const actionSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
        if (actionSlug) {
            const ab = globalThis.ACTION_THREAT[actionSlug] || 0;
            if (ab) threat += ab;
            logBlock += ` ├─ Bonus por acción (${actionSlug}): +${ab}\n`;
        }

        const distMult = getDistanceThreatMultiplier(token, responsibleToken);
        console.log(`[${MODULE}] distMult = ${distMult}`);

        const traits = context.traits ?? item?.system?.traits?.value ?? [];
        console.log(`[${MODULE}] Traits detectados: ${JSON.stringify(traits)}`);

        const damageType = item?.system?.damage?.damageType ?? null;
        console.log(`[${MODULE}] Damage type detectado: ${damageType}`);

        const traitMult = getThreatModifierIDR(token, traits);
        console.log(`[${MODULE}] traitMult = ${traitMult}`);

        const dmgTypeMult = damageType ? getThreatModifierIDR(token, [damageType]) : 1;
        console.log(`[${MODULE}] dmgTypeMult = ${dmgTypeMult}`);

        if (traitMult <= 0 || dmgTypeMult <= 0) {
            console.log(`[${MODULE}] ${token.name} es inmune a ${[...traits, damageType].filter(Boolean).join(", ")}`);
            continue;
        }

        logBlock += ` ├─ Multiplicadores: ${threat} × ${distMult}(distancia) × ${traitMult}(traits)\n`;

        threat = Math.round(threat * distMult * traitMult * dmgTypeMult);
        logBlock += ` └─ Amenaza Final: +${threat}\n`;

        console.log(logBlock);

        await _applyThreat(token, responsibleToken.id, responsibleToken.name, threat);
        console.log(`[${MODULE}] Amenaza aplicada a ${token.name}`);

        await token.document.unsetFlag(MODULE, 'preHP');
        await token.document.unsetFlag(MODULE, 'attackThreat');
    }
    console.log(`[${MODULE}] Finalizando damage block, actualizando panel`);
    _updateFloatingPanel();
}


});

// ===========================
// 6. HOOKS SECUNDARIOS (createItem, controlToken...)
// ===========================

Hooks.on("preUpdateActor", async (actor, update, options, userId) => {
    const newHP = update?.system?.attributes?.hp?.value;
    if (typeof newHP !== "number") return;

    const currentHP = actor.system.attributes.hp.value;

    if (newHP > currentHP) {
        for (const token of actor.getActiveTokens()) {
            await token.document.setFlag(MODULE, "preHP", { hp: currentHP });
            console.log(`[${MODULE}] preHP guardado para ${token.name}: ${currentHP}`);
        }
    }
});

// HOOK PARA SEQUENCER
Hooks.on('controlToken', async(token, controlled) => {
    if (!game.user.isGM) return;
    console.log(`[${MODULE}] Token ${controlled ? "seleccionado" : "deseleccionado"}: ${token.name} (${token.id})`);
    if (!game.settings.get(MODULE, 'enableTopThreatEffect'))
        return;
    if (!controlled) {
        Sequencer.EffectManager.endEffects({
            name: `top-threat-${token.id}`
        });
        return;
    }

    if (token.actor.hasPlayerOwner)
        return;

    const threatTable = token.document.flags[MODULE]?.threatTable ?? {};
    console.log(`[${MODULE}] threatTable para ${token.name}:`, threatTable);
    const threatsInOrder = Object.entries(threatTable).toSorted((a, b) => b[1].value - a[1].value);
    console.log(`[${MODULE}] Threats ordenados:`, threatsInOrder);
    const topEntry = threatsInOrder?.[0];
    if (!topEntry) {
        console.log(`[${MODULE}] No hay entradas en threatTable, abortando.`);
        return;
    }

    const [topTokenId, threatData] = topEntry;
    const topThreatValue = threatData?.value;

    if (!topTokenId || !topThreatValue) {
        console.log(`[${MODULE}] No se pudo determinar el token o la cantidad de amenaza.`);
        return;
    }

    if (!topTokenId)
        return;

    const topToken = canvas.tokens.get(topTokenId);
    if (!topToken) {
        console.log(`[${MODULE}] No se encontró el token con ID ${topTokenId} en el canvas.`);
        return;
    }

    // Gracias Chasarooni te quiero mucho
    Sequencer.EffectManager.endEffects({
        name: `top-threat-${token.id}`
    });

    const effectPath = game.settings.get(MODULE, 'topThreatEffect');
    console.log(`[${MODULE}] Aplicando efecto '${effectPath}' a ${topToken.name} (${topToken.id}) con amenaza ${topThreatValue}`);

    new Sequence()
    .effect()
    .file(effectPath)
    .attachTo(topToken)
    .scaleToObject(0.4)
    .fadeIn(500)
    .fadeOut(250)
    .persist()
    .anchor({
        x: 0.5,
        y: 1.5
    })
    .name(`top-threat-${token.id}`)
    .forUsers([game.user.id])
    .play();
});

Hooks.on('canvasReady', _updateFloatingPanel);
Hooks.on('canvasPan', _updateFloatingPanel);
Hooks.on('updateToken', _updateFloatingPanel);
Hooks.on('deleteCombat', async() => {
    if (!game.user.isGM) return;
    for (const tok of canvas.tokens.placeables)
        await tok.document.unsetFlag(MODULE, 'threatTable');
    _updateFloatingPanel();
});
// NO FUNCIONA XD
Hooks.on('getTokenHUDButtons', (hud, buttons) => {
    if (!game.user.isGM)
        return;
    buttons.unshift({
        icon: 'fas fa-broom',
        label: 'Reset Amenaza',
        onClick: async() => {
            const tok = canvas.tokens.get(hud.object.id);
            if (!tok)
                return;
            await tok.document.unsetFlag(MODULE, 'threatTable');
            ui.notifications.info('Amenaza reseteada');
            _updateFloatingPanel();
        }
    });
});

// LIMPIAR FLAGS POR TURNO
Hooks.on('combatTurn', async() => {
    if (!game.user.isGM) return;
    for (const token of canvas.tokens.placeables.filter(t => t.inCombat)) {
        await token.document.unsetFlag(MODULE, 'preHP');
        console.log(`[${MODULE}] → unsetFlag preHP on ${token.name} (${token.id})`);
        await token.document.unsetFlag(MODULE, 'attackThreat');
        console.log(`[${MODULE}] → unsetFlag attackThreat on ${token.name} (${token.id})`);
        console.log(`[${MODULE}] Flags limpiados para ${token.name}`);
    }
    _updateFloatingPanel();
});

// REDUCIR AMENAZA POR TURNO
Hooks.on('combatRound', async() => {
    if (!game.settings.get(MODULE, 'decayEnabled'))
        return;

    const decayFactor = game.settings.get(MODULE, 'decayFactor');

    for (const tok of canvas.tokens.placeables) {
        const table = tok.document.getFlag(MODULE, 'threatTable');
        if (!table)
            continue;

        const values = Object.values(table).map(e => e.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        for (const id of Object.keys(table)) {
            const oldValue = table[id].value;
            const newValue = Math.floor(avg + (oldValue - avg) * decayFactor);
            console.log(
                `[${MODULE}] Reduciendo amenaza en ${tok.name} → ${table[id].name}:` + 
` ${oldValue} → ${newValue} (media ${Math.round(avg)})`);
            table[id].value = newValue;
        }

        await tok.document.setFlag(MODULE, 'threatTable', table);
    }

    _updateFloatingPanel();
});

Hooks.on("renderItemSheet", (app, html, data) => {
if (!game.user.isGM) return;

const allowedTypes = ["weapon", "spell", "shield", "feat", "consumable", "action"];
if (!allowedTypes.includes(app.item.type)) return;
if (
    app.item.type === "feat" &&
    app.item.system.actions?.value === null &&
    !["reaction", "free"].includes(app.item.system.actionType?.value)
) return;
if (app.item.type === "consumable" && app.item.system.category === "ammo") return;
if (!app.item.system.slug) return;

if (html.closest(".app").find(".window-header .threat-adjust").length) return;


    const threatBtn = $(
        `<a class="threat-adjust" title="${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.tooltip")}">
            <i style= "color: Tomato;" class="fa-sharp fa-solid fa-seal-exclamation"></i>
            ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.buttonText")}
        </a>`
    );

    threatBtn.on("click", () => openThreatDialog(app.item));

    html.closest(".app").find(".window-header .window-title").after(threatBtn);
});

async function openThreatDialog(item) {
    console.log(`[${MODULE}] === openThreatDialog iniciado ===`);
    console.log(`[${MODULE}] Item:`, item);

    const currentValue  = await item.getFlag(MODULE, "threatItemValue") ?? 0;
    const currentMode   = await item.getFlag(MODULE, "threatItemMode") ?? "apply";
    const currentSlug   = await item.getFlag(MODULE, "threatItemSlug");
    const currentType   = await item.getFlag(MODULE, "threatItemType");
    const currentAttack = await item.getFlag(MODULE, "threatAttackValue") ?? 0;
    const currentDamage = await item.getFlag(MODULE, "threatDamageValue") ?? 0;
    const currentRaise  = await item.getFlag(MODULE, "threatRaiseValue") ?? 0;
    const currentHeal   = await item.getFlag(MODULE, "threatHealValue") ?? 0;

    console.log(`[${MODULE}] Flags actuales:`, {
        currentValue, currentMode, currentSlug, currentType,
        currentAttack, currentDamage, currentRaise
    });

    const slug = item.slug ?? item.name.toLowerCase().replace(/\s+/g, "-");
    const type = item.type;
    const healingItem = item.system.traits.value.includes("healing");

    let extraFields = "";
    let showBaseValue = true;

    if (type === "weapon" || type === "shield") {
        showBaseValue = false;
        extraFields += `
            <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.attackValue")}:</label>
            <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">

            <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.damageValue")}:</label>
            <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
    }
    if (type === "shield") {
        extraFields += `
            <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.raiseValue")}:</label>
            <input type="number" name="threatRaiseValue" value="${currentRaise}" style="width:100%;">`;
    }
    
    if (type === "spell") {
        const hasDamage = !!item.system.damage && Object.keys(item.system.damage).length > 0;
        const isAttack  = item.system.defense?.passive?.statistic === "ac";

        if (isAttack) {
            showBaseValue = false;
            extraFields += `
                <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.attackValue")}:</label>
                <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">`;
        }
        if (hasDamage && !healingItem) {
            extraFields += `
                <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.damageValue")}:</label>
                <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
        }
    }

    if (healingItem) {
        showBaseValue = false;
        extraFields += `
            <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.healValue")}:</label>
            <input type="number" name="threatHealValue" value="${currentHeal}" style="width:100%;">`;
    }

    new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.title") },
        form: true,
        content: `
                <form>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.slug")}:</label>
                        <input type="text" name="slug" value="${slug}" style="width:100%;" readonly>
                        <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.type")}:</label>
                        <input type="text" name="type" value="${type}" style="width:100%;" readonly>

                        ${showBaseValue ? `
                        <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.value")}:</label>
                        <input type="number" name="threatValue" value="${currentValue}" style="width:100%;">` : ""}

                        ${extraFields}

                        <label>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.mode")}:</label>
                        <select name="mode">
                            <option value="apply" ${currentMode === "apply" ? "selected" : ""}>
                                ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeApply")}
                                </option>
                            <option value="reduce" ${currentMode === "reduce" ? "selected" : ""}>
                                ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeReduce")}
                            </option>
                        </select>

                    </div>
                </form>
                `,
        buttons: [
            { action: "save", label: game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.save"), default: true },
            { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.cancel") }
        ],
        submit: async function (result, dialog) {
            if (result !== "save") return;

            const formEl = dialog.element.querySelector("form");
            if (!formEl) {
                console.warn(`[${MODULE}] No se encontró el <form> en el diálogo`);
                return;
            }

            const fd = new foundry.applications.ux.FormDataExtended(formEl);
            const data = fd.object ?? {};

            console.log(`[${MODULE}] Datos procesados:`, data);

            const saveOrUnset = async (key, value) => {
            if (value && value !== 0) {
                await item.setFlag(MODULE, key, value);
            } else {
                await item.unsetFlag(MODULE, key);
            }
        };

            await saveOrUnset("threatItemValue",  parseInt(data.threatValue) || 0);
            await item.setFlag(MODULE, "threatItemMode",   data.mode);
            await item.setFlag(MODULE, "threatItemSlug",   data.slug);
            await item.setFlag(MODULE, "threatItemType",   data.type);

            if (data.threatAttackValue !== undefined) {
                await saveOrUnset("threatAttackValue", parseInt(data.threatAttackValue) || 0);
            }
            if (data.threatDamageValue !== undefined) {
                await saveOrUnset("threatDamageValue", parseInt(data.threatDamageValue) || 0);
            }
            if (data.threatRaiseValue !== undefined) {
                await saveOrUnset("threatRaiseValue", parseInt(data.threatRaiseValue) || 0);
            }
            if (data.threatHealValue !== undefined) {
                await saveOrUnset("threatHealValue", parseInt(data.threatHealValue) || 0);
            }

            console.log(`[${MODULE}] Flags después de guardar:`, {
                threatItemValue:  await item.getFlag(MODULE, "threatItemValue"),
                threatItemMode:   await item.getFlag(MODULE, "threatItemMode"),
                threatItemSlug:   await item.getFlag(MODULE, "threatItemSlug"),
                threatItemType:   await item.getFlag(MODULE, "threatItemType"),
                threatAttackValue: await item.getFlag(MODULE, "threatAttackValue"),
                threatDamageValue: await item.getFlag(MODULE, "threatDamageValue"),
                threatRaiseValue:  await item.getFlag(MODULE, "threatRaiseValue"),
                threatHealValue:   await item.getFlag(MODULE, "threatHealValue")
            });

            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.saved"));
        }
    }).render({ force: true });
}

Hooks.on("renderActorSheet", (app, html, data) => {
    if (!game.user.isGM) return;
    const actor = app.actor;
    if (actor.system.details.alliance !== "party") return;

    if (html.closest(".app").find(".party-threat-config").length) return;

    const threatBtn = $(`
        <a class="party-threat-config" title="Configurar Amenaza de Global">
            <i style= "color: Tomato;" class="fa-sharp fa-solid fa-seal-exclamation"></i>
            ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.buttonText")}
        </a>
    `);

    threatBtn.on("click", () => openActorThreatDialog(actor));

    html.closest(".app").find(".window-header .window-title").after(threatBtn);
});

async function openActorThreatDialog(actor) {
    const feats = actor.items.filter(i =>
        i.type === "feat" &&
        (
            i.system.actions?.value !== null ||
            ["reaction", "free"].includes(i.system.actionType?.value)
        )
    );

    const skillActionsData = {
        acrobatics: [
            { name: game.i18n.localize("PF2E.Actions.Balance.Title"), slug: "balance", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.TumbleThrough.Title"), slug: "tumble-through", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.ManeuverInFlight.Title"), slug: "maneuver-in-flight", minRank: 1 }
        ],
        athletics: [
            { name: game.i18n.localize("PF2E.Actions.Climb.Title"), slug: "climb", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.ForceOpen.Title"), slug: "force-open", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Grapple.Title"), slug: "grapple", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.HighJump.Title"), slug: "high-jump", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.LongJump.Title"), slug: "long-jump", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Reposition.Title"), slug: "reposition", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Shove.Title"), slug: "shove", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Swim.Title"), slug: "swim", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Trip.Title"), slug: "trip", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Disarm.Title"), slug: "disarm", minRank: 1 }
        ],
        crafting: [
            { name: game.i18n.localize("PF2E.Actions.Repair.Title"), slug: "repair", minRank: 0 }
        ],
        deception: [
            { name: game.i18n.localize("PF2E.Actions.CreateADiversion.Title"), slug: "create-a-diversion", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Feint.Title"), slug: "feint", minRank: 1 }
        ],
        diplomacy: [
            { name: game.i18n.localize("PF2E.Actions.Request.Title"), slug: "request", minRank: 0 }
        ],
        intimidation: [
            { name: game.i18n.localize("PF2E.Actions.Demoralize.Title"), slug: "demoralize", minRank: 0 }
        ],
        medicine: [
            { name: game.i18n.localize("PF2E.Actions.AdministerFirstAid.Title"), slug: "administer-first-aid", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.TreatDisease.Title"), slug: "treat-disease", minRank: 1 },
            { name: game.i18n.localize("PF2E.Actions.TreatWounds.Label"), slug: "treat-wounds", minRank: 1 }
        ],
        nature: [
            { name: game.i18n.localize("PF2E.Actions.CommandAnAnimal.Title"), slug: "command-an-animal", minRank: 0 }
        ],
        performance: [
            { name: game.i18n.localize("PF2E.Actions.Perform.Title"), slug: "perform", minRank: 0 }
        ],
        stealth: [
            { name: game.i18n.localize("PF2E.Actions.ConcealAnObject.Title"), slug: "conceal-an-object", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Hide.Title"), slug: "hide", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Sneak.Title"), slug: "sneak", minRank: 0 }
        ],
        thievery: [
            { name: game.i18n.localize("PF2E.Actions.PalmAnObject.Title"), slug: "disable-device", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.Steal.Title"), slug: "steal", minRank: 0 },
            { name: game.i18n.localize("PF2E.Actions.DisableDevice.Title"), slug: "disable-device", minRank: 1 },
            { name: game.i18n.localize("PF2E.Actions.PickALock.Title"), slug: "pick-a-lock", minRank: 1 }
        ]
    };

    const skillIcons = {
        acrobatics: "icons/skills/movement/feet-winged-boots-blue.webp",
        athletics: "icons/skills/melee/unarmed-punch-fist.webp",
        crafting: "icons/tools/smithing/hammer-sledge-steel-grey.webp",
        deception: "icons/skills/social/diplomacy-handshake-gray.webp",
        diplomacy: "icons/skills/social/diplomacy-handshake.webp",
        intimidation: "icons/skills/social/intimidation-impressing.webp",
        medicine: "icons/tools/hand/needle-grey.webp",
        nature: "icons/creatures/mammals/deer-movement-leap-green.webp",
        performance: "icons/tools/instruments/flute-simple-wood.webp",
        stealth: "icons/creatures/mammals/humanoid-cat-skulking-teal.webp",
        thievery: "icons/tools/hand/lockpicks-steel-grey.webp"
    };

    let content = `<form><div class="scrolltable" style="max-height:600px; min-width:500px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:8px;">`;

    const skillActions = [];

    // --- Skill Actions ---
    content += `<h2 style="text-align:center;">${game.i18n.localize("pf2e-threat-tracker.SkillActions")}</h2>`;
    for (const [skill, actions] of Object.entries(skillActionsData)) {
        const skillRank = actor.system.skills[skill]?.rank ?? 0;
        const filtered = actions.filter(a => skillRank >= a.minRank);
        if (!filtered.length) continue;

        content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
            ${game.i18n.localize("PF2E.Skill." + skill.charAt(0).toUpperCase() + skill.slice(1))}
        </h3>`;

        for (const act of filtered) {
            skillActions.push(act);
            const val = await actor.getFlag(MODULE, `skillActionValue.${act.slug}`) ?? 0;
            const mode = await actor.getFlag(MODULE, `skillActionMode.${act.slug}`) ?? "apply";

            content += `
                <div style="display:grid; grid-template-columns: 24px 1fr 60px 150px; align-items:center; gap:8px;">
                    <img src="${skillIcons[skill]}" style="width:24px; height:24px; border:0;" />
                    <span style="overflow:hidden; text-overflow:ellipsis;">${act.name}</span>
                    <input type="number" name="${act.slug}-value" value="${val}" style="width:60px;" />
                    <select name="${act.slug}-mode">
                        <option value="apply" ${mode === "apply" ? "selected" : ""}>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeApply")}</option>
                        <option value="reduce" ${mode === "reduce" ? "selected" : ""}>${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeReduce")}</option>
                    </select>
                </div>
            `;
        }
    }

    // --- Feats ---
    if (feats.length) {
    const featCategories = ["ancestry", "general", "class", "bonus", "skill", "calling", "classfeature", "curse", "deityboon", "pfsboon", "ancestryfeature"];

    content += `<h2 style="margin-top:12px; text-align:center;">${game.i18n.localize("pf2e-threat-tracker.Feats")}</h2>`;

    for (const category of featCategories) {
        const featsInCategory = feats.filter(f => f.system.category === category);
        if (!featsInCategory.length) continue;

        content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
            ${game.i18n.localize(`PF2E.Item.Feat.Category.${category.charAt(0).toUpperCase() + category.slice(1)}`) || category}
        </h3>`;

        for (const feat of featsInCategory) {
            const slug = feat.system.slug || feat.id;
            const val = await actor.getFlag(MODULE, `featValue.${slug}`) ?? 0;
            const mode = await actor.getFlag(MODULE, `featMode.${slug}`) ?? "apply";

            content += `
                <div style="display:grid; grid-template-columns: 1fr 60px 150px; align-items:center; gap:8px;">
                    <span style="overflow:hidden; text-overflow:ellipsis;">${feat.name}</span>
                    <input type="number" name="${slug}-value" value="${val}" style="width:60px;" />
                    <select name="${slug}-mode">
                        <option value="apply" ${mode === "apply" ? "selected" : ""}>
                            ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeApply")}
                        </option>
                        <option value="reduce" ${mode === "reduce" ? "selected" : ""}>
                            ${game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.modeReduce")}
                        </option>
                    </select>
                </div>
            `;
        }
    }
}


    content += `</div></form>`;

    new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("pf2e-threat-tracker.actorThreatConfig.title") },
        content,
        buttons: [
            { action: "save", label: game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.save"), default: true },
            { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.itemThreatConfig.cancel") }
        ],
        submit: async function (result, dialog) {
            if (result !== "save") return;
            const formEl = dialog.element.querySelector("form");
            const fd = new foundry.applications.ux.FormDataExtended(formEl);

            for (const act of skillActions) {
                const val = parseInt(fd.get(`${act.slug}-value`)) || 0;
                const mode = fd.get(`${act.slug}-mode`);
                if (val !== 0) {
                    await actor.setFlag(MODULE, `skillActionValue.${act.slug}`, val);
                    await actor.setFlag(MODULE, `skillActionMode.${act.slug}`, mode);
                } else {
                    await actor.unsetFlag(MODULE, `skillActionValue.${act.slug}`);
                    await actor.unsetFlag(MODULE, `skillActionMode.${act.slug}`);
                }
            }

            for (const feat of feats) {
                const slug = feat.system.slug || feat.id;
                const val = parseInt(fd.get(`${slug}-value`)) || 0;
                const mode = fd.get(`${slug}-mode`);
                if (val !== 0) {
                    await actor.setFlag(MODULE, `featValue.${slug}`, val);
                    await actor.setFlag(MODULE, `featMode.${slug}`, mode);
                } else {
                    await actor.unsetFlag(MODULE, `featValue.${slug}`);
                    await actor.unsetFlag(MODULE, `featMode.${slug}`);
                }
            }

            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.actorThreatConfig.saved"));
        }
    }).render({ force: true });
}


// ===========================
// 7. CIERRE Y LOG FINAL
// ===========================

console.log(`[${MODULE}] Cargado`);
