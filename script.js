// ===========================
// 1. CONSTANTES Y DEPENDENCIAS
// ===========================
const MODULE = 'pf2e-threat-tracker';
const { ApplicationV2 } = foundry.applications.api;
const HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;

const TAUNT_TRAITS = new Set(['auditory', 'concentrate', 'emotion', 'linguistic', 'mental']);
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
    }

    getData() {
        return {
            traits: globalThis.TRAIT_THREAT || {},
        };
    }

    async _updateObject(event, formData) {
        const traits = {};
        const traitNames = formData.trait;
        const traitValues = formData.value;

        if (Array.isArray(traitNames)) {
            for (let i = 0; i < traitNames.length; i++) {
                const name = traitNames[i];
                const value = Number(traitValues[i]);
                if (name)
                    traits[name] = value;
            }
        } else {
            traits[traitNames] = Number(traitValues);
        }

        const json = JSON.stringify(traits, null, 2);
        await game.settings.set(MODULE, "traitThreats", json);
        globalThis.TRAIT_THREAT = traits;
        ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.traitThreats.updated"));
    }
    activateListeners(html) {
        super.activateListeners(html);

        const traitList = html.find(".trait-entry");

        html.find("#trait-search").on("input", (event) => {
            const query = event.target.value.toLowerCase();
            traitList.each(function () {
                const trait = $(this).data("trait")?.toLowerCase();
                $(this).toggle(trait.includes(query));
            });
        });
    }

}

// ===========================
// 3. HOOK INIT: CARGA JSON + REGISTRO DE SETTINGS
// ===========================
Hooks.once('init', async() => {
    console.log(`[${MODULE}] Inicializado`);

    const loadJSONSetting = async(path, settingKey, globalKey) => {
        let data = {};
        try {
            const response = await fetch(`modules/${MODULE}/config/${path}`);
            if (response.ok) {
                data = await response.json();
                console.log(`[${MODULE}] Configuración de ${path} cargada:`, data);
            } else {
                console.warn(`[${MODULE}] No se pudo cargar ${path}: HTTP ${response.status}`);
            }
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
            loadJSONSetting('trait-threat.json', 'traitThreats', 'TRAIT_THREAT'),
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
            ui.notifications.error(game.i18n.localize("pf2e-threat-tracker.notifications.decayFactor"));
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

    game.settings.register(MODULE, 'tauntBase', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.tauntBase.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.tauntBase.hint"),
        scope: 'world',
        config: true,
    default:
        40,
        type: Number
    });

    game.settings.register(MODULE, 'tauntSuccessBonus', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.tauntSuccessBonus.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.tauntSuccessBonus.hint"),
        scope: 'world',
        config: true,
    default:
        40,
        type: Number
    });

    game.settings.register(MODULE, 'tauntCritBonus', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.tauntCritBonus.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.tauntCritBonus.hint"),
        scope: 'world',
        config: true,
    default:
        40,
        type: Number
    });

    game.settings.register(MODULE, 'traitThreats', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.traitThreats.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.traitThreats.hint"),
        scope: 'world',
        config: true,
    default:
        JSON.stringify(globalThis.TRAIT_THREAT || {}),
        type: String
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

    globalThis.TRAIT_THREAT = JSON.parse(game.settings.get(MODULE, 'traitThreats') || '{}');
    globalThis.TRAIT_VULNERABILITY = JSON.parse(game.settings.get(MODULE, 'traitVulnerabilities') || '{}');

    console.log(`[${MODULE}] Settings registrados:`);
    [...game.settings.settings.entries()]
    .filter(([key]) => key.startsWith(`${MODULE}.`))
    .forEach(([key, setting]) => {
        console.log(`→ ${key}: type=${setting.type?.name}, default=${setting.default}, config=${setting.config}`);
    });

    if (globalThis.TRAIT_THREAT && globalThis.TRAIT_THREAT.undefined === null) {
        globalThis.TRAIT_THREAT = {};
        await game.settings.set(MODULE, 'traitThreats', JSON.stringify({}));
    }

});

// ===========================
// 4. HELPER FUNCTIONS (CORE)
// ===========================

// APLICAR AMENAZA EN LA TABLITA
async function _applyThreat(enemy, srcId, srcName, amount) {
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

function getThreatModifierByTraits(enemy, traits = []) {
    traits = Array.isArray(traits) ? traits : [traits ?? ""];
    const immunities = enemy.actor.system.attributes.immunities ?? [];
    const resistances = enemy.actor.system.attributes.resistances ?? [];
    const vulnerabilities = enemy.actor.system.attributes.vulnerabilities ?? [];

    console.log(`[${MODULE}] → Revisando traits para ${enemy.name}:`, traits);
    console.log(`[${MODULE}] → Inmunidades:`, immunities);
    console.log(`[${MODULE}] → Resistencias:`, resistances);
    console.log(`[${MODULE}] → Vulnerabilidades:`, vulnerabilities);

    let modifier = 1;

    for (const trait of traits.map(t => t.toLowerCase())) {
        for (const immunity of immunities) {
            if (immunity.type === trait) {
                const excepts = immunity.exceptions?.map(e => e.toLowerCase()) ?? [];
                if (!excepts.includes(trait)) {
                    return 0;
                }
            }
        }

        for (const vuln of vulnerabilities) {
            if (vuln.type === trait && typeof vuln.value === "number") {
                modifier *= vuln.value;
            }
        }

        for (const resist of resistances) {
            if (resist.type === trait && typeof resist.value === "number") {
                modifier *= (1 / resist.value);
            }
        }
    }

    return modifier;
}

async function applyThreatToEnemies(responsibleToken, baseThreat, traits = []) {
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

        const modifier = getThreatModifierByTraits(enemy, traits);
        const finalThreat = Math.floor(baseThreat * modifier);

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
                multiplier *= traitMult; // acumulativo si hay varios
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
    const alreadyStored = await token.document.getFlag(MODULE, 'preHP');
    if (alreadyStored) {
        console.log(`[${MODULE}] ${token.name} ya tenía preHP guardado → no se sobrescribe`);
        return;
    }
    const hp = token.actor.system.attributes.hp?.value;
    if (typeof hp === 'number') {
        const data = {
            hp
        };
        if (threat !== null)
            data.baseThreat = threat;
        if (responsibleToken) {
            data.attackerId = responsibleToken.id;
            data.attackerName = responsibleToken.name;
        }
        if (slug)
            data.slug = slug;
        await token.document.setFlag(MODULE, 'preHP', data);
        console.log(`[${MODULE}] HP previo guardado para ${token.name}: ${hp}, threat=${threat}, attacker=${responsibleToken?.name}`);
    }
}

// TOP DE AMENAZA
function getTopThreatTarget(enemyToken) {
    const threatTable = enemyToken.document.getFlag(MODULE, 'threatTable') || {};
    if (!Object.keys(threatTable).length)
        return null;

    // Obtener el ID con más amenaza solo en ESTE enemigo
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
    console.log(`[${MODULE}] createChatMessage hook ejecutado`);
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

    console.log(`[${MODULE}] Token responsable: ${responsibleToken.name}`);
    console.log(`[${MODULE}] Contexto:`, context);

    const traits = Array.isArray(context.traits)
         ? context.traits.map(t => t.toLowerCase())
         : Array.isArray(msg.flags.pf2e?.traits)
         ? msg.flags.pf2e.traits.map(t => t.toLowerCase())
         : origin?.system?.traits?.value?.map(t => t.toLowerCase()) ?? [];

    const actionOpt = context.options?.find(o => typeof o === "string" && o.startsWith("item:slug:"));
    const actionSlug = actionOpt?.split("item:slug:")[1] || context.options?.find(o => typeof o === hasSkillCheck);
    console.log(`[${MODULE}] Detected actionSlug: ${actionSlug}`);

    const isAttack = context.type === 'attack-roll';
    const isSkillAttack = context.type === 'skill-check' && ATTACK_SKILLS.has(actionSlug) && Array.isArray(context.traits) && context.traits?.includes("attack");
    const isDamageRoll = context.type === 'damage-roll' && !context.domains.includes("healing-received");
    const isDamageTaken = context.type === 'damage-taken' && !context.domains.includes("healing-received");
    const isDamage = isDamageRoll || isDamageTaken;

    const isSavingThrow = context.type === 'saving-throw';

    const isWeaponDamage = isDamage && context.sourceType === 'attack';
    const isSpellDamage = context.type === 'damage-taken' && context.domains.includes("action:cast-a-spell") || context.type === 'damage-received' && context.domains.includes("action:cast-a-spell") || (actionSlug && globalThis.ACTION_THREAT?.[actionSlug] !== undefined);

    const isSpellCast = context.type === 'spell-cast' || context.type === 'cast-spell';
    const isHeal = Array.isArray(context.domains) && context.domains.includes('healing-received');

    const isTaunt = context.type === "skill-check" && traits?.some(t => TAUNT_TRAITS.has(t));

    const targets = getUserTargets(context, msg, responsibleToken);

    const knownTypes = [isAttack, isSkillAttack, isDamageRoll, isDamageTaken, isWeaponDamage, isSpellDamage, isSpellCast, isHeal, isSavingThrow, isTaunt];

    const isKnown = knownTypes.some(Boolean);

    // Logs
    console.log(`[${MODULE}] sourceType: ${context.sourceType}`, {
        domains: context.domains
    });
    console.log(`[${MODULE}] Has Slug: ${actionSlug}`);
    console.log(`[${MODULE}] Is Skill Attack: ${isSkillAttack}`);
    console.log(`[${MODULE}] Is Attack: ${isAttack}`);
    console.log(`[${MODULE}] Is Damage Roll: ${isDamageRoll}`);
    console.log(`[${MODULE}] Is Damage Taken: ${isDamageTaken}`);
    console.log(`[${MODULE}] Is Damage: ${isDamage}`);
    console.log(`[${MODULE}] Is Weapon Damage: ${isWeaponDamage}`);
    console.log(`[${MODULE}] Is Spell Damage: ${isSpellDamage}`);
    console.log(`[${MODULE}] Is Spell Cast: ${isSpellCast}`);
    console.log(`[${MODULE}] Is Healing: ${isHeal}`);
    console.log(`[${MODULE}] Is Saving Throw: ${isSavingThrow}`);
    console.log(`[${MODULE}] Is Taunt: ${isTaunt}`);
    console.log(`[${MODULE}] Targets: ${targets}`);

    let threatGlobal = 0;

    if (!isKnown && !hasSkillCheck) {
        console.log(`[${MODULE}] Tipo de mensaje desconocido. Guardando preHP por precaución.`);

        for (const token of canvas.tokens.placeables) {
            if (token.inCombat) {
                await storePreHP(token, null, responsibleToken, actionSlug);
            }
        }
    }

    // ACCIONES SIN CONTEXT

    if (Object.keys(context).length === 0 && !hasSkillCheck) {
        console.log(`[${MODULE}] Contexto vacío, buscando taunt por título`);

        const tauntActionSlug =
            msg.flags?.pf2e?.itemSlug ??
            msg.flags?.core?.slug ??
            (() => {
                const rawContent = msg.content ?? "";
                console.log(`[${MODULE}] msg.content:`, rawContent);

                let title;
                const h3Match = rawContent.match(/<h3>(.*?)<\/h3>/i);
                if (h3Match) {
                    const rawTitle = h3Match[1].replace(/<.*?>/g, "").trim();
                    title = rawTitle;
                    console.log(`[${MODULE}] Título extraído de <h3>: "${title}"`);
                } else {
                    const strongMatch = rawContent.match(/<strong>(.*?)<\/strong>/i);
                    if (strongMatch) {
                        title = strongMatch[1].trim();
                        console.log(`[${MODULE}] Título extraído de <strong>: "${title}"`);
                    } else {
                        console.log(`[${MODULE}] No se encontró <strong>...</strong> ni <h3>...</h3>`);
                        return undefined;
                    }
                }

                console.log(`[${MODULE}] Título extraído: "${title}"`);

                const slugified = title
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^\w\s]/g, "")
                    .replace(/\s+/g, "-");

                const cleanedSlug = slugified.replace(/-\w+$/, "");

                console.log(`[${MODULE}] Slug generado: "${cleanedSlug}"`);
                return cleanedSlug;
            })();

        if (tauntActionSlug) {
            console.log(`[${MODULE}] Slug final obtenido: ${tauntActionSlug}`);
        } else {
            console.log(`[${MODULE}] No se pudo obtener un slug para este mensaje`);
        }

        for (const enemy of canvas.tokens.placeables.filter(t =>
                t.inCombat &&
                t.document.disposition !== responsibleToken.document.disposition &&
                !t.actor.hasPlayerOwner)) {
            await storePreHP(enemy, null, responsibleToken, tauntActionSlug);
        }

        if (tauntActionSlug && globalThis.ACTION_THREAT?.[tauntActionSlug] !== undefined) {
            const base = game.settings.get(MODULE, "tauntBase") || 0;
            const bonus = globalThis.ACTION_THREAT[tauntActionSlug];
            const taunterLevel = responsibleToken.actor?.system?.details?.level?.value ?? 1;
            const levelAdjustment = taunterLevel * 0.1 + 1;
            const threatGlobal = (base + bonus) * levelAdjustment;

            let logBlock = `[${MODULE}] Amenaza por provocación:\n`;
            logBlock += ` ├─ Provocación por Taunt ${base}.\n`;
            logBlock += ` ├─ Bonus por Slug ${bonus}.\n`;
            logBlock += ` ├─ Cálculo de amenaza: (${base}(Provocación Base) + ${bonus}(Cantidad por Slug)) × ${levelAdjustment}(Ajuste de nivel)\n`;
            logBlock += ` └─ Amenaza Final: ${threatGlobal}\n`;
            console.log(logBlock);

            console.log(`[${MODULE}] Chat Taunt detectado: slug='${tauntActionSlug}' → base=${base}, bonus=${bonus}, total=${threatGlobal}`);

            for (const enemy of getEnemyTokens(responsibleToken)) {

                console.log(`[${MODULE}] Burla a ${enemy.name}: +${threatGlobal}`);
                await applyThreatToEnemies(enemy, responsibleToken.id, responsibleToken.name, threatGlobal);
            }
            _updateFloatingPanel();
            return;
        } else {
            console.log(`[${MODULE}] Slug '${tauntActionSlug}' no está definido en ACTION_THREAT Guardando`);
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
                console.log(`[${MODULE}] ${token.name} ya tenía preHP guardado → no se sobrescribe`);
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
                ignoredTraits.some(trait => opt === `${trait}`));

        if (!hasIgnoredTrait) {
            const spellSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
            const spellRankRaw = context?.options?.find(opt => opt.startsWith("item:rank:"))?.split(":")[2];
            const spellRank = Number(spellRankRaw);

            if (!isNaN(spellRank)) {
                const base = game.settings.get(MODULE, 'baseSpellThreat') || 0;
                const threatPerRank = game.settings.get(MODULE, 'threatPerSpellRank') || 3;
                const bonus = globalThis.ACTION_THREAT[spellSlug] || 0;
                const fixedRank = threatPerRank * 0.1
                    const threatGlobal = (base + bonus) * fixedRank;

                console.log(`[${MODULE}] Conjuro lanzado (${base} + ${bonus}) x ${fixedRank} = ${threatGlobal}`);

                for (const enemy of getEnemyTokens(responsibleToken)) {
                    console.log(`[${MODULE}] Amenaza global aplicada a ${enemy.name}: +${threatGlobal}`);
                    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, threatGlobal);
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
        const outcome = context.outcome ?? "failure";
        const level = actor.system.details.level.value;
        const base = game.settings.get(MODULE, "baseAttackThreat");
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
        console.log(`[${MODULE}] Skill-Attack '${actionSlug}' (${outcome}) → threatGlobal = ${threatGlobal}`);
        await applyThreatToEnemies(primaryTarget, responsibleToken.id, responsibleToken.name, threatGlobal);

        _updateFloatingPanel();
    }

    // ATAQUES SIRVEN LOS CONJUROS TAMBIÉN
    if (isAttack) {
        const outcome = context.outcome ?? 'failure';
        const level = actor.system.details.level.value;
        const base = game.settings.get(MODULE, 'baseAttackThreat');
        console.log(`[${MODULE}] Attack outcome: ${outcome}, actor level: ${level}, base threat: ${base}`);

        let threatGlobal = 0;
        switch (outcome) {
        case 'failure':
            threatGlobal = Math.ceil(base * (level * 0.1));
            break;
        case 'success':
            threatGlobal = Math.ceil((base + 10) * (level * 0.1));
            break;
        case 'criticalSuccess':
            threatGlobal = Math.ceil((base + 20) * (level * 0.1));
            break;
        }
        console.log(`[${MODULE}] Calculated global threat: ${threatGlobal}`);

        // Primary target
        const targets = getUserTargets(context, msg, responsibleToken);
        console.log(`[${MODULE}] Targets array:`, targets);
        let primaryTarget = undefined;
        if (targets.length > 0) {
            if (typeof targets[0] === "string") {
                primaryTarget = canvas.tokens.get(targets[0]);
            } else if (typeof targets[0] === "object" && targets[0].id) {
                primaryTarget = canvas.tokens.placeables.find(t => t.document.id === targets[0].id);
            }
        }
        console.log(`[${MODULE}] Primary target: ${primaryTarget?.name}`);
        const primaryTargetId = primaryTarget?.id;

        if (primaryTarget) {
            await storePreHP(primaryTarget, 0, responsibleToken);
        }

        // Secondary enemies
        for (const enemy of getEnemyTokens(responsibleToken, [primaryTargetId])) {
            console.log(`[${MODULE}] Secondary target: ${enemy.name}`);
            await storePreHP(enemy, 0, responsibleToken);
            const distMult = getDistanceThreatMultiplier(enemy, responsibleToken);
            const vulnMult = getThreatModifierByTraits(enemy, traits);
            let amount = Math.round(threatGlobal * distMult * vulnMult);
            console.log(`[${MODULE}] Distance mult: ${distMult}, Vulnerability mult: ${vulnMult}, raw threat: ${amount}`);

            if (vulnMult > 0 && amount > 0) {
                console.log(`[${MODULE}] Applying ${amount} threat to ${enemy.name}`);
                await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
            } else {
                console.log(`[${MODULE}] ${enemy.name} is immune to threat`);
            }
        }
        if (outcome === 'failure' && primaryTarget) {
            console.log(`[${MODULE}] Attack failed: applying base threat (${base}) to primary target ${primaryTarget.name}`);
            await _applyThreat(primaryTarget, responsibleToken.id, responsibleToken.name, base);
        }
        _updateFloatingPanel();
    }

    // CURACIÓN INDEPENDIENTEMENTE DE LA FUENTE ALQUÍMICA, MÁGICA O ACCIÓN
    if (isHeal) {
        const baseHeal = game.settings.get(MODULE, 'baseHealThreat');
        const targets = getUserTargets(context, msg, responsibleToken);
        const traits = context.options?.filter(opt => opt.startsWith("item:trait:"))
            ?.map(opt => opt.split(":")[2]) ?? [];

        for (const tgtId of targets) {
            const token = canvas.tokens.get(tgtId);
            if (!token || token.document.disposition !== responsibleToken.document.disposition) {
                if (token)
                    console.log(`[${MODULE}] Curación a enemigo ignorada: ${token.name}`);
                continue;
            }

            const preData = await token.document.getFlag(MODULE, 'preHP');
            const preHP = preData?.hp;
            if (typeof preHP !== 'number') {
                console.log(`[${MODULE}] No se pudo obtener preHP para ${token.name}, ignorando`);
                continue;
            }
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
                    if (amount <= 0)
                        continue;

                    let logBlock = `[${MODULE}] Amenaza por curación general:\n`;
                    logBlock += ` ├─ Puntos de golpe previos del objetivo a curar ${healedOpt}\n`;
                    logBlock += ` ├─ Puntos de golpe máximos ${maxHP}\n`;
                    logBlock += ` ├─ Cantidad de curación posible ${healPossible}\n`; ;
                    logBlock += ` ├─ Cálculo de curación: (${baseHeal}(Curación Base) + ${healAmt}(Cantidad Curada))\n`;
                    logBlock += ` └─ Amenaza de Curación Final: +${amount}\n`;

                    console.log(logBlock);
                    /*
                    console.log(`[${MODULE}] (Curación) ${primary ? '' : 'Amenaza de Curación'} ${enemy.name}: +${amount}`);*/
                    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
                }
                _updateFloatingPanel();
            }
            return;
        }
    }

    // ACCIONES ACTION-THREATS.JSON
    if (isTaunt) {
        let threatGlobal = 0;

        let slug =
            context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
            context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
            msg.flags?.[MODULE]?.slug ??
            (await msg.getFlag(MODULE, "slug")) ??
            undefined;

        if (slug) {
            console.log(`[${MODULE}] Slug detectado para burla: ${slug}`);
        } else {
            console.log(`[${MODULE}] No se pudo detectar un slug para la burla`);
        }

        const traits = context.traits ?? [];
        console.log(`[${MODULE}] Traits del contexto:`, traits);
        console.log(`[${MODULE}] TRAIT_THREAT disponible:`, globalThis.TRAIT_THREAT);

        const matchingTraits = traits.filter(t => t in globalThis.TRAIT_THREAT);
        console.log(`[${MODULE}] Traits con amenaza detectada:`, matchingTraits);
        const baseTraitThreat = matchingTraits.reduce((sum, tr) => sum + globalThis.TRAIT_THREAT[tr], 0);

        const taunterLevel = context.options?.find(opt => opt.startsWith("self:level:"))?.split(":")[2] || 1;

        let logBlock = `[${MODULE}] Amenaza por provocación:\n`;
        logBlock += ` ├─ Acción: ${slug}\n`;
        logBlock += ` ├─ Lista de Traits: ${matchingTraits.join(', ')}\n`;
        logBlock += ` ├─ Bonificador por Traits: ${baseTraitThreat}\n`;

        const outcome = context.outcome ?? 'failure';

        let threat = 0;

        if (outcome !== 'failure') {
            const baseTaunt = game.settings.get(MODULE, 'tauntBase') || 0;
            const baseTauntSuccess = game.settings.get(MODULE, 'tauntSuccessBonus') || 0;
            const baseTauntCrit = game.settings.get(MODULE, 'tauntCritBonus') || 0;
            let outcomeThreat = 0;
            switch (outcome) {
            case "success":
                outcomeThreat = baseTaunt + baseTauntSuccess;
                break;
            case "criticalSuccess":
                outcomeThreat = baseTaunt + baseTauntCrit + baseTauntSuccess;
                break;
            default:
                outcomeThreat = baseTaunt;
            }
            threat += outcomeThreat;
            logBlock += ` ├─ Bonus base por Amenaza: +${outcomeThreat}\n`;
        } else {
            return;
        }

        logBlock += ` ├─ Cálculo de amenaza: (${threat}(Amenaza por Rango de Éxito) + ${baseTraitThreat}(Traits))\n`;
        threatGlobal = Math.ceil(threat + baseTraitThreat);
        logBlock += ` └─ Amenaza Final: ${threatGlobal}\n`;

        console.log(logBlock);

        for (const enemy of getEnemyTokens(responsibleToken)) {
            console.log(`[${MODULE}] Burla aplicada a ${enemy.name}: +${threatGlobal}`);
            await applyThreatToEnemies(enemy, responsibleToken.id, responsibleToken.name, threatGlobal);
        }

        _updateFloatingPanel();
    }

    // GENERACIÓN DE AMENAZA POR DAÑO

    if (isDamageTaken) {
        console.log(`[${MODULE}] Entering damage block`);
        const candidates = [];

        // NO ME ESTÁ DETECTANDO LOS CONJUROS DE DAÑO TRAS SALVACIÓN, SOLO LOS ATAQUES


        for (const t of canvas.tokens.placeables) {
            const preData = await t.document.getFlag(MODULE, 'preHP');
            if (typeof preData?.hp === 'number')
                candidates.push(t);
        }
        console.log(`[${MODULE}] Damage candidates: ${candidates.map(t => t.name)}`);

        for (const token of candidates) {
            const preData = await token.document.getFlag(MODULE, 'preHP');
            const attackerId = preData?.attackerId;
            const preHP = preData?.hp;
            const outcomeOpt = context.options?.find(opt => opt.startsWith("check:outcome:"));
            const outcomeLevel = context.options?.find(opt => opt.startsWith("origin:level:"));
            const outcome = outcomeOpt ? outcomeOpt.split(":")[2] : "failure";
            const level = outcomeLevel ? outcomeLevel.split(":")[2] : 1;
            // const attackerName = preData?.attackerName;

            if (typeof preHP !== 'number' || !attackerId)
                continue;

            const responsibleToken = canvas.tokens.get(attackerId);
            if (!responsibleToken) {
                console.warn(`[${MODULE}] No se encontró el token atacante con ID: ${attackerId}`);
                continue;
            }

            const currHP = token.actor.system.attributes.hp?.value ?? 0;
            const damage = Math.max(0, preHP - currHP);
            if (damage === 0)
                continue;
            console.log(`[${MODULE}] ${token.name} took damage: ${damage} (Previous HP: ${preHP}, Post HP: ${currHP})`);

            if (damage === 0)
                continue;

            let threat = damage;
            let logBlock = `[${MODULE}] Amenaza para ${token.name}:\n`;
            let bonusExcess = 0;

            logBlock += ` ├─ Daño infligido: ${damage} (de ${preHP} a ${currHP})\n`;

            if (context.options?.includes('action:strike') && !context.options.includes('origin:action:slug:cast-a-spell')) {
                const baseAttackThreat = game.settings.get(MODULE, 'baseAttackThreat') || 0;
                let outcomeThreat = 0;
                switch (outcome) {
                case "failure":
                    outcomeThreat = baseAttackThreat;
                    break;
                case "success":
                    outcomeThreat = baseAttackThreat + 10;
                    break;
                case "critical-success":
                    outcomeThreat = baseAttackThreat + 20;
                    break;
                default:
                    outcomeThreat = baseAttackThreat;
                }
                threat += outcomeThreat;
                logBlock += ` ├─ Bonus base por ataque: +${outcomeThreat}\n`;
            }
            if (context.options?.includes('origin:action:slug:cast-a-spell')) {
                const baseSpellThreat = game.settings.get(MODULE, 'baseSpellThreat') || 0;
                threat += baseSpellThreat;
                logBlock += ` ├─ Bonus base por CONJURO: +${baseSpellThreat}\n`;
            }

            if (damage > preHP * 0.5) {
                const excess = damage - preHP * 0.5;
                bonusExcess = Math.floor(excess);
                threat += bonusExcess;
                logBlock += ` ├─ Bonus por exceso de daño: +${bonusExcess}\n`;
            } else {
                logBlock += ` ├─ Bonus por exceso de daño: +0\n`;
            }
            let traitBonus = 0;
            for (const tr of traits) {
                const tval = globalThis.TRAIT_THREAT[tr] || 0;
                if (tval) {
                    traitBonus += tval;
                    threat += tval;
                }
            }
            logBlock += ` ├─ Bonus por traits: +${traitBonus}\n`;

            const actionSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
            let ab = 0;
            if (actionOpt) {
                ab = globalThis.ACTION_THREAT[actionSlug] || 0;
                if (ab) {
                    threat += ab;
                }
            }
            logBlock += ` ├─ Bonus por acción (${actionSlug}): +${ab}\n`;

            const distMult = getDistanceThreatMultiplier(token, responsibleToken);
            const vulnMult = getVulnerabilityMultiplier(token, traits);
                logBlock += ` ├─ Multiplicadores: ${threat} × ${vulnMult}(traits) × ${distMult}(distancia)\n`;

            threat = Math.round(threat * vulnMult * distMult);

            logBlock += ` └─ Amenaza Final: +${threat}\n`;

            console.log(logBlock);

            if (!isImmuneToThreat(token, traits)) {
                console.log(`[${MODULE}] Final threat for ${token.name}: ${threat}`);
                await _applyThreat(token, responsibleToken.id, responsibleToken.name, threat);
            } else {
                console.log(`[${MODULE}] ${token.name} is immune to threat`);
            }

            await token.document.unsetFlag(MODULE, 'preHP');
            console.log(`[${MODULE}] → unsetFlag preHP on ${token.name} (${token.id})`);
            await token.document.unsetFlag(MODULE, 'attackThreat');
            console.log(`[${MODULE}] → unsetFlag attackThreat on ${token.name} (${token.id})`);
            console.log(`[${MODULE}] Flags limpiados para ${token.name}`);
            const leftovers = canvas.tokens.placeables
                .filter(t => t.document.getFlag(MODULE, 'preHP') !== undefined)
                .map(t => t.name);
            if (leftovers.length === 0) {
                console.log(`[${MODULE}] No hay tokens con preHP`)
            } else {
                console.log(`[${MODULE}] Después del damage block, tokens con preHP aún presentes: ${leftovers.join(', ')}`);
            }
        }
        _updateFloatingPanel();
    }
});

// ===========================
// 6. HOOKS SECUNDARIOS (createItem, controlToken...)
// ===========================
// HOOK PARA SEQUENCER
Hooks.on('controlToken', async(token, controlled) => {
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

// ===========================
// 7. CIERRE Y LOG FINAL
// ===========================

console.log(`[${MODULE}] Cargado`);

