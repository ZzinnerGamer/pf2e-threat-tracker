/*
  Módulo completo de sistema de amenaza para Foundry VTT (PF2e)
*/
const MODULE = 'pf2e-threat-tracker';
const { ApplicationV2 } = foundry.applications.api;
const HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;

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

    // Manejar arrays o valores únicos
    if (Array.isArray(traitNames)) {
      for (let i = 0; i < traitNames.length; i++) {
        const name = traitNames[i];
        const value = Number(traitValues[i]);
        if (name) traits[name] = value;
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

Hooks.once('init', async () => {
  console.log(`[${MODULE}] Inicializado`);

  const loadJSONSetting = async (path, settingKey, globalKey) => {
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
  ]);

  game.settings.register(MODULE, 'panelPosition', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.panelPosition.name"),
    scope: 'client',
    config: true,
    default: { top: 10, left: 10 },
    type: Object,
  });

  game.settings.register(MODULE, 'decayEnabled', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.hint"),
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
  });

  game.settings.register(MODULE, 'baseAttackThreat', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.hint"),
    scope: 'world',
    config: true,
     type: Number,
   default: 10
  });


  game.settings.register(MODULE, 'baseHealThreat', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.hint"),
    scope: 'world',
    config: true,
    default: 30,
    type: Number,
  });

  game.settings.register(MODULE, 'tauntSuccessBonus', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.tauntSuccessBonus.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.tauntSuccessBonus.hint"),
    scope: 'world',
    config: true,
    default: 10,
    type: Number,
  });

  game.settings.register(MODULE, 'tauntCritBonus', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.tauntCritBonus.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.tauntCritBonus.hint"),
    scope: 'world',
    config: true,
    default: 20,
    type: Number,
  });

  game.settings.register(MODULE, 'traitThreats', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.traitThreats.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.traitThreats.hint"),
    scope: 'world',
    config: false,
    default: JSON.stringify(globalThis.TRAIT_THREAT || {}, null, 2),
    type: String,
  });

  game.settings.register(MODULE, 'traitVulnerabilities', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.traitVulnerabilities.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.traitVulnerabilities.hint"),
    scope: 'world',
    config: true,
    default: JSON.stringify(globalThis.TRAIT_VULNERABILITY || {}, null, 2),
    type: String,
    onChange: value => {
      try {
        globalThis.TRAIT_VULNERABILITY = JSON.parse(value);
        ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.traitVulnerabilities.updated"));
      } catch {
        ui.notifications.error(game.i18n.localize("pf2e-threat-tracker.notifications.traitVulnerabilities.invalid"));
      }
    },
  });
  
  game.settings.register(MODULE, 'enableThreatPanel', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.hint"),
  scope: 'client',
  config: true,
  default: true,
  type: Boolean,
  onChange: () => {
    ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.enableThreatPanel.updated"));
    location.reload();
  }
});

  game.settings.register(MODULE, 'enableTopThreatEffect', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.hint"),
  scope: "client", // Solo afecta al cliente que lo activa
  config: true,
  default: true,
  type: Boolean
});
  
  game.settings.register(MODULE, 'topThreatEffect', {
    name: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.hint"),
  scope: 'world',
  config: true,
  default: 'jb2a.icon.skull.dark_red',
  type: String
});

  globalThis.TRAIT_THREAT = JSON.parse(game.settings.get(MODULE, 'traitThreats') || '{}');
  globalThis.TRAIT_VULNERABILITY = JSON.parse(game.settings.get(MODULE, 'traitVulnerabilities') || '{}');
});

const TAUNT_TRAITS = new Set(['auditory', 'concentrate', 'emotion', 'linguistic', 'mental']);

function isImmuneToThreat(enemy, actionTraits) {
  if (!enemy?.actor) return false;
  const enemyTypes = enemy.actor.system.traits?.value ?? [];
  for (const type of enemyTypes) {
    const vulnData = globalThis.TRAIT_VULNERABILITY[type.toLowerCase()];
    if (!vulnData?.immunityTo) continue;
    if (vulnData.immunityTo.some(immuneTrait => actionTraits.includes(immuneTrait.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

Hooks.on('createChatMessage', async (msg) => {
  console.log(`[${MODULE}] createChatMessage hook ejecutado`);
  const context = msg.flags.pf2e?.context;
  if (!context) return;
  const actor = msg.actor;
  if (!actor || !msg.author || !msg.flags?.pf2e) return;

  const originUUID = msg.flags.pf2e.origin?.uuid;
  const origin = originUUID ? await fromUuid(originUUID) : null;
  let responsibleToken = origin?.isEmbedded && origin.documentName === 'Token' ? origin.object : null;
  if (!responsibleToken && origin?.actor)
    responsibleToken = canvas.tokens.placeables.find(t => t.actor?.id === origin.actor.id);
  responsibleToken = responsibleToken ?? canvas.tokens.get(actor.token?.id) ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
  if (!responsibleToken) return;

  console.log(`[${MODULE}] Token responsable: ${responsibleToken.name}`);
  console.log(`[${MODULE}] Contexto:`, context);

  let traits = [];
  if (Array.isArray(context.traits)) {
    traits = context.traits.map(t => t.toLowerCase());
  } else if (Array.isArray(msg.flags.pf2e.traits)) {
    traits = msg.flags.pf2e.traits.map(t => t.toLowerCase());
  } else if (origin) {
    traits = origin.system?.traits?.value?.map(t => t.toLowerCase()) ?? [];
  }

  const isAttack = context.type === 'attack-roll';
  const isHeal = Array.isArray(context.domains) && context.domains.includes('healing-received');
  const isTaunt = context.type === 'skill-check' && traits.some(t => TAUNT_TRAITS.has(t));
  const targets = [...game.user.targets].map(t => t.id);

  let threatGlobal = 0;

  if (isAttack) {
    const outcome = context.outcome ?? 'failure';
    const level = actor.system.details.level.value;
    const base = game.settings.get(MODULE, 'baseAttackThreat');
    switch (outcome) {
      case 'criticalFailure': threatGlobal = 0; break;
      case 'failure': threatGlobal = base; break;
      case 'success': threatGlobal = base + 10 * level; break;
      case 'criticalSuccess': threatGlobal = base + 20 * level; break;
      default: threatGlobal = base;
    }
    console.log(`[${MODULE}] Ataque detectado: amenaza base=${threatGlobal}`);
  } else if (isHeal) {
    const baseHeal = game.settings.get(MODULE, 'baseHealThreat');
    for (const tgtId of targets) {
      const token = canvas.tokens.get(tgtId);
      if (!token || token.document.disposition !== responsibleToken.document.disposition) {
        if(token) console.log(`[${MODULE}] Curación a enemigo ignorada: ${token.name}`);
        continue;
      }

      const { hp } = token.actor.system.attributes;
      const maxHP = hp.max;
      const preOpt = context.options?.find(o => o.startsWith('hp-percent:'));
      const prePercent = preOpt ? parseFloat(preOpt.split(':')[1]) / 100 : 0;
      const preHP = Math.round(prePercent * maxHP);
      const currHP = hp.value;
      const healAmt = Math.max(0, currHP - preHP);
      const threatLocal = Math.ceil(baseHeal + healAmt);

      if (threatLocal > 0) {
        console.log(`[${MODULE}] Curación válida en ${token.name}: ${healAmt}/${maxHP}, amenaza=${threatLocal}`);
        threatGlobal += threatLocal;
      }
    }

    if (threatGlobal === 0) {
      for (const tr of traits) threatGlobal += (globalThis.TRAIT_THREAT[tr] || 0);
    }

    if (threatGlobal > 0) {
      for (const enemy of canvas.tokens.placeables.filter(t =>
        t.inCombat &&
        t.document.disposition !== responsibleToken.document.disposition &&
        t.document.disposition !== 0 &&
        responsibleToken.document.disposition !== 0 &&
        !t.actor.hasPlayerOwner
      )) {
        const primary = targets.includes(enemy.id);
        let amount = primary ? threatGlobal : Math.floor(threatGlobal / 4);
        if (isImmuneToThreat(enemy, traits)) {
          console.log(`[${MODULE}] Inmunidad total a amenaza para ${enemy.name} por traits de inmunidad`);
          amount = 0;
        }
        if (amount <= 0) continue;
        console.log(`[${MODULE}] (Curación) ${primary ? 'Principal' : 'Secundario'} ${enemy.name}: +${amount}`);
        await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
      }
      _updateFloatingPanel();
    }
    return;
  } else if (isTaunt) {
    const domains = context.domains ?? [];
    const options = context.options ?? [];
    const allTraits = [...new Set([...domains, ...options].filter(t => TAUNT_TRAITS.has(t)))];
    const baseTraitThreat = allTraits.reduce((sum, tr) => sum + (globalThis.TRAIT_THREAT[tr] || 0), 0);
    console.log(`[${MODULE}] Amenaza por traits: ${baseTraitThreat} (${allTraits.join(', ')})`);
    const outcome = context.outcome ?? 'failure';
    const outcomeBonus = outcome === 'success' ? game.settings.get(MODULE, 'tauntSuccessBonus') :
      outcome === 'criticalSuccess' ? game.settings.get(MODULE, 'tauntCritBonus') : 0;
    threatGlobal = baseTraitThreat + outcomeBonus;
    console.log(`[${MODULE}] Taunt detectado: traits=${baseTraitThreat} + bonus=${outcomeBonus} => amenaza=${threatGlobal}`);
  } else {
    threatGlobal = traits.reduce((sum, tr) => sum + (globalThis.TRAIT_THREAT[tr] || 0), 0);
  }

  const actionOpt = context.options?.find(o => o.startsWith('action:'));
  let actionBonus = 0;
  if (actionOpt) {
    const slug = actionOpt.split(':')[1];
    actionBonus = globalThis.ACTION_THREAT?.[slug] || 0;
    if (actionBonus) console.log(`[${MODULE}] Bonus por acción '${slug}': +${actionBonus}`);
    threatGlobal += actionBonus;
  }

  if (threatGlobal <= 0) return;

  for (const enemy of canvas.tokens.placeables.filter(t =>
    t.inCombat &&
    t.document.disposition !== responsibleToken.document.disposition &&
    t.document.disposition !== 0 &&
    responsibleToken.document.disposition !== 0 &&
    !t.actor.hasPlayerOwner
  )) {
    const primary = targets.includes(enemy.id);
    let amount = primary ? threatGlobal : Math.floor(threatGlobal / 4);
	const distanceMultiplier = getDistanceThreatMultiplier(enemy, responsibleToken);
	amount = Math.round(amount * distanceMultiplier);
	
    if (isImmuneToThreat(enemy, traits)) {
      console.log(`[${MODULE}] Inmunidad total a amenaza para ${enemy.name} por traits de inmunidad`);
      amount = 0;
    }
    if (amount <= 0) continue;
    console.log(`[${MODULE}] ${primary ? 'Principal' : 'Secundario'} ${enemy.name}: (+${amount} x(${distanceMultiplier} por distancia)`);
    await _applyThreat(enemy, responsibleToken.id, responsibleToken.name, amount);
  }
  _updateFloatingPanel();
});

async function _applyThreat(enemy, srcId, srcName, amount) {
  const raw = enemy.document.getFlag(MODULE, 'threatTable') ?? {};
  const current = Object.entries(raw).reduce((acc, [id, v]) => {
    acc[id] = typeof v === 'object' ? { ...v } : { name: canvas.tokens.get(id)?.name ?? '???', value: v };
    return acc;
  }, {});
  if (!current[srcId]) current[srcId] = { name: srcName, value: 0 };
  current[srcId].value += amount;
  await enemy.document.setFlag(MODULE, 'threatTable', current);
}

function getTopThreatTarget(enemyToken) {
  const threatTable = enemyToken.document.getFlag(MODULE, 'threatTable') || {};
  if (!Object.keys(threatTable).length) return null;

  // Obtener el ID con más amenaza solo en ESTE enemigo
  const sorted = Object.entries(threatTable).sort((a, b) => b[1] - a[1]);
  const [topTokenId, value] = sorted[0];

  const topToken = canvas.tokens.get(topTokenId);
  if (!topToken) return null;

  return { token: topToken, amount: value };
}

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

  if (distance <= 5) return 1.0;
  if (distance <= adjustedSpeed) return 0.9;
  if (distance <= adjustedSpeed * 2) return 0.8;
  if (distance <= adjustedSpeed * 3) return 0.7;
  return 0.5;
}


function _updateFloatingPanel() {
  if (!game.settings.get(MODULE, 'enableThreatPanel')) return;
  if (!game.user.isGM) return;
  const combat = game.combats.active;
  const id = 'threat-tracker-panel';
  let panel = document.getElementById(id);
  if (!combat) {
    panel?.remove();
    return;
  }

  const savedPos = game.settings.get(MODULE, 'panelPosition') ?? { top: 10, left: 10 };

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
        game.settings.set(MODULE, 'panelPosition', {
          top: panel.offsetTop,
          left: panel.offsetLeft
        });
      }
      isDragging = false;
      document.body.style.userSelect = '';
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
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

  while (panel.childNodes.length > 1) panel.removeChild(panel.lastChild);

  for (const tok of canvas.tokens.placeables) {
    const table = tok.document.getFlag(MODULE, 'threatTable');
    if (!table || Object.keys(table).length === 0) continue;
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

Hooks.once("ready", () => {
  Hooks.on("createItem", async (item) => {
    if (item.type !== "effect") return;

    console.log(`[${MODULE}] Efecto creado:`, item);
	
    const actor = item.parent;
    if (!actor) return;

    const level = actor.system.details.level.value;
	
    let token = actor.token?.object ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
    if (!token || !token.inCombat) {
      console.log(`[${MODULE}] No se encontró un token en combate para aplicar amenaza`);
      return;
    }
    if (token.document.disposition !== 1) {
      console.log(`[${MODULE}] Token no aliado, no genera amenaza: ${token.name}`);
      return;
    }

    if (!String.prototype.slugify) {
      String.prototype.slugify = function () {
        return this.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
      };
    }

    let slug = item.system?.slug || item.slug || item.name?.slugify?.();
    if (!slug) {
      console.warn(`[${MODULE}] Efecto sin slug válido:`, item.name);
      return;
    }

    console.log(`[${MODULE}] Slug detectado: ${slug}`);
    console.log(`[${MODULE}] Tabla de efectos:`, globalThis.EFFECTS_THREAT);

    const threatAmount = globalThis.EFFECTS_THREAT?.[slug] * level;
    if (!threatAmount) {
      console.log(`[${MODULE}] Efecto '${slug}' no tiene amenaza asociada`);
      return;
    }
    console.log(`[${MODULE}] Efecto detectado: ${slug} -> amenaza ${threatAmount}`);

    for (const enemy of canvas.tokens.placeables.filter(t =>
      t.inCombat &&
      t.document.disposition === -1 &&
      !t.actor.hasPlayerOwner
    )) {
      console.log(`[${MODULE}] (Efecto) ${enemy.name}: +${threatAmount}`);
      await _applyThreat(enemy, token.id, token.name, threatAmount);
    }
    _updateFloatingPanel();
  });
});

Hooks.on('controlToken', async (token, controlled) => {
  console.log(`[${MODULE}] Token ${controlled ? "seleccionado" : "deseleccionado"}: ${token.name} (${token.id})`);
  if (!game.settings.get(MODULE, 'enableTopThreatEffect')) return;
  if (!controlled) {
    // Si se deselecciona el token, limpiar su efecto
    Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });
    return;
  }

  // Solo aplicamos esto si el token NO es de jugador (enemigo) y el GM está activo
  if (token.actor.hasPlayerOwner) return;

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

  if (!topTokenId) return;

  const topToken = canvas.tokens.get(topTokenId);
  if (!topToken) {
    console.log(`[${MODULE}] No se encontró el token con ID ${topTokenId} en el canvas.`);
    return;
  }

  // Opcional: limpiar efectos anteriores antes de crear uno nuevo
  Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });

  const effectPath = game.settings.get(MODULE, 'topThreatEffect');
  console.log(`[${MODULE}] Aplicando efecto '${effectPath}' a ${topToken.name} (${topToken.id}) con amenaza ${topThreatValue}`);

  // Crear el efecto sobre el token con mayor amenaza
  new Sequence()
    .effect()
    .file(effectPath)
    .attachTo(topToken)
    .scaleToObject(0.4)
    .fadeIn(500)
    .fadeOut(250)
    .persist()
    .anchor({ x: 0.5, y: 1.5 })
    .name(`top-threat-${token.id}`)
    .forUsers([game.user.id])
    .play();
});


// También limpia el efecto si deseleccionas el token
Hooks.on('controlToken', (token, controlled) => {
  if (!controlled) {
    Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });
  }
});


Hooks.on('canvasReady', _updateFloatingPanel);
Hooks.on('canvasPan', _updateFloatingPanel);
Hooks.on('updateToken', _updateFloatingPanel);
Hooks.on('deleteCombat', async () => {
  for (const tok of canvas.tokens.placeables) await tok.document.unsetFlag(MODULE, 'threatTable');
  _updateFloatingPanel();
});

Hooks.on('getTokenHUDButtons', (hud, buttons) => {
  if (!game.user.isGM) return;
  buttons.unshift({
    icon: 'fas fa-broom',
    label: 'Reset Amenaza',
    onClick: async () => {
      const tok = canvas.tokens.get(hud.object.id);
      if (!tok) return;
      await tok.document.unsetFlag(MODULE, 'threatTable');
      ui.notifications.info('Amenaza reseteada');
      _updateFloatingPanel();
    }
  });
});

Hooks.on('combatTurn', async () => {
  if (!game.settings.get(MODULE, 'decayEnabled')) return;
  for (const tok of canvas.tokens.placeables) {
    const table = tok.document.getFlag(MODULE, 'threatTable');
    if (!table) continue;
    for (const id of Object.keys(table)) table[id].value = Math.floor(table[id].value * 0.9);
    await tok.document.setFlag(MODULE, 'threatTable', table);
  }
  _updateFloatingPanel();
});

console.log(`[${MODULE}] Cargado`);