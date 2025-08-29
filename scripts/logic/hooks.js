const MODULE = 'pf2e-threat-tracker';

const L = (...a) => console.log(`[${MODULE}]`, ...a);
const W = (...a) => console.warn(`[${MODULE}]`, ...a);
const E = (...a) => console.error(`[${MODULE}]`, ...a);

import { _updateFloatingPanel, handleThreatFromEffect } from "./threat-utils.js";

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

Hooks.on("preCreateItem", (itemData, options, userId) => {
    console.log("preCreateItem:", itemData);
    console.log("flags.origin:", itemData.system?.context?.origin);
});


Hooks.on("createItem", (item, options, userId) => {
  if (!game.settings.get(MODULE, 'enableThreatFromEffects')) return;

  const chatMessage = options?.chatMessage ?? null; // captura si viene
  console.log("Hook createItem:", { item: item.name, userId, chatMessage });

  setTimeout(() => handleThreatFromEffect({ item, action: "create", userId, chatMessage }), 50);
});
