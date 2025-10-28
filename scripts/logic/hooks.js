const MODULE = 'pf2e-threat-tracker';

import { getLoggingMode, isActorDead, focusThreatCardByTokenId, clearThreatPanelFocus, reduceThreatForUnconscious } from "../logic/threat-utils.js";

const log = {
  all:  (...a) => { if (getLoggingMode() === 'all') console.log(...a); },
  min:  (...a) => { const m = getLoggingMode(); if (m === 'minimal' || m === 'all') console.log(...a); },
  warn: (...a) => { if (getLoggingMode() !== 'none') console.warn(...a); }
};

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


Hooks.on('canvasReady', () => { if (game.user.isGM) _updateFloatingPanel(); });
Hooks.on('createCombat', () => { if (game.user.isGM) _updateFloatingPanel(); });
Hooks.on('deleteCombat', () => { if (game.user.isGM) _updateFloatingPanel(); });
Hooks.on('updateCombat', (_c, changed) => {
  if (!game.user.isGM) return;
  if ('active' in changed || 'round' in changed || 'turn' in changed) _updateFloatingPanel();
});
Hooks.on('canvasPan', _updateFloatingPanel);
Hooks.on('updateToken', _updateFloatingPanel);
Hooks.on('deleteCombat', async() => {
    if (!game.user.isGM) return;
    for (const token of canvas.tokens.placeables) {
        await token.document.unsetFlag(MODULE, 'threatTable');
        await token.document.unsetFlag(MODULE, 'attackThreat');
        await token.document.unsetFlag(MODULE, 'preHP');
        await token.document.unsetFlag(MODULE, "lastHealAction")
    }
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

// HANDLER DE EFECTO VISUAL AL SELECCIOANAR UN TOKEN EN LA THREAT TABLE
Hooks.on('controlToken', (token, controlled) => {
  if (!game.user.isGM) return;
  const body = document.querySelector('#threat-tracker-panel .tt-body');
  if (!body) return; // si el panel aún no existe, nada que hacer

  if (controlled) {
    focusThreatCardByTokenId(token.id);
  } else {
    const still = canvas.tokens.controlled; // otros que sigan controlados
    if (still.length > 0) {
      focusThreatCardByTokenId(still[still.length - 0].id);
    } else {
      clearThreatPanelFocus();
    }
  }
});

// HANDLER DE ALIADOS INCONSCIENTES
Hooks.on('createItem', async (item) => {
  try {
    if (item?.type !== 'condition') return;

    const slug = item.slug ?? item.system?.slug ?? item.system?.slug?.value;
    if (slug !== 'unconscious') return;

    const tok = canvas.tokens.placeables.find(t => t.actor?.id === item.actor?.id);
    if (!tok) return;

    if (tok.document.disposition !== 1) return;

    await reduceThreatForUnconscious(tok);
  } catch (err) {
    console.warn(`[${MODULE}] Error aplicando reducción por unconscious:`, err);
  }
});


// HANDLER DEL ACTOR MUERTO
Hooks.on('updateCombatant', async (combatant, changes) => {
  if (!game.user.isGM) return;
  if (!('defeated' in changes)) return;

  const scene = game.scenes.get(combatant.sceneId);
  const tokenDoc =
    scene?.tokens?.get(combatant.tokenId) ??
    canvas.tokens.get(combatant.tokenId)?.document;
  const actor = tokenDoc?.actor;
  if (!actor) return;
  
    if (changes.defeated) {
      await actor.setFlag(MODULE, 'ignoreThreat', true);
      console.log(`[${MODULE}] Actor ${actor.name} marcado como muerto/derrotado.`);
    } else {
      await actor.unsetFlag(MODULE, 'ignoreThreat');
      console.log(`[${MODULE}] Actor ${actor.name} desmarcado como muerto/derrotado.`);
    }

  _updateFloatingPanel?.();
});


Hooks.on('createItem', async item => {
  if (!game.user.isGM) return;
  if (item.type === 'condition') {
    await item.actor.setFlag(MODULE, 'ignoreThreat', isActorDead(item.actor));
    _updateFloatingPanel();
  }
});
Hooks.on('deleteItem', async item => {
  if (!game.user.isGM) return;
  if (item.type === 'condition') {
    await item.actor.unsetFlag(MODULE, 'ignoreThreat', isActorDead(item.actor));
    _updateFloatingPanel();
  }
});

// LIMPIAR FLAGS POR TURNO
Hooks.on('combatTurn', async() => {
    if (!game.user.isGM) return;
    for (const token of canvas.tokens.placeables.filter(t => t.inCombat)) {
        await token.document.unsetFlag(MODULE, 'preHP');
        log.all(`[${MODULE}] → unsetFlag preHP on ${token.name} (${token.id})`);
        await token.document.unsetFlag(MODULE, 'attackThreat');
        log.all(`[${MODULE}] → unsetFlag attackThreat on ${token.name} (${token.id})`);
        log.all(`[${MODULE}] Flags limpiados para ${token.name}`);
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
            log.min(
                `[${MODULE}] Reduciendo amenaza en ${tok.name} → ${table[id].name}:` + 
` ${oldValue} → ${newValue} (media ${Math.round(avg)})`);
            table[id].value = newValue;
        }

        await tok.document.setFlag(MODULE, 'threatTable', table);
    }

    _updateFloatingPanel();
});

Hooks.on("preCreateItem", (itemData, options, userId) => {
    log.all("preCreateItem:", itemData);
    log.all("flags.origin:", itemData.system?.context?.origin);
});


Hooks.on("createItem", (item, options, userId) => {
  if (!game.settings.get(MODULE, 'enableThreatFromEffects')) return;

  const chatMessage = options?.chatMessage ?? null; // captura si viene
  log.all("Hook createItem:", { item: item.name, userId, chatMessage });

  setTimeout(() => handleThreatFromEffect({ item, action: "create", userId, chatMessage }), 50);
});

