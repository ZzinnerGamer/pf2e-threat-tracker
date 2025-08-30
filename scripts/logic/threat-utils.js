const MODULE = 'pf2e-threat-tracker';


import { ThreatConfigApp } from "../ui/option-menu.js";


export const getLoggingMode = () => globalThis.game?.settings?.get?.(MODULE, 'loggingMode') ?? 'none';

const log = {
  all:  (...a) => { if (getLoggingMode() === 'all') console.log(...a); },
  min:  (...a) => { const m = getLoggingMode(); if (m === 'minimal' || m === 'all') console.log(...a); },
  warn: (...a) => { if (getLoggingMode() !== 'none') console.warn(...a); }
};

export function getUserTargets(context, msg, responsibleToken) {
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

export async function _applyThreat(enemy, srcId, srcName, amount) {
    if (!game.user.isGM) return;
    
    if (typeof enemy === "string") {
    enemy = canvas.tokens.get(enemy);
    }

    if (!enemy?.document) {
    console.warn(`[${MODULE}] _applyThreat: enemy inválido`, enemy);
    return;
}
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

function buildTokenSet({ traitsLC = [], slugLC = "", dmgLC = "", options = [] }) {
  const set = new Set();

  for (const t of traitsLC) if (t) set.add(t);
  if (slugLC) set.add(slugLC);
  if (dmgLC)  set.add(dmgLC);

  for (const opt of options ?? []) {
    const o = String(opt).toLowerCase();
    if (!o) continue;
    set.add(o);
    for (const seg of o.split(":")) {
      if (seg) set.add(seg);
      for (const sub of seg.split("-")) if (sub) set.add(sub);
    }
    const mat = o.match(/item:material:([a-z0-9-]+)/);
    if (mat?.[1]) set.add(mat[1]);
  }

  const hasSpell  = [...set].some(s => s === "spell" || s.includes("item:type:spell"));
  const hasWeapon = [...set].some(s => s === "weapon" || s.includes("item:type:weapon"));
  const isMagical = [...set].some(s => s === "magical" || s.includes("item:magical") || s.includes("magical"));
  const hasDamage = [...set].some(s => s.startsWith("damage") || s.includes(":damage"));

  if (hasSpell)  set.add("spells");
  if (hasWeapon) set.add("weapons");
  if (isMagical) set.add("magical");
  if (hasSpell && hasDamage) set.add("damage-from-spells");

  if (!isMagical) set.add("non-magical");

  return set;
}


      // ----- [ Función del IWR ] -----

function isIWREnabled() {
  try { return game.settings.get(MODULE, 'enableIWR') === true; }
  catch { return false; }
}

export function getThreatModifierIWR(enemy, params = {}) {
  if (!enemy?.actor) return 1;
  if (!isIWREnabled()) return 1;

  let traits = [], slug = "", damageType = "", options = [];
  if (Array.isArray(params)) {
    traits = params;
  } else if (typeof params === "string") {
    slug = params;
  } else if (params && typeof params === "object") {
    ({ traits = [], slug = "", damageType = "", options = [] } = params);
  }

  const traitsArr = Array.isArray(traits) ? traits : (traits != null ? [traits] : []);
  const traitsLC  = traitsArr.filter(Boolean).map(t => String(t).toLowerCase());
  const slugLC    = slug ? String(slug).toLowerCase() : "";
  const dmgLC     = damageType ? String(damageType).toLowerCase() : "";

  const targetTokens = buildTokenSet({ traitsLC, slugLC, dmgLC, options });

  const I = enemy.actor.system.attributes?.immunities  ?? [];
  const W = enemy.actor.system.attributes?.weaknesses  ?? [];
  const R = enemy.actor.system.attributes?.resistances ?? [];

  // ---------- INMUNIDADES ----------
  for (const i of I) {
    const t = String(i?.type ?? i?.label ?? "").toLowerCase();
    if (!t) continue;

    let exc = i?.exceptions ?? i?.exception ?? [];
    if (typeof exc === "string") exc = exc.split(",").map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];

    if (!targetTokens.has(t)) continue;

    const excepted = excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok));
    if (excepted) {
      log.all?.(`[${MODULE}] Inmunidad '${t}' ignorada por excepción: ${excLC.join(", ")}`);
      continue;
    }

    log.all?.(`[${MODULE}] ${enemy.name} es INMUNE por '${t}' → x0`);
    return 0;
  }

  // ---------- DEBILIDADES ----------
  let mult = 1;
  for (const w of W) {
    const t = String(w?.type ?? "").toLowerCase();
    const v = Number(w?.value ?? 0);
    if (!t || !v) continue;

    let exc = w?.exceptions ?? w?.exception ?? [];
    if (typeof exc === "string") exc = exc.split(",").map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];

    if (!targetTokens.has(t)) continue;

    const excepted = excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok));
    if (excepted) {
      log.all?.(`[${MODULE}] Debilidad '${t}' ignorada por excepción: ${excLC.join(", ")}`);
      continue;
    }

    log.all?.(`[${MODULE}] ${enemy.name} tiene debilidad '${t}' (+${v})`);
    mult += v;
  }

  // ---------- RESISTENCIAS ----------
  for (const r of R) {
    const t = String(r?.type ?? "").toLowerCase();
    const v = Number(r?.value ?? 0);
    if (!t || !v) continue;

    let exc = r?.exceptions ?? r?.exception ?? [];
    if (typeof exc === "string") exc = exc.split(",").map(s => s.trim());
    const excLC = Array.isArray(exc) ? exc.map(e => String(e).toLowerCase()) : [];

    if (!targetTokens.has(t)) continue;

    const excepted = excLC.length > 0 && [...targetTokens].some(tok => excLC.includes(tok));
    if (excepted) {
      log.all?.(`[${MODULE}] Resistencia '${t}' ignorada por excepción: ${excLC.join(", ")}`);
      continue;
    }

    log.all?.(`[${MODULE}] ${enemy.name} tiene resistencia '${t}' (-${v})`);
    mult -= v;
  }

  log.all?.(
    `[${MODULE}] IWR → enemy=${enemy.name} | tokens=[${[...targetTokens].join(", ")}] | mult-base=${mult}`
  );

  mult = mult / 10 + 1;
  if (mult === 1.1) mult = 1;

  return Math.max(mult, 0);
}

// ---------------------------------------------------------

export function getEnemyTokens(responsibleToken, excludeIds = []) {
    return canvas.tokens.placeables.filter(t =>
        t.inCombat &&
        t.document.disposition !== responsibleToken.document.disposition &&
        !t.actor.hasPlayerOwner &&
        !excludeIds.includes(t.id));
}

// OBTENER PUNTOS DE GOLPE Y ATACANTE RESPONSABLE

export async function storePreHP(token, threat = null, responsibleToken = null, slug = null) {
    if (!game.user.isGM) return;

    const alreadyStored = await token.document.getFlag(MODULE, 'preHP');
    const hp = token.actor.system.attributes.hp?.value;

    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
    log.all(`[${MODULE}] storePreHP called for ${token.name} | alreadyStored=${!!alreadyStored} | HP=${hp} | threat=${threat} | attacker=${responsibleToken?.name ?? "N/A"} | slug=${slug ?? "N/A"}`);
    }

    if (alreadyStored) {
        await token.document.unsetFlag(MODULE, 'preHP');
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
        log.all(`[${MODULE}] preHP flag removed for ${token.name}`);
    }
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
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
        log.all(`[${MODULE}] preHP flag set for ${token.name}:`, data);
    }
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

export function getDistanceThreatMultiplier(tokenTarget, tokenSource) {
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

export async function _updateFloatingPanel() {
  if (!game.settings.get(MODULE, 'enableThreatPanel')) return;
  if (!game.user.isGM) return;

  const combat = game.combats.active;
  const id = 'threat-tracker-panel';
  let panel = document.getElementById(id);

  if (!combat) { panel?.remove(); return; }

  const savedPos = {
    left: Number(game.settings.get(MODULE, 'xFactor') ?? 120),
    top:  Number(game.settings.get(MODULE, 'yFactor') ?? 120)
  };
  const themeClass = game.settings.get(MODULE, 'panelTheme') || 'dark';
  const panelOpacity = Math.max(0, Math.min(1, Number(game.settings.get(MODULE,'panelOpacity') ?? 0.9)));
  const minimized = !!game.settings.get(MODULE, 'panelMinimized');

  // Crear panel si no existe
if (!panel) {
    panel = document.createElement('div');
    panel.id = id;
    panel.className = themeClass;
    Object.assign(panel.style, {
      left: savedPos.left + 'px',
      top:  savedPos.top + 'px',
      opacity: String(panelOpacity)
    });

    const header = document.createElement('div');
    header.className = 'tt-header';
    header.innerHTML = `
      <div class="tt-title">Threat Tracker</div>
      <div class="tt-actions">
        <button class="tt-btn tt-minimize" title="${game.i18n.localize('Minimize') || 'Minimize'}">–</button>
        <button class="tt-btn tt-config" title="${game.i18n.localize('Configure') || 'Configure'}"><i class="fas fa-cog"></i></button>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'tt-body';

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // --- DRAG (solo si no clicas botones/acciones) ---
    let isDragging = false;
    let dx = 0, dy = 0;
    header.addEventListener('mousedown', e => {
      // si pulsas sobre botones/acciones: no drags
      if (e.target.closest('.tt-actions') || e.target.closest('.tt-btn')) return;
      isDragging = true;
      dx = e.clientX - panel.offsetLeft;
      dy = e.clientY - panel.offsetTop;
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
      if (!isDragging) return;
      let x = e.clientX - dx;
      let y = e.clientY - dy;
      x = Math.min(Math.max(0, x), window.innerWidth - panel.offsetWidth);
      y = Math.min(Math.max(0, y), window.innerHeight - panel.offsetHeight);
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    });

    // --- Acciones ---
    header.querySelector('.tt-minimize')?.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMin = panel.classList.toggle('is-min');
      body.style.display = isMin ? 'none' : '';
      await game.settings.set(MODULE, 'panelMinimized', isMin);
    });

    header.querySelector('.tt-config')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        // Abre tu menú con pestañas
        new ThreatConfigApp().render(true);
      } catch (err) {
        console.warn('[pf2e-threat-tracker] No se pudo abrir ThreatConfigApp:', err);
      }
    });
  }

  // Aplicar tema/opacidad (por si cambian en runtime)
  panel.classList.remove('dark','parchment','blueNeon', 'fargo', 'darkGeoBlack', 'darkGeoWhite');
  panel.classList.add(themeClass);
  panel.style.opacity = String(panelOpacity);
  panel.style.setProperty('--p', `${progress}%`);

  // Minimizado persistente
  const bodyEl = panel.querySelector('.tt-body');
  if (bodyEl) {
    if (minimized) {
      bodyEl.style.display = 'none';
      panel.classList.add('is-min');
    } else {
      bodyEl.style.display = '';
      panel.classList.remove('is-min');
    }
  }

  // RENDER CONTENIDO
  const body = bodyEl;
  if (!body) return;
  body.innerHTML = '';

  // Por cada token con threatTable, mostrar card
  for (const tok of canvas.tokens.placeables) {
    const table = tok.document.getFlag(MODULE, 'threatTable');
    if (!table || Object.keys(table).length === 0) continue;

    // ordenar desc y top3
    const sorted = Object.entries(table)
      .map(([id, v]) => (typeof v === 'object' ? v : { name: tok.name ?? '???', value: Number(v) || 0 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 3);

    const maxVal = Math.max(...sorted.map(s => s.value), 1);

    const card = document.createElement('div');
    card.className = 'tt-card';
    card.innerHTML = `
      <div class="tt-title">
        <span>${tok.name}</span>
        <span class="tt-chip">${game.i18n.localize('Top')} 3</span>
      </div>
    `;

    for (const row of sorted) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tt-entry';
      wrapper.innerHTML = `
        <div>${row.name}</div>
        <div>${row.value}</div>
        <div class="tt-bar-wrap"><div class="tt-bar" style="width:${Math.round((row.value / maxVal) * 100)}%;"></div></div>
      `;
      card.appendChild(wrapper);
    }

    body.appendChild(card);
  }
}

export async function handleThreatFromEffect({ item, action, userId }) {
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
  let logBlock = `[${MODULE}] --------------------\n`;
  logBlock = `[${MODULE}] Iniciando handleThreatFromEffect: ${item.name}, ${action}\n`;
    }

  const uuid = item?._stats?.compendiumSource;
  if (!uuid) return;

  const data = game.settings.get(MODULE, "effectData") || {};
  const cfg = data[uuid];
  if (!cfg) return;

  let amount = cfg.value;
  if (amount === 0) return;

  // Tokens
  const affectedToken = canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id);
  if (!affectedToken) return;
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
  logBlock = `[${MODULE}] Token afectado:`, affectedToken.name`\n`;
    }

  const origin = item.system?.context?.origin;
  if (!origin?.actor) return;
  const originToken = origin?.token ? canvas.tokens.get(origin.token.split('.').pop()) : affectedToken;
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
  logBlock = `[${MODULE}] Token responsable:`, originToken.name`\n`;
    }

  // Ajustar cantidad según acción
  if (action === "delete" && originToken.id === affectedToken.id) {
    amount = cfg.mode === "apply" ? -amount : amount;
  } else {
    amount = cfg.mode === "reduce" ? -amount : amount;
  }
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
  logBlock = `[${MODULE}] Monto de amenaza ajustado:`, amount`\n`;
    }

  const isAlly = affectedToken.document.disposition === 1;
  const isSelf = originToken.id === affectedToken.id || isAlly;
  const isEnemy = !isAlly;

  const allEnemies = canvas.tokens.placeables.filter(t => t.document.disposition !== 1 && t.combatant?.combat);

  if (isSelf) {
    for (const enemy of allEnemies) {
      _applyThreat(enemy, affectedToken.id, affectedToken.name, amount);
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
      logBlock = `[${MODULE}] Apply self: ${affectedToken.name} -> ${enemy.name} = ${amount}\n`;
    }
    }

    if (isAlly && originToken.id !== affectedToken.id) {
      const halfAmount = Math.floor(amount / 2);
      for (const enemy of allEnemies) {
        _applyThreat(enemy, originToken.id, originToken.name, halfAmount);
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
        logBlock = `[${MODULE}] Apply half to origin: ${originToken.name} -> ${enemy.name} = ${halfAmount}\n`;
    }
      }
    }
  }

  if (isEnemy) {
    _applyThreat(affectedToken, originToken.id, originToken.name, amount);
    logBlock = (`[${MODULE}] Apply target: ${originToken.name} -> ${affectedToken.name} = ${amount}\n`);

    const halfAmount = Math.floor(amount / 2);
    for (const enemy of allEnemies) {
      if (enemy.id === affectedToken.id) continue;
      _applyThreat(enemy, originToken.id, originToken.name, halfAmount);
    if (game.settings.get(MODULE, 'loggingMode') === 'all') {
      logBlock = `[${MODULE}] Apply half to origin (excluding target): ${originToken.name} -> ${enemy.name} = ${halfAmount}\n`;
    }
    }
  }

  logBlock = `[${MODULE}] handleThreatFromEffect finalizado.\n`;
  logBlock = `[${MODULE}] --------------------\n`;
  
  log.all(logBlock)
}
