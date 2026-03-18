/**
 * @module ui/config-app
 * ApplicationV2-based settings configuration panel.
 */

import { MODULE_ID, PANEL_THEMES } from '../core/constants.js';
import { SETTINGS_GROUPS } from '../core/settings.js';
import { skillActionsData, SKILL_ICONS } from '../data/skill-actions.js';
import { exportConfiguration, importConfiguration } from '../core/threat-utils.js';

const loc = (k) => game.i18n?.localize(k) ?? k;

let _currentApp = null;

export class ThreatConfigApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-threat-tracker-config',
    tag: 'div',
    window: {
      title: 'PF2E Threat Tracker Configuration',
      icon: 'fas fa-user-shield',
      resizable: true,
    },
    position: { width: 700, height: 600 },
    classes: ['pf2e-threat-tracker-settings-window'],
  };

  constructor(options = {}) {
    super(options);
    try {
      this.options.window.title = loc('pf2e-threat-tracker.threatConfig.threatTrackerConfiguration');
    } catch { /* ignore */ }
    this.activeGroupKey = 'General';
    this._pendingChanges = {};
    _currentApp = this;
  }

  // ── Context preparation ──

  async _prepareContext() {
    const hasSequencer = !!game.modules.get('sequencer')?.active;
    if (this.activeGroupKey === 'Sequencer' && !hasSequencer) {
      this.activeGroupKey = 'General';
    }

    const categories = [
      { key: 'General',    title: loc('pf2e-threat-tracker.threatConfig.general'),       active: this.activeGroupKey === 'General' },
      { key: 'Threat',     title: loc('pf2e-threat-tracker.threatConfig.threat'),        active: this.activeGroupKey === 'Threat' },
      ...(hasSequencer ? [{ key: 'Sequencer', title: 'Sequencer', active: this.activeGroupKey === 'Sequencer' }] : []),
      { key: 'Custom',     title: loc('pf2e-threat-tracker.threatConfig.customThreat'),  active: this.activeGroupKey === 'Custom' },
      { key: 'Templates',  title: loc('pf2e-threat-tracker.threatConfig.threatPresets'), active: this.activeGroupKey === 'Templates' },
      { key: 'Appearance', title: loc('pf2e-threat-tracker.threatConfig.appearance'),    active: this.activeGroupKey === 'Appearance' },
    ];

    const groups = [];
    const groupableKeys = ['General', 'Threat', 'Appearance', 'Sequencer'];
    if (groupableKeys.includes(this.activeGroupKey)) {
      const activeKeys = SETTINGS_GROUPS[this.activeGroupKey] || [];
      groups.push({ title: this.activeGroupKey, items: this._buildSettingsItems(activeKeys) });
    }

    return {
      categories,
      groups,
      activeGroupKey: this.activeGroupKey,
      effectExcludedPacks: game.settings.get(MODULE_ID, 'effectExcludedPacks') || '',
      panelTheme: game.settings.get(MODULE_ID, 'panelTheme') ?? 'dark',
      panelOpacity: game.settings.get(MODULE_ID, 'panelOpacity') ?? 1,
      maxVisibleCards: game.settings.get(MODULE_ID, 'maxVisibleCards') ?? 4,
    };
  }

  _buildSettingsItems(keys) {
    return keys.map(key => {
      const cfg = game.settings.settings?.get?.(`${MODULE_ID}.${key}`);
      if (!cfg) return null;

      const value = game.settings.get(MODULE_ID, key);
      let inputType = 'text';
      let choices = null;

      if (cfg.choices && typeof cfg.choices === 'object' && Object.keys(cfg.choices).length) {
        inputType = 'select';
        choices = Object.entries(cfg.choices).map(([val, labelKey]) => ({
          value: val,
          label: typeof labelKey === 'string' ? (game.i18n.localize(labelKey) || labelKey) : String(labelKey),
        }));
      } else if (cfg.type === Boolean) {
        inputType = 'checkbox';
      } else if (cfg.type === Number) {
        inputType = 'number';
      }

      const sliderKeys = new Set(['unconsciousThreatPercent', 'decayFactor']);
      let ui = null;
      if (sliderKeys.has(key) && inputType === 'number') ui = 'range';

      return {
        key,
        name: typeof cfg.name === 'string' ? (game.i18n.localize(cfg.name) || cfg.name) : (cfg.name || key),
        hint: typeof cfg.hint === 'string' ? (game.i18n.localize(cfg.hint) || cfg.hint) : '',
        value,
        inputType,
        min: cfg.range?.min ?? null,
        max: cfg.range?.max ?? null,
        step: cfg.range?.step ?? (inputType === 'number' ? 1 : null),
        ui,
        choices,
      };
    }).filter(Boolean);
  }

  // ── Rendering ──

  async _renderHTML(context) {
    return await foundry.applications.handlebars.renderTemplate(
      'modules/pf2e-threat-tracker/templates/settings-menu.hbs',
      context
    );
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;

    const wc = content.closest('.window-content');
    if (wc) {
      wc.style.display = 'flex';
      wc.style.flexDirection = 'column';
      wc.style.height = '100%';
    }

    this._bindEvents(content);
    return content;
  }

  // ── Event binding ──

  _bindEvents(content) {
    // Tab switching
    content.querySelectorAll('[data-action="switchGroup"]')?.forEach(btn => {
      btn.addEventListener('click', () => this._switchGroup(btn.dataset.key));
    });

    // Save / Close
    content.querySelector('[data-action="submit"]')?.addEventListener('click', () => this._save());
    content.querySelector('[data-action="closeApp"]')?.addEventListener('click', () => this.close());

    // Custom actions
    content.querySelector('[data-action="skill-actions"]')?.addEventListener('click', () => {
      openGlobalSkillThreatDialog();
    });
    content.querySelector('[data-action="actor-actions"]')?.addEventListener('click', () => {
      openActorSelectionDialog();
    });
    content.querySelector('[data-action="effects"]')?.addEventListener('click', () => {
      openEffectDialog();
    });
    content.querySelector('[data-action="auto-generate"]')?.addEventListener('click', () => {
      this._autoGenerateDefaults();
    });

    // Presets
    content.querySelector('[data-action="preset-MMO"]')?.addEventListener('click', () => {
      applyPreset('modules/pf2e-threat-tracker/presets/MMO-preset.json', 'MMO');
    });
    content.querySelector('[data-action="preset-template1"]')?.addEventListener('click', () => {
      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.presetTemplate'));
    });
    content.querySelector('[data-action="preset-template2"]')?.addEventListener('click', () => {
      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.presetTemplate'));
    });

    // Export / Import
    content.querySelector('[data-action="export-config"]')?.addEventListener('click', () => {
      this._exportConfig();
    });
    content.querySelector('[data-action="import-config"]')?.addEventListener('click', () => {
      this._importConfig();
    });
  }

  // ── Tab switching ──

  _capturePendingChanges() {
    const form = this.element?.querySelector?.('form.pf2e-threat-tracker-settings');
    if (!form) return;
    form.querySelectorAll('[name^="settings."]').forEach(el => {
      const name = el.name;
      if (el.type === 'checkbox') this._pendingChanges[name] = !!el.checked;
      else this._pendingChanges[name] = el.value;
    });
  }

  _switchGroup(key) {
    if (!key) return;
    try { this._capturePendingChanges(); } catch { /* ignore */ }
    this.activeGroupKey = key;
    this.render({ force: true });
  }

  // ── Save ──

  async _save() {
    try {
      const formEl = this.element?.querySelector?.('form.pf2e-threat-tracker-settings');
      if (!formEl) return this.close();

      this._capturePendingChanges();
      const fd = new FormData(formEl);
      const rawNow = Object.fromEntries(fd.entries());
      const raw = { ...this._pendingChanges, ...rawNow };

      const allKeys = Object.keys(raw)
        .filter(k => k.startsWith('settings.'))
        .map(k => k.slice('settings.'.length));

      for (const key of allKeys) {
        const cfg = game.settings.settings?.get?.(`${MODULE_ID}.${key}`);
        const formKey = `settings.${key}`;
        let value = raw[formKey];

        if (!cfg) {
          if (key === 'effectExcludedPacks') {
            const current = game.settings.get(MODULE_ID, key);
            if ((value ?? '').toString() !== current) {
              await game.settings.set(MODULE_ID, key, (value ?? '').toString());
            }
          }
          continue;
        }

        const saved = game.settings.get(MODULE_ID, key);

        if (cfg.type === Boolean) {
          value = (value === 'on' || value === 'true' || value === true);
        } else if (cfg.type === Number) {
          value = (value != null && value !== '') ? Number(value) : saved;
        } else {
          value = value ?? saved;
        }

        if (value !== saved) {
          await game.settings.set(MODULE_ID, key, value);
        }
      }

      this._pendingChanges = {};
      await this.close();
    } catch (e) {
      console.warn(`[${MODULE_ID}] Error saving settings`, e);
    }
  }

  // ── Export / Import ──

  _exportConfig() {
    const config = exportConfiguration();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threat-tracker-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info('Configuration exported');
  }

  async _importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importConfiguration(data);
        ui.notifications.info('Configuration imported successfully');
        this.render({ force: true });
      } catch (err) {
        ui.notifications.error(`Import failed: ${err.message}`);
      }
    });
    input.click();
  }

  // ── Auto-generate defaults ──

  async _autoGenerateDefaults() {
    const { generateEffectDefaults } = await import('../core/auto-defaults.js');

    const dlg = new foundry.applications.api.DialogV2({
      window: { title: 'Auto-Generate Threat Defaults' },
      content: `
        <div style="display:flex; flex-direction:column; gap:10px; padding:8px;">
          <p>This will analyse all compendiums and generate heuristic-based threat values using trait analysis, spell rank, action cost, and more.</p>
          <p><strong>Items that already have a manually set value will be preserved</strong> unless you check the box below.</p>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="tt-overwrite" />
            <label for="tt-overwrite">Overwrite existing custom values</label>
          </div>
          <div id="tt-progress-area" style="display:none; flex-direction:column; gap:6px; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; font-size:12px;">
              <span id="tt-progress-label">Preparing...</span>
              <span id="tt-progress-pct">0%</span>
            </div>
            <div style="height:8px; border-radius:4px; background:rgba(255,255,255,0.1); overflow:hidden; border:1px solid rgba(255,255,255,0.15);">
              <div id="tt-progress-fill" style="height:100%; width:0%; background:linear-gradient(90deg, #6c6, #4a4); transition:width 0.2s ease; border-radius:4px;"></div>
            </div>
          </div>
          <p style="opacity:0.7; font-size:11px;">Processes effects, spells, feats, actions, equipment, weapons. Uses index data for speed — only loads full documents when needed for effect correlation.</p>
        </div>`,
      buttons: [
        { action: 'generate', label: 'Generate', default: true },
        { action: 'cancel', label: loc('pf2e-threat-tracker.threatConfig.cancel') },
      ],
      submit: async (result, dialog) => {
        if (result !== 'generate') return;
        const overwrite = !!dialog.element.querySelector('#tt-overwrite')?.checked;

        // Show progress area, disable buttons
        const progressArea = dialog.element.querySelector('#tt-progress-area');
        const progressLabel = dialog.element.querySelector('#tt-progress-label');
        const progressPct = dialog.element.querySelector('#tt-progress-pct');
        const progressFill = dialog.element.querySelector('#tt-progress-fill');
        const buttons = dialog.element.querySelectorAll('button[data-action]');

        if (progressArea) progressArea.style.display = 'flex';
        buttons.forEach(b => b.disabled = true);

        try {
          const defaults = await generateEffectDefaults({
            overwriteExisting: overwrite,
            onProgress: (cur, tot) => {
              const pct = Math.floor((cur / tot) * 100);
              if (progressLabel) progressLabel.textContent = `Processing: ${cur} / ${tot}`;
              if (progressPct) progressPct.textContent = `${pct}%`;
              if (progressFill) progressFill.style.width = `${pct}%`;
            },
          });

          await game.settings.set(MODULE_ID, 'effectData', defaults);
          const count = Object.keys(defaults).length;

          if (progressLabel) progressLabel.textContent = `Done — ${count} items configured`;
          if (progressPct) progressPct.textContent = '100%';
          if (progressFill) progressFill.style.width = '100%';

          ui.notifications.info(`Auto-generated threat defaults for ${count} items`);

          // Re-enable close button
          buttons.forEach(b => b.disabled = false);
        } catch (err) {
          if (progressLabel) progressLabel.textContent = `Error: ${err.message}`;
          buttons.forEach(b => b.disabled = false);
          ui.notifications.error(`Generation failed: ${err.message}`);
          console.error(err);
        }
      },
    });

    await dlg.render({ force: true });
  }
}

// ─── Standalone dialogs ───────────────────────────────────────────

export async function openGlobalSkillThreatDialog() {
  const overrides = game.settings.get(MODULE_ID, 'globalSkillActionOverrides') ?? {};
  const skillActions = [];
  let content = `<form><div class="scrolltable" style="max-height:600px; min-width:500px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:8px;">`;
  content += `<h2 style="text-align:center;">${loc('pf2e-threat-tracker.SkillActions')}</h2>`;

  for (const [skill, actions] of Object.entries(skillActionsData)) {
    if (!actions.length) continue;
    content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
      ${loc('PF2E.Skill.' + skill.charAt(0).toUpperCase() + skill.slice(1))}
    </h3>`;

    for (const act of actions) {
      skillActions.push(act);
      const entry = overrides[act.slug] ?? {};
      const val = entry.value ?? 0;
      const mode = entry.mode ?? 'apply';

      content += `
        <div style="display:grid; grid-template-columns: 24px 1fr 60px 150px; align-items:center; gap:8px;">
          <img src="${SKILL_ICONS[skill]}" style="width:24px; height:24px; border:0;" />
          <span style="overflow:hidden; text-overflow:ellipsis;">${loc(act.name)}</span>
          <input type="number" name="${act.slug}-value" value="${val}" style="width:60px;" />
          <select name="${act.slug}-mode">
            <option value="apply" ${mode === 'apply' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeApply')}</option>
            <option value="reduce" ${mode === 'reduce' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeReduce')}</option>
          </select>
        </div>`;
    }
  }
  content += `</div></form>`;

  new foundry.applications.api.DialogV2({
    window: { title: loc('pf2e-threat-tracker.threatConfig.globalThreatPerSkillAction') },
    content,
    buttons: [
      { action: 'save', label: loc('pf2e-threat-tracker.threatConfig.save'), default: true },
      { action: 'cancel', label: loc('pf2e-threat-tracker.threatConfig.cancel') },
    ],
    submit: async (result, dialog) => {
      if (result !== 'save') return;
      const fd = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector('form'));
      const newOverrides = { ...overrides };
      for (const act of skillActions) {
        const val = parseInt(fd.get(`${act.slug}-value`)) || 0;
        const mode = fd.get(`${act.slug}-mode`);
        if (val > 0) {
          newOverrides[act.slug] = { value: val, mode };
        } else {
          delete newOverrides[act.slug];
        }
      }
      await game.settings.set(MODULE_ID, 'globalSkillActionOverrides', newOverrides);
      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.saved'));
    },
  }).render({ force: true });
}

export async function openActorSelectionDialog() {
  const partyActors = game.actors.filter(a => a.system?.details?.alliance === 'party' && a.type !== 'party');
  if (!partyActors.length) {
    ui.notifications.warn(loc('pf2e-threat-tracker.threatConfig.actorsNotFound'));
    return;
  }

  let content = `<div style="display:flex; flex-direction:column; gap:10px;">`;
  for (const actor of partyActors) {
    const img = actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
    content += `
      <button type="button" data-actor="${actor.id}"
              style="display:flex; align-items:center; gap:8px; padding:6px; border:1px solid #888; border-radius:6px; background:var(--secondary-background-color);">
        <img src="${img}" style="width:36px; height:36px; border-radius:6px;" />
        <span style="font-weight:600;">${actor.name}</span>
      </button>`;
  }
  content += `</div>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: loc('pf2e-threat-tracker.threatConfig.actorSelect') },
    content,
    buttons: [{ action: 'close', label: loc('pf2e-threat-tracker.threatConfig.close'), default: true }],
  });

  await dlg.render({ force: true });

  dlg.element.querySelectorAll('button[data-actor]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      dlg.close();
      await openActorThreatDialog(ev.currentTarget.dataset.actor);
    });
  });
}

async function openActorThreatDialog(actorId) {
  const actor = game.actors.get(actorId);
  if (!actor) { ui.notifications.error(loc('pf2e-threat-tracker.threatConfig.actorsNotFound')); return; }

  const feats = actor.items.filter(i =>
    i.type === 'feat'
    && (i.system.actions?.value !== null || ['reaction', 'free'].includes(i.system.actionType?.value))
  );

  const featCategories = [
    'ancestry', 'general', 'class', 'bonus', 'skill', 'calling',
    'classfeature', 'curse', 'deityboon', 'pfsboon', 'ancestryfeature',
  ];

  let content = `<form><div class="scrolltable" style="max-height:600px; min-width:500px; overflow-y:auto;">`;
  content += `<h2 style="text-align:center;">${actor.name}</h2>`;

  for (const category of featCategories) {
    const featsInCat = feats.filter(f => f.system.category === category);
    if (!featsInCat.length) continue;

    content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
      ${loc(`PF2E.Item.Feat.Category.${category.charAt(0).toUpperCase() + category.slice(1)}`) || category}
    </h3>`;

    for (const feat of featsInCat) {
      const slug = feat.system.slug || feat.id;
      const val = await actor.getFlag(MODULE_ID, `featValue.${slug}`) ?? 0;
      const mode = await actor.getFlag(MODULE_ID, `featMode.${slug}`) ?? 'apply';
      content += `
        <div style="display:grid; grid-template-columns: 1fr 60px 150px; align-items:center; gap:8px;">
          <span>${feat.name}</span>
          <input type="number" name="${slug}-value" value="${val}" style="width:60px;" />
          <select name="${slug}-mode">
            <option value="apply" ${mode === 'apply' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeApply')}</option>
            <option value="reduce" ${mode === 'reduce' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeReduce')}</option>
          </select>
        </div>`;
    }
  }
  content += `</div></form>`;

  new foundry.applications.api.DialogV2({
    window: { title: `${loc('pf2e-threat-tracker.threatConfig.threatPerActionFor')}${actor.name}` },
    content,
    buttons: [
      { action: 'save', label: loc('pf2e-threat-tracker.threatConfig.save') },
      { action: 'cancel', label: loc('pf2e-threat-tracker.threatConfig.cancel'), default: true },
    ],
    submit: async (result, dialog) => {
      if (result !== 'save') return;
      const fd = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector('form'));
      for (const feat of feats) {
        const slug = feat.system.slug || feat.id;
        const val = parseInt(fd.get(`${slug}-value`)) || 0;
        const mode = fd.get(`${slug}-mode`);
        if (val !== 0) {
          await actor.setFlag(MODULE_ID, `featValue.${slug}`, val);
          await actor.setFlag(MODULE_ID, `featMode.${slug}`, mode);
        } else {
          await actor.unsetFlag(MODULE_ID, `featValue.${slug}`);
          await actor.unsetFlag(MODULE_ID, `featMode.${slug}`);
        }
      }
      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.savedConfigFor') + actor.name);
    },
  }).render({ force: true });
}

async function openEffectDialog() {
  const packsAll = game.packs.filter(p => p.documentName === 'Item');
  const excludedRaw = (game.settings.get(MODULE_ID, 'effectExcludedPacks') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const itemPacks = packsAll.filter(p => {
    const coll = String(p.collection || '').toLowerCase();
    const title = String(p.title || '').toLowerCase();
    return !excludedRaw.some(term => coll.includes(term) || title.includes(term));
  });

  const effects = [];
  for (const pack of itemPacks) {
    const index = await pack.getIndex();
    for (const entry of index) {
      if (entry.type === 'effect') effects.push({ pack, entry });
    }
  }

  const saved = game.settings.get(MODULE_ID, 'effectData') || {};

  let content = `<form>
    <div style="display:flex; flex-direction:column; gap:10px; width:800px; height:500px;">
      <div style="display:flex; gap:4px; align-items:center;">
        <input type="search" id="searchInput" placeholder="${loc('pf2e-threat-tracker.threatConfig.search')}" style="flex:1; padding:6px; border:1px solid #888; border-radius:4px;" />
        <button type="button" id="searchButton" style="padding:6px;">${loc('pf2e-threat-tracker.threatConfig.search2')}</button>
      </div>
      <div id="itemsContainer" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;">`;

  for (const { entry } of effects) {
    const icon = entry.img || 'icons/svg/aura.svg';
    const uuid = entry.uuid || entry.id;
    const current = saved[uuid] || { value: 0, mode: 'apply', origin: 'self' };
    content += `<div class="item-row" data-name="${entry.name.replace(/"/g, '&quot;')}" data-uuid="${uuid}">
      <img src="${icon}" style="width:28px; height:28px; border-radius:4px;"/>
      <span class="item-name" title="${entry.name}">${entry.name}</span>
      <input type="number" name="${uuid}-value" value="${current.value}" style="width:60px;"/>
      <select name="${uuid}-mode">
        <option value="apply" ${current.mode === 'apply' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeApply')}</option>
        <option value="reduce" ${current.mode === 'reduce' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeReduce')}</option>
      </select>
      <select name="${uuid}-origin">
        <option value="self" ${current.origin === 'self' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.originSelf')}</option>
        <option value="target" ${current.origin === 'target' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.originTarget')}</option>
        <option value="both" ${current.origin === 'both' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.originBoth')}</option>
      </select>
    </div>`;
  }

  content += `</div></div></form>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: loc('pf2e-threat-tracker.threatConfig.effects') },
    content,
    buttons: [
      { action: 'save', label: loc('pf2e-threat-tracker.threatConfig.save'), default: true },
      { action: 'close', label: loc('pf2e-threat-tracker.threatConfig.close') },
    ],
    submit: async (result, dialog) => {
      if (result !== 'save') return;
      const fd = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector('form'));
      const container = dialog.element.querySelector('#itemsContainer');
      const data = {};
      container.querySelectorAll('.item-row').forEach(row => {
        const uuid = row.dataset.uuid;
        data[uuid] = {
          value: parseInt(fd.get(`${uuid}-value`)) || 0,
          mode: fd.get(`${uuid}-mode`) || 'apply',
          origin: fd.get(`${uuid}-origin`) || 'self',
        };
      });
      await game.settings.set(MODULE_ID, 'effectData', data);
      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.saved'));
    },
  });

  await dlg.render({ force: true });

  // Search functionality
  const root = dlg.element;
  const input = root?.querySelector('#searchInput');
  const container = root?.querySelector('#itemsContainer');
  const searchBtn = root?.querySelector('#searchButton');

  if (input && container) {
    const applyFilter = () => {
      const query = input.value.trim().toLowerCase();
      container.querySelectorAll('.item-row').forEach(row => {
        const name = (row.dataset.name || '').toLowerCase();
        row.style.display = (!query || name.includes(query)) ? '' : 'none';
      });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyFilter(); } });
    searchBtn?.addEventListener('click', applyFilter);
  }
}

async function applyPreset(path, presetName) {
  try {
    const resp = await fetch(path);
    if (!resp.ok) {
      ui.notifications.error(loc('pf2e-threat-tracker.notifications.presetNotFound'));
      return;
    }
    const data = await resp.json();

    const presetKey = `pf2e-threat-tracker.threatPresets.${presetName}`;
    const presetDescription = loc(presetKey);

    new foundry.applications.api.DialogV2({
      window: { title: loc('pf2e-threat-tracker.threatConfig.apply') + ' ' + presetName },
      content: `<p>${loc('pf2e-threat-tracker.threatConfig.applyingPreset')}</p><p>${presetDescription}</p>`,
      buttons: [
        {
          action: 'yes', label: loc('pf2e-threat-tracker.threatConfig.apply'),
          callback: async () => {
            await importConfiguration(data);
            ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.presetApplied'));
          },
        },
        { action: 'no', label: loc('pf2e-threat-tracker.threatConfig.cancel') },
      ],
    }).render({ force: true });

  } catch (err) {
    ui.notifications.error(`Preset error: ${err.message}`);
  }
}
