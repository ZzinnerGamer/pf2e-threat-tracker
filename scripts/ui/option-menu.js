const MODULE = 'pf2e-threat-tracker';
import { skillActionsData } from "../data/skill-actions.js";
import { _updateFloatingPanel } from "../logic/threat-utils.js";

const SETTINGS_GROUPS = {
  General: [
    'enableThreatPanel', 'xFactor', 'yFactor', 'decayEnabled', 'decayFactor'
  ],
  Threat: [
    'baseAttackThreat', 'attackThreatMode', 'baseSpellThreat',
    'threatPerSpellRank', 'baseHealThreat', 'skillBase', 'skillCritBonus', 'enableThreatFromEffects', 'enableIWR'
  ],
  Sequencer: [ 'topThreatEffect', 'enableTopThreatEffect'
  ],
  Appearance: [ 'panelTheme', 'panelOpacity', 'maxVisibleCards'  ]
};

let currentThreatConfigApp = null;

/* =========================
   ThreatConfigApp
========================= */
export class ThreatConfigApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-threat-tracker-config',
    tag: 'div',
    window: {
      title: 'Threat Tracker',
      icon: 'fas fa-user-shield',
      resizable: true
    },
    position: { width: 700, height: 600 },
    actions: {
      submit: ThreatConfigApp._onSubmit,
      switchGroup: ThreatConfigApp._onSwitchGroup,
      closeApp: ThreatConfigApp._onCloseApp
    },
    classes: ['pf2e-threat-tracker-settings-window'],
  };

  constructor(options = {}) {
    super(options);
    try {
      this.options.window.title = game.i18n.localize("pf2e-threat-tracker.threatConfig.threatTrackerConfiguration");
    } catch (_) {}
    this.activeGroupKey = 'General';
    this._pendingChanges = {};
    currentThreatConfigApp = this;
  }

  /** Prepara datos para renderizar */
  async _prepareContext() {
    const categories = [
      { key: 'General',    title: game.i18n.localize("pf2e-threat-tracker.threatConfig.general"),        active: this.activeGroupKey === 'General' },
      { key: 'Threat',     title: game.i18n.localize("pf2e-threat-tracker.threatConfig.threat"),         active: this.activeGroupKey === 'Threat' },
      { key: 'Sequencer',  title: 'Sequencer',                                                           active: this.activeGroupKey === 'Sequencer' },
      { key: 'Custom',     title: game.i18n.localize("pf2e-threat-tracker.threatConfig.customThreat"),   active: this.activeGroupKey === 'Custom' },
      { key: 'Templates',  title: game.i18n.localize("pf2e-threat-tracker.threatConfig.threatPresets"),  active: this.activeGroupKey === 'Templates' },
      { key: 'Appearance', title: game.i18n.localize("pf2e-threat-tracker.threatConfig.appearance"),    active: this.activeGroupKey === 'Appearance' }
    ];

    const groups = [];
    if (['General', 'Threat', 'Sequencer', 'Appareance'].includes(this.activeGroupKey)) {
      const activeKeys = SETTINGS_GROUPS[this.activeGroupKey] || [];
      const items = this._buildSettingsItems(activeKeys);
      groups.push({ title: this.activeGroupKey, items });
    }

    const effectExcludedPacks = game.settings.get(MODULE, 'effectExcludedPacks') || '';

    const panelTheme   = game.settings.get(MODULE, 'panelTheme')   ?? 'dark';
    const panelOpacity = game.settings.get(MODULE, 'panelOpacity') ?? 1;
    const maxVisibleCards = game.settings.get(MODULE, 'maxVisibleCards') ?? 4;

    return { categories, groups, activeGroupKey: this.activeGroupKey, effectExcludedPacks, panelTheme, panelOpacity, maxVisibleCards };
  }

  _buildSettingsItems(keys) {
    return keys.map(key => {
      const cfg = game.settings.settings?.get?.(`${MODULE}.${key}`);
      if (!cfg) return null;
      const value = game.settings.get(MODULE, key);

      let inputType = 'text';
      if (cfg.type === Boolean) inputType = 'checkbox';
      else if (cfg.type === Number) inputType = 'number';

      const min  = cfg.range?.min ?? null;
      const max  = cfg.range?.max ?? null;
      const step = cfg.range?.step ?? (inputType === 'number' ? 1 : null);

      const name = typeof cfg.name === 'string' ? (game.i18n.localize(cfg.name) || cfg.name) : (cfg.name || key);
      const hint = typeof cfg.hint === 'string' ? (game.i18n.localize(cfg.hint) || cfg.hint) : (cfg.hint || '');

      return { key, name, hint, value, inputType, min, max, step };
    }).filter(Boolean);
  }

  async _renderHTML(context) {
    return await foundry.applications.handlebars.renderTemplate(
      'modules/pf2e-threat-tracker/templates/settings-menu.hbs',
      context
    );
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;

    // que el contenedor se comporte como columna para que el footer no tape el scroll
    const wc = content.closest('.window-content');
    if (wc) {
      wc.style.display = 'flex';
      wc.style.flexDirection = 'column';
      wc.style.height = '100%';
    }

    // Tabs
    content.querySelectorAll('[data-action="switchGroup"][data-key]')?.forEach(btn => {
      btn.addEventListener('click', () => {
        ThreatConfigApp._onSwitchGroup(null, btn);
      });
    });

    // Guardar y cerrar
    content.querySelector('[data-action="submit"]')?.addEventListener('click', (ev) => {
      ThreatConfigApp._onSubmit.call(this, ev, ev.currentTarget);
    });
    content.querySelector('[data-action="closeApp"]')?.addEventListener('click', (ev) => {
      ThreatConfigApp._onCloseApp.call(this, ev, ev.currentTarget);
    });

    // Acciones Personalizadas/Templates
    content.querySelector('[data-action="skill-actions"]')?.addEventListener('click', () => {
      try { openGlobalSkillThreatDialog(); } catch (e) { console.warn(e); }
    });
    content.querySelector('[data-action="actor-actions"]')?.addEventListener('click', () => {
      try { openActorSelectionDialog(); } catch (e) { console.warn(e); }
    });
    content.querySelector('[data-action="effects"]')?.addEventListener('click', () => {
      try { openEffectDialog(); } catch (e) { console.warn(e); }
    });

    content.querySelector('[data-action="preset-MMO"]')?.addEventListener('click', () => {
      try { applyPreset("MMO"); } catch (e) { console.warn(e); }
    });
    content.querySelector('[data-action="preset-template1"]')?.addEventListener('click', () => {
      try { applyPreset("template1"); } catch (e) { console.warn(e); }
    });
    content.querySelector('[data-action="preset-template2"]')?.addEventListener('click', () => {
      try { applyPreset("template2"); } catch (e) { console.warn(e); }
    });

    return content;
  }

  // Guarda en buffer lo editado en la pestaña actual antes de cambiar o guardar
  _capturePendingChanges() {
    const form = this.element?.querySelector?.('form.pf2e-threat-tracker-settings');
    if (!form) return;

    const inputs = form.querySelectorAll('[name^="settings."]');
    inputs.forEach((el) => {
      const name = el.name;
      if (!name) return;
      if (el.type === 'checkbox') this._pendingChanges[name] = !!el.checked;
      else this._pendingChanges[name] = el.value;
    });

    const excl = form.querySelector('[name="settings.effectExcludedPacks"]');
    if (excl) this._pendingChanges['settings.effectExcludedPacks'] = excl.value ?? '';
  }

  static _onSwitchGroup(_event, button) {
    const key = button?.dataset?.key;
    if (!key) return;
    const app = currentThreatConfigApp;
    if (!app) return;

    try { app._capturePendingChanges(); } catch (_) {}

    app.activeGroupKey = key;
    app.render({ force: true });
  }

  static async _onSubmit(event, _button) {
    const app = currentThreatConfigApp || this;
    try {
      const formEl = app.element?.querySelector?.('form.pf2e-threat-tracker-settings');
      if (!formEl) return app.close();

      try { app._capturePendingChanges(); } catch (_) {}

      const fd = new FormData(formEl);
      const rawNow = Object.fromEntries(fd.entries());

      const raw = { ...app._pendingChanges, ...rawNow };

      const allKeys = Object.keys(raw)
      .filter(k => k.startsWith('settings.'))
      .map(k => k.slice('settings.'.length));

      for (const key of allKeys) {
        const cfg = game.settings.settings?.get?.(`${MODULE}.${key}`);
        const formKey = `settings.${key}`;
        let value = raw[formKey];

        // Si no hay cfg escribir effectExcludedPacks
        if (!cfg) {
          if (key === 'effectExcludedPacks') {
            value = (value ?? '').toString();
            const current = game.settings.get(MODULE, key);
            if (value !== current) await game.settings.set(MODULE, key, value);
          }
          continue;
        }

        const saved = game.settings.get(MODULE, key);

        if (cfg.type === Boolean) {
          value = (value === 'on' || value === 'true' || value === true)
        } else if (cfg.type === Number) {
          value = value != null && value !== '' ? Number(value) : saved;
        } else {
          value = value ?? saved;
        }

        if (value !== saved) {
          await game.settings.set(MODULE, key, value);
        }
      }

      app._pendingChanges = {};
      await app.close();
    } catch (e) {
      console.warn(`[${MODULE}] Error al guardar settings`, e);
    }
  }

  static async _onCloseApp(_event, _button) {
    try { await (currentThreatConfigApp || this).close(); } catch (_) {}
  }
}

/* =========================
   Global Skill Dialog
========================= */
export async function openGlobalSkillThreatDialog() {
  
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

  content += `<h2 style="text-align:center;">${game.i18n.localize("pf2e-threat-tracker.SkillActions")}</h2>`;

  for (const [skill, actions] of Object.entries(skillActionsData)) {
    const filtered = actions;
    if (!filtered.length) continue;

    content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
      ${game.i18n.localize("PF2E.Skill." + skill.charAt(0).toUpperCase() + skill.slice(1))}
    </h3>`;

    for (const act of filtered) {
      skillActions.push(act);
      const val = game.settings.get(MODULE, `globalSkillActionValue.${act.slug}`) || 0;
      const mode = game.settings.get(MODULE, `globalSkillActionMode.${act.slug}`) || "apply";

      content += `
        <div style="display:grid; grid-template-columns: 24px 1fr 60px 150px; align-items:center; gap:8px;">
          <img src="${skillIcons[skill]}" style="width:24px; height:24px; border:0;" />
          <span style="overflow:hidden; text-overflow:ellipsis;">${game.i18n.localize(act.name)}</span>
          <input type="number" name="${act.slug}-value" value="${val}" style="width:60px;" />
          <select name="${act.slug}-mode">
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

  content += `</div></form>`;

  new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize("pf2e-threat-tracker.threatConfig.globalThreatPerSkillAction")},
    content,
    buttons: [
      { action: "save", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.save"), default: true },
      { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.cancel") }
    ],
    submit: async (result, dialog) => {
      if (result !== "save") return;
      const formEl = dialog.element.querySelector("form");
      const fd = new foundry.applications.ux.FormDataExtended(formEl);

      for (const act of skillActions) {
        const val = parseInt(fd.get(`${act.slug}-value`)) || 0;
        const mode = fd.get(`${act.slug}-mode`);
        await game.settings.set(MODULE, `globalSkillActionValue.${act.slug}`, val);
        await game.settings.set(MODULE, `globalSkillActionMode.${act.slug}`, mode);
      }

      ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.saved"));
    }
  }).render({ force: true });
}


/* =========================
   Actor Selection Dialog
========================= */
async function openActorSelectionDialog() {
  const partyActors = game.actors.filter(a => a.system.details.alliance === "party" && a.type !== "party");
  if (!partyActors.length) {
    ui.notifications.warn(game.i18n.localize("pf2e-threat-tracker.threatConfig.actorsNotFound"));
    return;
  }

  let content = `<div style="display:flex; flex-direction:column; gap:10px;">`;
  for (const actor of partyActors) {
    const img = actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
    content += `
      <button type= "button" data-actor="${actor.id}"
              style="display:flex; align-items:center; gap:8px; padding:6px; border:1px solid #888; border-radius:6px; background:var(--secondary-background-color);">
        <img src="${img}" style="width:36px; height:36px; border-radius:6px;" />
        <span style="font-weight:600;">${actor.name}</span>
      </button>`;
  }
  content += `</div>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize("pf2e-threat-tracker.threatConfig.actorSelect")},
    content,
    buttons: [{ action: "close", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.close"), default: true }],
    });

    await dlg.render({ force: true });

    dlg.element.querySelectorAll("button[data-actor]").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const actorId = ev.currentTarget.dataset.actor;
        dlg.close();
        await openGlobalActionThreatDialog(actorId);
      });
      });
    }


/* =========================
   Action Threat Dialog
========================= */
async function openGlobalActionThreatDialog(actorId) {
  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.error(game.i18n.localize("pf2e-threat-tracker.threatConfig.actorsNotFound"));
    return;
  }

  let content = `<form><div class="scrolltable" style="max-height:600px; min-width:500px; overflow-y:auto;">`;
  content += `<h2 style="text-align:center;">${actor.name}</h2>`;

  const featCategories = ["ancestry", "general", "class", "bonus", "skill", "calling", "classfeature", "curse", "deityboon", "pfsboon", "ancestryfeature"];

  const feats = actor.items.filter(i =>
    i.type === "feat" &&
    (i.system.actions?.value !== null || ["reaction", "free"].includes(i.system.actionType?.value))
  );

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
          <span>${feat.name}</span>
          <input type="number" name="${slug}-value" value="${val}" style="width:60px;" />
          <select name="${slug}-mode">
            <option value="apply" ${mode === "apply" ? "selected" : ""}>
              ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeApply")}
            </option>
            <option value="reduce" ${mode === "reduce" ? "selected" : ""}>
              ${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeReduce")}
            </option>
          </select>
        </div>`;
    }
  }

  content += `</div></form>`;

  new foundry.applications.api.DialogV2({
    window: { title: `${game.i18n.localize("pf2e-threat-tracker.threatConfig.threatPerActionFor")}${actor.name}`},
    content,
    buttons: [
      { action: "save", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.save")},
      { action: "cancel", label: game.i18n.localize("pf2e-threat-tracker.threatConfig.cancel"), default: true  }
    ],
    submit: async (result, dialog) => {
      if (result !== "save") return;
      const fd = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector("form"));

      for (const feat of feats) {
        const slug = feat.system.slug || feat.id;
        const val = parseInt(fd.get(`${slug}-value`)) || 0;
        const mode = fd.get(`${slug}-mode`);
        await actor.setFlag(MODULE, `featValue.${slug}`, val);
        await actor.setFlag(MODULE, `featMode.${slug}`, mode);
      }

      ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.savedConfigFor"), actor.name);
    }
  }).render({ force: true });
}


/* =========================
   Effect Dialog
========================= */
async function openEffectDialog() {
  // Lista de packs de Item
  const packsAll = game.packs.filter(p => p.documentName === "Item");

  // Leer setting
  const excludedRaw = (game.settings.get(MODULE, 'effectExcludedPacks') || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  // Filtrar compendios
  const itemPacks = packsAll.filter(p => {
    const coll  = String(p.collection || '').toLowerCase(); // ej: "pf2e.conditionitems"
    const title = String(p.title || '').toLowerCase();
    // Se excluye si aparece en la lista por id o por título
    return !excludedRaw.some(term => coll.includes(term) || title.includes(term));
  });

  // Cargar efectos
  const effects = [];
  for (const pack of itemPacks) {
    const index = await pack.getIndex();
    for (const entry of index) if (entry.type === "effect") {
      effects.push({ pack, entry });
    }
  }

  if (!document.getElementById("threat-tracker-styles")) {
  const style = document.createElement("style");
  style.id = "threat-tracker-styles";
  style.textContent = `
    #itemsContainer {
      min-width: 500px;
      max-height: 100%;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0px;
    }
    .item-row {
      display: grid;
      grid-template-columns: 40px 1fr 80px 120px 120px;
      height: 40px; 
      box-sizing: border-box;
      grid-auto-rows: 40px;
      align-items: center;
      gap: 0px;
      padding: 4px 0;
      border-bottom: 1px solid #6868684d;
      min-height: 50px
    }
    .item-row img {
      width: 28px;
      height: 28px;
      border-radius: 4px;
    }
    .item-row .item-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-row input[type=number] {
      width: 60px;
      min-width: 60px;
      max-width: 60px;
      text-align: center;
    }
    .item-row select {
      width: 120px;
      min-width: 120px;
      max-width: 120px;
      line-height: 1.2;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

  const saved = game.settings.get(MODULE, "effectData") || {};

  let content = `<form>
    <div style="display:flex; flex-direction:column; gap:10px; width:800px; height:500px;">
      <!-- Buscador -->
      <div style="display:flex; gap:4px; align-items:center;">
        <input type="search" id="searchInput" placeholder="${game.i18n.localize("pf2e-threat-tracker.threatConfig.search")}" style="flex:1; padding:6px; border:1px solid #888; border-radius:4px; outline:none;" />
        <button type="button" id="searchButton" style="padding:6px;">${game.i18n.localize("pf2e-threat-tracker.threatConfig.search2")}</button>
      </div>

      <!-- Cabecera -->
      <div class="header-row" style="display:grid; grid-template-columns: auto 1fr 105px 110px 100px; align-items:center; padding:6px 4px; border-bottom:1px solid #555; font-weight:600; position:sticky; top:0; z-index:1;">
        <div></div>
        <div>${game.i18n.localize("pf2e-threat-tracker.threatConfig.name")}</div>
        <div style="text-align:left;">${game.i18n.localize("pf2e-threat-tracker.threatConfig.value")}</div>
        <div>${game.i18n.localize("pf2e-threat-tracker.threatConfig.mode")}</div>
        <div>${game.i18n.localize("pf2e-threat-tracker.threatConfig.objective")}</div>
      </div>

      <!-- Contenedor de items -->
      <div id="itemsContainer" style="min-width:500px; max-height:100%; overflow-y:auto; display:flex; flex-direction:column; gap: 0px;">`;

  for (const {entry} of effects) {
    const icon = entry.img || "icons/svg/aura.svg";
    const uuid = entry.uuid || entry.id;
    const current = saved[uuid] || { value:0, mode:"apply", origin:"self" };

    content += `<div class="item-row" data-name="${entry.name.replace(/"/g,'&quot;')}" data-uuid="${uuid}">
      <img src="${icon}"/>
      <span class="item-name" title="${entry.name}">${entry.name}</span>
      <input type="number" name="${uuid}-value" value="${current.value}"/>
      <select name="${uuid}-mode">
        <option value="apply" ${current.mode==="apply"?"selected":""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeApply")}</option>
        <option value="reduce" ${current.mode==="reduce"?"selected":""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.modeReduce")}</option>
      </select>
      <select name="${uuid}-origin">
        <option value="self" ${current.origin==="self"?"selected":""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.originSelf")}</option>
        <option value="target" ${current.origin==="target"?"selected":""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.originTarget")}</option>
        <option value="both" ${current.origin==="both"?"selected":""}>${game.i18n.localize("pf2e-threat-tracker.threatConfig.originBoth")}</option>
      </select>
    </div>`;
  }

  content += `</div></div></form>`;

  new foundry.applications.api.DialogV2({
    window:{title:game.i18n.localize("pf2e-threat-tracker.threatConfig.effects")},
    content,
    buttons:[
      { action:"save", label:game.i18n.localize("pf2e-threat-tracker.threatConfig.save"), default:true },
      { action:"close", label:game.i18n.localize("pf2e-threat-tracker.threatConfig.close")}
    ],
  submit: async (result, dialog) => {
    if(result !== "save") return;
    const fd = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector("form"));
    const container = dialog.element.querySelector("#itemsContainer");
    const data = {};
    container.querySelectorAll(".item-row").forEach(row => {
      const uuid = row.dataset.uuid;
      data[uuid] = {
        value: parseInt(fd.get(`${uuid}-value`)) || 0,
        mode: fd.get(`${uuid}-mode`) || "apply",
        origin: fd.get(`${uuid}-origin`) || "self",
      };
    });
    await game.settings.set(MODULE, "effectData", data);
    ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.saved"));
  }
}).render({ force:true });
}

async function applyPreset(presetPath, presetName, description = "") {
  const resp = await fetch(presetPath);
  if (!resp.ok) {
    ui.notifications.error(game.i18n.localize("pf2e-threat-tracker.notifications.presetNotFound"));
    return;
  }
  const data = await resp.json();
  
  const presetKey = `pf2e-threat-tracker.threatPresets.${presetName}`;
  const presetDescription = game.i18n.localize(presetKey);

  // Confirmación previa
  new Dialog({
    title: "Aplicar Preset de Amenaza",
    content: `<p>¿Quieres aplicar la preset <strong>${presetName}</strong>?</p>
              <p>${presetDescription}</p>
              <p>Esto sobrescribirá los valores actuales.</p>
              <p><strong>Una vez realizados los cambios no se puede volver atrás.</strong><p>`,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize("pf2e-threat-tracker.threatConfig.apply"),
        callback: async () => {
          await _applyPresetData(data);
        }
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("pf2e-threat-tracker.threatConfig.cancel")
      }
    },
    default: "no"
  }).render(true);
}

async function _applyPresetData(data) {

    const total =
    Object.keys(data.effects).length +
    Object.keys(data.baseSettings).length +
    Object.keys(data.skillActions).length;
    let current = 0;

    SceneNavigation.displayProgressBar({
      label: game.i18n.localize("pf2e-threat-tracker.threatConfig.applyingPreset"),
      pct: 0
    });

    const updateBar = () => {
      current++;
      const percent = Math.floor((current / total) * 100);
      SceneNavigation.updateProgressBar({
        label: game.i18n.localize("pf2e-threat-tracker.threatConfig.applyingPreset"),
        pct: percent
      });
    };

  for (const [uuid, cfg] of Object.entries(data.effects)) {
    const stored = game.settings.get("pf2e-threat-tracker", "effectData") || {};
    stored[uuid] = cfg;
    await game.settings.set("pf2e-threat-tracker", "effectData", stored);
    current++; updateBar();
  }

  for (const [key, val] of Object.entries(data.baseSettings)) {
    await game.settings.set("pf2e-threat-tracker", key, val);
    current++; updateBar();
  }

  for (const [slug, cfg] of Object.entries(data.skillActions)) {
    await game.settings.set("pf2e-threat-tracker", `globalSkillActionValue.${slug}`, cfg.value);
    await game.settings.set("pf2e-threat-tracker", `globalSkillActionMode.${slug}`, cfg.mode);
    current++; updateBar();
  }

  setTimeout(() => {
    ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.presetApplied"));
  }, 500);
}

/* =========================
   Hook Global para Dialogs
========================= */
Hooks.on("renderDialogV2", (dlg, html, data) => {
  const root = dlg.element;

  // Botones con data-action
  root.querySelectorAll("button[data-action]").forEach(btn=>{
    btn.addEventListener("click", async ev=>{
      const action = btn.dataset.action;
      switch(action){
        case "skill-actions": openGlobalSkillThreatDialog(); break;
        case "actor-actions": openActorSelectionDialog(); break;
        case "effects": openEffectDialog(); break;
        case "preset-MMO": applyPreset("modules/pf2e-threat-tracker/presets/MMO-preset.json"); break;
        case "preset-template1": ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.presetTemplate")); break;
        case "preset-template2": ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.threatConfig.presetTemplate")); break;
      }
    });
  });

  const input = root.querySelector("#searchInput");
  const searchButton = root.querySelector("#searchButton");
  const container = root.querySelector("#itemsContainer");

  if(input && container){
    const applyFilter = ()=>{
      const query = input.value.trim().toLowerCase();
      container.querySelectorAll(".item-row").forEach(row=>{
        const name = (row.dataset.name||row.querySelector(".item-name")?.textContent||"").toLowerCase();
        row.style.display = !query || name.includes(query) ? "" : "none";
      });
    };
    input.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); } });
    if(searchButton) searchButton.addEventListener("click", applyFilter);
  }
});
