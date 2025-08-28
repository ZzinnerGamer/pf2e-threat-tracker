const MODULE = 'pf2e-threat-tracker';

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
        `<a class="threat-adjust" title="${game.i18n.localize("pf2e-threat-tracker.threatConfig.tooltip")}">
            <i style= "color: Tomato;" class="fa-sharp fa-solid fa-seal-exclamation"></i>
            ${game.i18n.localize("pf2e-threat-tracker.threatConfig.buttonText")}
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
            <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.attackValue")}:</label>
            <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">

            <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.damageValue")}:</label>
            <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
    }
    if (type === "shield") {
        extraFields += `
            <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.raiseValue")}:</label>
            <input type="number" name="threatRaiseValue" value="${currentRaise}" style="width:100%;">`;
    }
    
    if (type === "spell") {
        const hasDamage = !!item.system.damage && Object.keys(item.system.damage).length > 0;
        const isAttack  = item.system.defense?.passive?.statistic === "ac";

        if (isAttack) {
            showBaseValue = false;
            extraFields += `
                <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.attackValue")}:</label>
                <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">`;
        }
        if (hasDamage && !healingItem) {
            extraFields += `
                <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.damageValue")}:</label>
                <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
        }
    }

    if (healingItem) {
        showBaseValue = false;
        extraFields += `
            <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.healValue")}:</label>
            <input type="number" name="threatHealValue" value="${currentHeal}" style="width:100%;">`;
    }

    new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("pf2e-threat-tracker.threatConfig.title") },
        form: true,
        content: `
                <form>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.slug")}:</label>
                        <input type="text" name="slug" value="${slug}" style="width:100%;" readonly>
                        <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.type")}:</label>
                        <input type="text" name="type" value="${type}" style="width:100%;" readonly>

                        ${showBaseValue ? `
                        <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.value")}:</label>
                        <input type="number" name="threatValue" value="${currentValue}" style="width:100%;">` : ""}

                        ${extraFields}

                        <label>${game.i18n.localize("pf2e-threat-tracker.threatConfig.mode")}:</label>
                        <select name="mode">
                            <option value="apply" ${currentMode === "apply" ? "selected" : ""}>
                                ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeApply")}
                                </option>
                            <option value="reduce" ${currentMode === "reduce" ? "selected" : ""}>
                                ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeReduce")}
                            </option>
                        </select>

                    </div>
                </form>
                `,
        buttons: [
            { action: "save", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.save"), default: true },
            { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.cancel") }
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

            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.saved"));
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
            ${game.i18n.localize("pf2e-threat-tracker.threatConfig.buttonText")}
        </a>
    `);

    threatBtn.on("click", () => openActorThreatDialog(actor));

    html.closest(".app").find(".window-header .window-title").after(threatBtn);
});

export const skillActionsData = {
        acrobatics: [
            { name: "PF2E.Actions.Balance.Title", slug: "balance", minRank: 0 },
            { name: "PF2E.Actions.TumbleThrough.Title", slug: "tumble-through", minRank: 0 },
            { name: "PF2E.Actions.ManeuverInFlight.Title", slug: "maneuver-in-flight", minRank: 1 }
        ],
        athletics: [
            { name: "PF2E.Actions.Climb.Title", slug: "climb", minRank: 0 },
            { name: "PF2E.Actions.ForceOpen.Title", slug: "force-open", minRank: 0 },
            { name: "PF2E.Actions.Grapple.Title", slug: "grapple", minRank: 0 },
            { name: "PF2E.Actions.HighJump.Title", slug: "high-jump", minRank: 0 },
            { name: "PF2E.Actions.LongJump.Title", slug: "long-jump", minRank: 0 },
            { name: "PF2E.Actions.Reposition.Title", slug: "reposition", minRank: 0 },
            { name: "PF2E.Actions.Shove.Title", slug: "shove", minRank: 0 },
            { name: "PF2E.Actions.Swim.Title", slug: "swim", minRank: 0 },
            { name: "PF2E.Actions.Trip.Title", slug: "trip", minRank: 0 },
            { name: "PF2E.Actions.Disarm.Title", slug: "disarm", minRank: 1 }
        ],
        crafting: [
            { name: "PF2E.Actions.Repair.Title", slug: "repair", minRank: 0 }
        ],
        deception: [
            { name: "PF2E.Actions.CreateADiversion.Title", slug: "create-a-diversion", minRank: 0 },
            { name: "PF2E.Actions.Feint.Title", slug: "feint", minRank: 1 }
        ],
        diplomacy: [
            { name: "PF2E.Actions.Request.Title", slug: "request", minRank: 0 }
        ],
        intimidation: [
            { name: "PF2E.Actions.Demoralize.Title", slug: "demoralize", minRank: 0 }
        ],
        medicine: [
            { name: "PF2E.Actions.AdministerFirstAid.Title", slug: "administer-first-aid", minRank: 0 },
            { name: "PF2E.Actions.TreatDisease.Title", slug: "treat-disease", minRank: 1 },
            { name: "PF2E.Actions.TreatWounds.Label", slug: "treat-wounds", minRank: 1 }
        ],
        nature: [
            { name: "PF2E.Actions.CommandAnAnimal.Title", slug: "command-an-animal", minRank: 0 }
        ],
        performance: [
            { name: "PF2E.Actions.Perform.Title", slug: "perform", minRank: 0 }
        ],
        stealth: [
            { name: "PF2E.Actions.ConcealAnObject.Title", slug: "conceal-an-object", minRank: 0 },
            { name: "PF2E.Actions.Hide.Title", slug: "hide", minRank: 0 },
            { name: "PF2E.Actions.Sneak.Title", slug: "sneak", minRank: 0 }
        ],
        thievery: [
            { name: "PF2E.Actions.PalmAnObject.Title", slug: "palm-an-object", minRank: 0 },
            { name: "PF2E.Actions.Steal.Title", slug: "steal", minRank: 0 },
            { name: "PF2E.Actions.DisableDevice.Title", slug: "disable-device", minRank: 1 },
            { name: "PF2E.Actions.PickALock.Title", slug: "pick-a-lock", minRank: 1 }
        ]
    };

async function openActorThreatDialog(actor) {
    const feats = actor.items.filter(i =>
        i.type === "feat" &&
        (
            i.system.actions?.value !== null ||
            ["reaction", "free"].includes(i.system.actionType?.value)
        )
    );

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
                    <span style="overflow:hidden; text-overflow:ellipsis;">${game.i18n.localize(act.name)}</span>
                    <input type="number" name="${act.slug}-value" value="${val}" style="width:60px;" />
                    <select name="${act.slug}-mode">
                        <option value="apply" ${mode === "apply" ? "selected" : ""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeApply")}</option>
                        <option value="reduce" ${mode === "reduce" ? "selected" : ""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeReduce")}</option>
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
                            ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeApply")}
                        </option>
                        <option value="reduce" ${mode === "reduce" ? "selected" : ""}>
                            ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeReduce")}
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
            { action: "save", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.save"), default: true },
            { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.cancel") }
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