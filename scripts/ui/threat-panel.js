/**
 * @module ui/threat-panel
 * Floating threat panel rendered on the canvas.
 * Features: inline editing, undo, pause, lock, reset, aggro shift alerts,
 * multi-combat support. GM-only — invisible to players.
 */

import { MODULE_ID, ALL_THEME_CLASSES } from '../core/constants.js';
import { Logger } from '../core/logger.js';
import {
  getSetting, setSetting, isActorDead,
  undoLastThreatChange, setThreatValue, resetSingleThreat, resetAllThreat,
  setThreatLock, isThreatLocked, isThreatPaused, setThreatPaused,
  consumeAggroShift,
} from '../core/threat-utils.js';
import { focusThreatCard, clearThreatFocus } from '../core/hooks.js';

const PANEL_ID = 'threat-tracker-panel';

let _isRendering = false;
let _needsRerender = false;
let _cardIndex = 0;

// ─── Token interaction helpers ────────────────────────────────────

function getCanvasToken(id) {
  return canvas.tokens.get(id)
    ?? canvas.tokens.placeables.find(t => t.id === id || t.document?.id === id)
    ?? null;
}

function hoverToken(id, enter) {
  const t = getCanvasToken(id);
  if (!t) return;
  const obj = t.object ?? t;
  try {
    if (enter) obj._onHoverIn?.({});
    else obj._onHoverOut?.({});
  } catch { /* ignore */ }
}

function selectToken(id, { additive = false, pan = true } = {}) {
  const t = getCanvasToken(id);
  if (!t) return;
  const obj = t.object ?? t;
  if (!additive) canvas.tokens.releaseAll();
  obj.control?.({ releaseOthers: !additive, pan });
}

// ─── Max visible cards constraint ─────────────────────────────────

function applyMaxVisibleCards(panel, body) {
  const maxCards = Number(getSetting('maxVisibleCards') ?? 4);
  if (!Number.isFinite(maxCards) || maxCards <= 0) { body.style.maxHeight = ''; return; }

  const cards = body.querySelectorAll('.tt-card');
  if (cards.length === 0) { body.style.maxHeight = ''; return; }

  const bs = getComputedStyle(body);
  const gap = parseFloat(bs.gap) || 0;
  const pad = (parseFloat(bs.paddingTop) || 0) + (parseFloat(bs.paddingBottom) || 0);

  const count = Math.min(maxCards, cards.length);
  let target = pad;
  for (let i = 0; i < count; i++) {
    target += cards[i].offsetHeight;
    if (i < count - 1) target += gap;
  }

  const header = panel.querySelector('.tt-header');
  const headerH = header?.offsetHeight ?? 0;
  const ps = getComputedStyle(panel);
  const panelGap = parseFloat(ps.gap) || 0;
  const maxByViewport = Math.floor(window.innerHeight * 0.8) - headerH - panelGap;

  body.style.maxHeight = `${Math.max(0, Math.min(target, maxByViewport))}px`;
  body.style.overflow = 'auto';
}

// ─── Combat selector for multi-combat ─────────────────────────────

function getActiveCombat() {
  return game.combats.active ?? null;
}

function renderCombatSelector(panel) {
  const combats = game.combats.contents.filter(c => c.started);
  if (combats.length <= 1) {
    panel.querySelector('.tt-combat-selector')?.remove();
    return;
  }

  let selector = panel.querySelector('.tt-combat-selector');
  if (!selector) {
    selector = document.createElement('div');
    selector.className = 'tt-combat-selector';
    const header = panel.querySelector('.tt-header');
    if (header) header.after(selector);
    else panel.prepend(selector);
  }

  const active = game.combats.active;
  selector.innerHTML = combats.map(c => {
    const label = c.combatants.map(cb => cb.name).slice(0, 3).join(', ');
    const isActive = c.id === active?.id;
    return `<button class="tt-combat-btn ${isActive ? 'active' : ''}" data-combat-id="${c.id}"
              title="Round ${c.round ?? 0}">
              ${label.length > 20 ? label.slice(0, 20) + '…' : label}
            </button>`;
  }).join('');

  selector.querySelectorAll('.tt-combat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const combat = game.combats.get(btn.dataset.combatId);
      if (combat) combat.activate();
    });
  });
}

// ─── Aggro shift alert ────────────────────────────────────────────

function showAggroAlert(panel) {
  const shift = consumeAggroShift();
  if (!shift) return;

  // Remove existing alert
  panel.querySelector('.tt-aggro-alert')?.remove();

  const alert = document.createElement('div');
  alert.className = 'tt-aggro-alert';
  alert.innerHTML = `
    <i class="fas fa-exchange-alt"></i>
    <span><strong>${shift.enemyName}</strong>: ${shift.oldTargetName} → ${shift.newTargetName}</span>
  `;

  const body = panel.querySelector('.tt-body');
  if (body) body.before(alert);
  else panel.appendChild(alert);

  // Auto-dismiss after 4 seconds
  setTimeout(() => alert.classList.add('tt-alert-fade'), 3500);
  setTimeout(() => alert.remove(), 4000);
}

// ─── Inline editing ───────────────────────────────────────────────

function startInlineEdit(valueEl, enemyTokenId, sourceTokenId) {
  if (valueEl.querySelector('input')) return; // Already editing

  const currentVal = valueEl.textContent.trim();
  const width = Math.max(valueEl.offsetWidth, 40);

  valueEl.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'number';
  input.value = currentVal;
  input.className = 'tt-inline-input';
  input.style.width = width + 'px';

  const commit = async () => {
    const newVal = parseInt(input.value) || 0;
    await setThreatValue(enemyTokenId, sourceTokenId, newVal);
    updateFloatingPanel();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); updateFloatingPanel(); }
    e.stopPropagation(); // Don't let Foundry capture keypresses
  });
  input.addEventListener('blur', commit);

  valueEl.appendChild(input);
  input.focus();
  input.select();
}

// ─── Main panel update ────────────────────────────────────────────

export async function updateFloatingPanel() {
  if (!getSetting('enableThreatPanel')) return;
  if (!game.user.isGM) return;

  if (_isRendering) {
    _needsRerender = true;
    Logger.debug('Panel: queued rerender (already rendering)');
    return;
  }
  _isRendering = true;
  Logger.debug('Panel: updating...');

  try {
    const combat = getActiveCombat();
    let panel = document.getElementById(PANEL_ID);

    if (!combat) { panel?.remove(); return; }

    const savedPos = {
      left: Number(getSetting('xFactor') ?? 120),
      top: Number(getSetting('yFactor') ?? 120),
    };
    const themeClass = getSetting('panelTheme') || 'dark';
    const panelOpacity = Math.max(0, Math.min(1, Number(getSetting('panelOpacity') ?? 0.9)));
    const minimized = !!getSetting('panelMinimized');

    // ── Create panel if it doesn't exist ──
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.className = themeClass;
      Object.assign(panel.style, {
        left: savedPos.left + 'px',
        top: savedPos.top + 'px',
        opacity: String(panelOpacity),
      });

      // Header with control buttons
      const header = document.createElement('div');
      header.className = 'tt-header';
      header.innerHTML = `
        <div class="tt-title">Threat Tracker</div>
        <div class="tt-actions">
          <button class="tt-btn tt-undo" title="Undo last change (Ctrl+Z)"><i class="fas fa-undo"></i></button>
          <button class="tt-btn tt-pause ${isThreatPaused() ? 'tt-active' : ''}" title="Pause threat calculation"><i class="fas fa-pause"></i></button>
          <button class="tt-btn tt-minimize" title="Minimize">–</button>
          <button class="tt-btn tt-history" title="History"><i class="fas fa-clock-rotate-left"></i></button>
          <button class="tt-btn tt-config" title="Configure"><i class="fas fa-cog"></i></button>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'tt-body';

      panel.appendChild(header);
      panel.appendChild(body);
      document.body.appendChild(panel);

      // ── Drag ──
      setupDrag(panel, header);

      // ── Button handlers ──
      header.querySelector('.tt-undo')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const entry = await undoLastThreatChange();
        if (entry) {
          ui.notifications.info(`Undo: ${entry.description}`);
          updateFloatingPanel();
        } else {
          ui.notifications.warn('Nothing to undo');
        }
      });

      header.querySelector('.tt-pause')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const newState = !isThreatPaused();
        setThreatPaused(newState);
        e.currentTarget.classList.toggle('tt-active', newState);
        e.currentTarget.querySelector('i').className = newState ? 'fas fa-play' : 'fas fa-pause';
        e.currentTarget.title = newState ? 'Resume threat calculation' : 'Pause threat calculation';
        ui.notifications.info(newState ? 'Threat paused' : 'Threat resumed');
      });

      header.querySelector('.tt-minimize')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const isMin = panel.classList.toggle('is-min');
        body.style.display = isMin ? 'none' : '';
        await setSetting('panelMinimized', isMin);
      });

      header.querySelector('.tt-config')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const { ThreatConfigApp } = await import('./config-app.js');
        new ThreatConfigApp().render(true);
      });

      header.querySelector('.tt-history')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const { openHistoryDialog } = await import('./history-dialog.js');
        openHistoryDialog();
      });

      // Keyboard shortcut: Ctrl+Z for undo
      document.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input, textarea, [contenteditable]')) {
          // Only intercept if the panel exists and is visible
          if (!document.getElementById(PANEL_ID)) return;
          const entry = await undoLastThreatChange();
          if (entry) {
            ui.notifications.info(`Undo: ${entry.description}`);
            updateFloatingPanel();
          }
        }
      }, { once: false });

      // Resize listener
      window.addEventListener('resize', () => {
        const p = document.getElementById(PANEL_ID);
        const b = p?.querySelector('.tt-body');
        if (p && b) applyMaxVisibleCards(p, b);
      });
    }

    // ── Apply theme/opacity ──
    panel.classList.remove(...ALL_THEME_CLASSES);
    panel.classList.add(themeClass);
    panel.style.opacity = String(panelOpacity);

    // Update pause button state
    const pauseBtn = panel.querySelector('.tt-pause');
    if (pauseBtn) {
      const paused = isThreatPaused();
      pauseBtn.classList.toggle('tt-active', paused);
      pauseBtn.querySelector('i').className = paused ? 'fas fa-play' : 'fas fa-pause';
    }

    // Multi-combat selector
    renderCombatSelector(panel);

    // Aggro shift alert
    showAggroAlert(panel);

    // Minimised state
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

    // ── Render content ──
    const body = bodyEl;
    if (!body) return;
    body.innerHTML = '';
    _cardIndex = 0;

    // Only ignore tokens that are ACTUALLY dead right now — not stale flags
    const ignoredIds = new Set(
      canvas.tokens.placeables
        .filter(t => isActorDead(t))
        .map(t => t.id)
    );

    // Auto-clear stale ignoreThreat flags for tokens that are alive
    for (const t of canvas.tokens.placeables) {
      if (t.actor?.getFlag(MODULE_ID, 'ignoreThreat') && !ignoredIds.has(t.id)) {
        t.actor.unsetFlag(MODULE_ID, 'ignoreThreat').catch(() => {});
      }
    }

    const toClear = [];
    let cardsRendered = 0;

    Logger.debug(`Panel render: ${canvas.tokens.placeables.length} tokens on canvas, ${ignoredIds.size} ignored`);

    for (const tok of canvas.tokens.placeables) {
      if (ignoredIds.has(tok.id)) {
        const table = tok.document.getFlag(MODULE_ID, 'threatTable');
        if (table && Object.keys(table).length > 0) toClear.push(tok.document);
        continue;
      }

      const table = tok.document.getFlag(MODULE_ID, 'threatTable');

      if (!table || Object.keys(table).length === 0) {
        Logger.debug(`  ${tok.name}: no threatTable`);
        continue;
      }

      Logger.debug(`  ${tok.name}: threatTable has ${Object.keys(table).length} entries:`,
        Object.entries(table).map(([id, v]) => {
          const val = typeof v === 'object' ? v.value : v;
          const name = typeof v === 'object' ? v.name : '?';
          return `${name}=${val}`;
        }).join(', ')
      );

      const sorted = Object.entries(table)
        .filter(([attackerId]) => !ignoredIds.has(attackerId))
        .map(([id, v]) => {
          const entry = typeof v === 'object' ? v : { name: canvas.tokens.get(id)?.name ?? '???', value: Number(v) || 0 };
          return { id, name: entry.name, value: entry.value ?? 0, locked: !!entry.locked };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 5); // Show top 5 now that we have more controls

      if (sorted.length === 0) continue;

      const maxVal = Math.max(...sorted.map(s => s.value), 1);
      const card = createCard(tok, sorted, maxVal);
      body.appendChild(card);
      cardsRendered++;
    }

    Logger.debug(`Panel render: ${cardsRendered} cards rendered, ${toClear.length} to clear`);

    if (toClear.length > 0) {
      await Promise.all(toClear.map(doc => doc.setFlag(MODULE_ID, 'threatTable', {})));
    }

    const controlled = canvas.tokens.controlled;
    if (controlled.length > 0) {
      focusThreatCard(controlled[controlled.length - 1].id);
    } else {
      clearThreatFocus();
    }

    if (!minimized) applyMaxVisibleCards(panel, body);

  } finally {
    _isRendering = false;
    if (_needsRerender) {
      _needsRerender = false;
      updateFloatingPanel();
    }
  }
}

// ─── Card creation ────────────────────────────────────────────────

function createCard(tok, sorted, maxVal) {
  const card = document.createElement('div');
  card.className = 'tt-card';
  card.dataset.index = String(_cardIndex++);
  card.dataset.tokenId = tok.id;

  // Card title with reset button
  const titleRow = document.createElement('div');
  titleRow.className = 'tt-title tt-clickable';
  titleRow.innerHTML = `
    <span>${tok.name}</span>
    <span class="tt-chip">Top ${sorted.length}</span>
    <button class="tt-btn-micro tt-reset-all" title="Reset all threat for ${tok.name}"><i class="fas fa-trash-alt"></i></button>
  `;

  titleRow.addEventListener('mouseenter', () => hoverToken(tok.id, true));
  titleRow.addEventListener('mouseleave', () => hoverToken(tok.id, false));
  titleRow.addEventListener('click', (e) => {
    if (e.target.closest('.tt-reset-all')) return; // Don't select on reset click
    selectToken(tok.id, { additive: e.shiftKey || e.ctrlKey || e.metaKey, pan: true });
  });

  titleRow.querySelector('.tt-reset-all')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await resetAllThreat(tok.id);
    updateFloatingPanel();
  });

  card.appendChild(titleRow);

  // Threat entries with inline edit + lock + reset
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const wrapper = document.createElement('div');
    wrapper.className = 'tt-entry';
    wrapper.dataset.tokenId = row.id;
    if (row.locked) wrapper.classList.add('tt-locked');

    const pct = Math.round((row.value / maxVal) * 100);

    // Position indicator color
    const posClass = i === 0 ? 'tt-pos-1' : i === 1 ? 'tt-pos-2' : 'tt-pos-3';

    wrapper.innerHTML = `
      <div class="tt-entry-name tt-clickable ${posClass}">${row.name}</div>
      <div class="tt-entry-value" title="Click to edit">${row.value}</div>
      <div class="tt-entry-actions">
        <button class="tt-btn-micro tt-lock ${row.locked ? 'tt-active' : ''}" title="${row.locked ? 'Unlock' : 'Lock'} threat">
          <i class="fas ${row.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
        <button class="tt-btn-micro tt-reset-one" title="Reset this entry">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="tt-bar-wrap"><div class="tt-bar tt-bar-${posClass}" style="width:${pct}%;"></div></div>
    `;

    // Hover
    wrapper.addEventListener('mouseenter', () => hoverToken(row.id, true));
    wrapper.addEventListener('mouseleave', () => hoverToken(row.id, false));

    // Click name to select token
    wrapper.querySelector('.tt-entry-name')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectToken(row.id, { additive: e.shiftKey || e.ctrlKey || e.metaKey, pan: true });
    });

    // Click value for inline edit
    wrapper.querySelector('.tt-entry-value')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(e.currentTarget, tok.id, row.id);
    });

    // Lock button
    wrapper.querySelector('.tt-lock')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await setThreatLock(tok.id, row.id, !row.locked);
      updateFloatingPanel();
    });

    // Reset single entry
    wrapper.querySelector('.tt-reset-one')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await resetSingleThreat(tok.id, row.id);
      updateFloatingPanel();
    });

    card.appendChild(wrapper);
  }

  return card;
}

// ─── Drag setup ───────────────────────────────────────────────────

function setupDrag(panel, header) {
  let isDragging = false;
  let dx = 0, dy = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tt-actions') || e.target.closest('.tt-btn')) return;
    isDragging = true;
    dx = e.clientX - panel.offsetLeft;
    dy = e.clientY - panel.offsetTop;
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      setSetting('xFactor', panel.offsetLeft);
      setSetting('yFactor', panel.offsetTop);
    }
    isDragging = false;
    document.body.style.userSelect = '';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let x = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - panel.offsetWidth);
    let y = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - panel.offsetHeight);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  });
}
