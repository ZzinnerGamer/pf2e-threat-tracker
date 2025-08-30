import { getUserTargets, storePreHP, getEnemyTokens, getDistanceThreatMultiplier, getThreatModifierIDR, _applyThreat, _updateFloatingPanel } from "../logic/threat-utils.js";

const MODULE = 'pf2e-threat-tracker';
const hasSkillCheck = new Set(["seek,", "sense-motive", "balance", "maneuver-in-flight", "squeeze", "tumble-through", "identify-magic", "recall-knowledge", "climb", "disarm", "force-open", "grapple", "high-jump", "long-jump", "reposition", "shove", "swim", "trip", "create-a-diversion", "feint", "request", "demoralize", "administer-first-aid", "treat-poison", "command-an-animal", "perform", "hide", "sneak", "disable-device", "palm-an-object", "pick-a-lock", "steal"]);
const ATTACK_SKILLS = new Set(["disarm", "escape", "force-open", "grapple", "reposition", "shove", "trip"]);

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
    
    console.log(`[${MODULE}] Contexto:`, context);

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

    console.log(`[${MODULE}] sourceType: ${context.type}`, {
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

    if (Object.keys(context).length === 0) {
        console.log(`[${MODULE}] Contexto vacío, buscando por slug previamente definido`);

        if (!actionSlug) {
            console.log(`[${MODULE}] No se pudo obtener un slug para este mensaje`);
            return;
        }

        for (const enemy of canvas.tokens.placeables.filter(t =>
                t.inCombat &&
                t.document.disposition !== responsibleToken.document.disposition &&
                !t.actor.hasPlayerOwner)) {
            await storePreHP(enemy, null, responsibleToken, actionSlug);
        }

        if (actionSlug !== undefined) {
            const itemBase = Number(await item.getFlag(MODULE, "threatItemValue")) || 0;
            const itemMode = await item.getFlag(MODULE, "threatItemMode") || "apply";
            const settingsBase = Number(game.settings.get(MODULE, "skillBase")) || 0;

            const base = itemBase > 0 ? itemBase : settingsBase;

            const bonus =
            Number(await item.getFlag(MODULE, "threatAttackValue")) ||
            Number(await item.getFlag(MODULE, "threatDamageValue")) ||
            0;
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
                const bonus = Number(item.getFlag(MODULE, "threatAttackValue")) || 0;
                const fixedRank = threatPerRank * 0.1;
                const threatGlobal = (base + bonus) * fixedRank;

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

    if (isSkillAttack) {            
        const slug =
            context.options?.find(opt => opt.startsWith("action:"))?.split(":")[1] ??
            context.options?.find(opt => opt.startsWith("origin:action:"))?.split(":")[2] ??
            msg.flags?.[MODULE]?.slug ??
            (await msg.getFlag(MODULE, "slug")) ??
            undefined;

        if (!slug || !ATTACK_SKILLS.has(slug)) {
            console.log(`[${MODULE}] Acción de skill-attack no reconocida o no en ATTACK_SKILLS: ${slug}`);
            return;
        }

        const outcome = context.outcome ?? "failure";
        const level = actor.system.details.level.value;
        const base = game.settings.get(MODULE, "baseAttackThreat") || 0;

        let threatGlobal;

        let value = await actor.getFlag(MODULE, `skillActionValue.${slug}`);
        let mode  = await actor.getFlag(MODULE, `skillActionMode.${slug}`);

        if (value == null) value = game.settings.get(MODULE, `globalSkillActionValue.${slug}`);
        if (mode == null)  mode  = game.settings.get(MODULE, `globalSkillActionMode.${slug}`);

        if (value && value > 0) {
            threatGlobal = value;
            if (mode === "reduce") threatGlobal *= -1;
            console.log(`[${MODULE}] Usando amenaza personalizada para skill-attack '${slug}': ${value} (${mode})`);
        }

        switch (outcome) {
            case "criticalFailure": threatGlobal = 0; break;
            case "failure": threatGlobal = Math.ceil(base * (1 + level * 0.1)); break;
            case "success": threatGlobal = Math.ceil((base + 10) * (1 + level * 0.1)); break;
            case "criticalSuccess": threatGlobal = Math.ceil((base + 20) * (1 + level * 0.1)); break;
            default: threatGlobal = base;
        }

        const targets = getUserTargets(context, msg, responsibleToken);
        if (!targets.length) {
            console.warn(`[${MODULE}] No se encontraron objetivos para aplicar amenaza`);
            return;
        }

        const tokenTargets = targets
            .map(tid => canvas.tokens.get(tid))
            .filter(t => !!t);

        for (const enemy of getEnemyTokens(responsibleToken, tokenTargets)) {
            const damageType = item?.system?.damage?.damageType ?? null;
            const traits = context.traits ?? item?.system?.traits?.value ?? [];
            const idrMult = getThreatModifierIDR(enemy, traits, damageType);

            if (idrMult <= 0) {
                console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
                continue;
            }

            const finalThreat = Math.round(threatGlobal * idrMult);
            console.log(`[${MODULE}] Skill-Attack '${slug}' (${outcome}) → threatGlobal = ${finalThreat}`);

            await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, finalThreat);
        }

        _updateFloatingPanel();
    }


    if (isSkillAction && !ATTACK_SKILLS.has(actionSlug)) {
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

        if (slug === "treat-wounds") {
            return;
        }

        console.log(`[${MODULE}] Slug detectado para acción de habilidad: ${slug}`);

        const actorLevel = Number(
                context.options?.find(opt => opt.startsWith("self:level:"))?.split(":")[2]) || 1;

        const outcome = context.outcome ?? 'failure';
        let threatGlobal = 0;

        
        let value = await actor.getFlag(MODULE, `customSkillValue.${slug}`);
        let mode  = await actor.getFlag(MODULE, `customSkillMode.${slug}`);

        if (value == null) value = game.settings.get(MODULE, `globalSkillActionValue.${slug}`);
        if (mode == null)  mode  = game.settings.get(MODULE, `globalSkillActionMode.${slug}`);

        if (value > 0) {
            threatGlobal = value
                if (mode === "reduce")
                    threatGlobal *= -1;
                console.log(`[${MODULE}] Usando amenaza personalizada del actor para ${slug}: ${value} (${mode})`);
        } else {
            if (outcome === 'failure')
                return;

            const baseSkillThreat = game.settings.get(MODULE, 'skillBase') || 0;
            const baseSkillCrit = game.settings.get(MODULE, 'skillCritBonus') || 0;

            let outcomeThreat = baseSkillThreat;
            if (outcome === "failure")
                outcomeThreat === baseSkillThreat;
            if (outcome === "success")
                outcomeThreat += Math.ceil(baseSkillThreat * (1 + actorLevel * 0.1));
            if (outcome === "criticalSuccess")
                outcomeThreat += Math.ceil(baseSkillThreat + baseSkillCrit * (1 + actorLevel * 0.1));

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

    if (isAttack) {
        const outcome = context.outcome ?? 'failure';
        let actionSlug =
            context.options?.find(o => o.startsWith("origin:action:slug:"))?.split(":")[3] ??
            context.options?.find(o => o.startsWith("item:slug:"))?.split(":")[2] ??
            origin?.system?.slug ?? origin?.slug ?? "";

        let item = origin instanceof Item ? origin : null;

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
        case 'success':
            threatGlobal += 10;
            break;
        case 'criticalSuccess':
            threatGlobal += 20;
            break;
        case 'failure':
        default:
            break;
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
            const itemMode = await origin?.getFlag(MODULE, "threatItemMode") || "apply";

            let amount = Math.round(threatGlobal * distMult);
            if (itemMode === "reduce" || game.settings.get(MODULE, 'attackThreatMode') === true) {
                amount = -amount;
                console.log(`[${MODULE}] Modo 'reduce' detectado, invirtiendo amenaza`);
            }
            const traits = context.traits ?? item?.system?.traits?.value ?? [];
            const idrMult = getThreatModifierIDR(enemy, {
                traits,
                damageType,
                slug: actionSlug
            });
            if (idrMult <= 0) {
                console.log(`[${MODULE}] ${enemy.name} es inmune a ${traits.join(", ")}`);
                continue;
            }
            const finalThreat = Math.round(amount * idrMult);

            console.log(`[${MODULE}] ${enemy.name}: Distance mult ${distMult}, Vulnerability mult ${idrMult}, final threat ${finalThreat}`);
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
                    if (found)
                        foundItem = found;
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
                if (tempToken)
                    console.log(`[${MODULE}] Curación a enemigo ignorada: ${tempToken.name}`);
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
                if (amount <= 0)
                    continue;

                let logBlock = `[${MODULE}] Amenaza por curación general:\n`;
                logBlock += ` ├─ Puntos de golpe previos del objetivo a curar ${healedOpt}\n`;
                logBlock += ` ├─ Puntos de golpe máximos ${maxHP}\n`;
                logBlock += ` ├─ Cantidad de curación posible ${healPossible}\n`;
                logBlock += ` ├─ Cálculo de curación: (${baseHeal}(Curación Base) + ${healAmt}(Cantidad Curada))\n`;
                logBlock += ` └─ Amenaza de Curación Final: +${amount}\n`;

                console.log(logBlock);
                await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
            }
            _updateFloatingPanel();
        }
        return;
    }

    if (isDamageTaken) {
        console.log(`[${MODULE}] Entering damage block`);

        const damagedTokens = canvas.tokens.placeables.filter(t => {
                t.inCombat &&
                t.document.disposition !== responsibleToken.document.disposition &&
                !t.actor.hasPlayerOwner
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
            if (!responsibleToken)
                continue;

            const currHP = token.actor.system.attributes.hp?.value ?? 0;
            const damage = Math.max(0, preHP - currHP);
            console.log(`[${MODULE}] HP actual: ${currHP}, Daño calculado: ${damage}`);
            if (damage === 0)
                continue;

            let threat = damage;
            let logBlock = `[${MODULE}] Amenaza para ${token.name}:\n`;
            logBlock += ` ├─ Daño infligido: ${damage} (de ${preHP} a ${currHP})\n`;

            if (damage > preHP * 0.5) {
                const bonusExcess = Math.floor(damage - preHP * 0.5);
                threat += bonusExcess;
                logBlock += ` ├─ Bonus por exceso de daño: +${bonusExcess}\n`;
            } else {
                logBlock += ` ├─ Bonus por exceso de daño: +0\n`;
            }

            const actionSlug = context?.options?.find(opt => opt.startsWith("item:slug:"))?.split(":")[2];
            if (actionSlug) {
                let ab = 0;
                if (item?.getFlag) {
                ab =
                    Number(item.getFlag(MODULE, "threatDamageValue")) ||
                    Number(item.getFlag(MODULE, "threatAttackValue")) ||
                    Number(item.getFlag(MODULE, "threatItemValue")) ||
                    0;
                const m = item.getFlag(MODULE, "threatItemMode") || "apply";
                if (m === "reduce") ab = -Math.abs(ab);
                }
                if (ab)
                    threat += ab;
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
