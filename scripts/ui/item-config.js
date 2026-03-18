/**
 * @module ui/item-config
 * Adds a "Configure Threat" button to item and actor sheets.
 */

import { MODULE_ID } from '../core/constants.js';
import { skillActionsData, SKILL_ICONS } from '../data/skill-actions.js';

const loc = (k) => game.i18n?.localize(k) ?? k;

/**
 * Register the sheet hooks.
 */
export function registerItemConfigHooks() {

  // ── Item Sheet button ──
  Hooks.on('renderItemSheet', (app, html) => {
    if (!game.user.isGM) return;

    const allowedTypes = ['weapon', 'spell', 'shield', 'feat', 'consumable', 'action'];
    if (!allowedTypes.includes(app.item.type)) return;

    if (
      app.item.type === 'feat'
      && app.item.system.actions?.value === null
      && !['reaction', 'free'].includes(app.item.system.actionType?.value)
    ) return;

    if (app.item.type === 'consumable' && app.item.system.category === 'ammo') return;
    if (!app.item.system.slug) return;

    if (html.closest('.app').find('.threat-adjust').length) return;

    const threatBtn = $(`
      <a class="threat-adjust" title="${loc('pf2e-threat-tracker.threatConfig.tooltip')}">
        <i style="color: Tomato;" class="fa-sharp fa-solid fa-seal-exclamation"></i>
        ${loc('pf2e-threat-tracker.threatConfig.buttonText')}
      </a>
    `);

    threatBtn.on('click', () => openItemThreatDialog(app.item));
    html.closest('.app').find('.window-header .window-title').after(threatBtn);
  });

  // ── Actor Sheet button ──
  Hooks.on('renderActorSheet', (app, html) => {
    if (!game.user.isGM) return;
    const actor = app.actor;
    if (actor.system?.details?.alliance !== 'party') return;
    if (html.closest('.app').find('.party-threat-config').length) return;

    const threatBtn = $(`
      <a class="party-threat-config" title="Configure Global Threat">
        <i style="color: Tomato;" class="fa-sharp fa-solid fa-seal-exclamation"></i>
        ${loc('pf2e-threat-tracker.threatConfig.buttonText')}
      </a>
    `);

    threatBtn.on('click', () => openActorThreatDialog(actor));
    html.closest('.app').find('.window-header .window-title').after(threatBtn);
  });
}

// ─── Item threat dialog ───────────────────────────────────────────

async function openItemThreatDialog(item) {
  const currentValue  = await item.getFlag(MODULE_ID, 'threatItemValue') ?? 0;
  const currentMode   = await item.getFlag(MODULE_ID, 'threatItemMode') ?? 'apply';
  const currentAttack = await item.getFlag(MODULE_ID, 'threatAttackValue') ?? 0;
  const currentDamage = await item.getFlag(MODULE_ID, 'threatDamageValue') ?? 0;
  const currentRaise  = await item.getFlag(MODULE_ID, 'threatRaiseValue') ?? 0;
  const currentHeal   = await item.getFlag(MODULE_ID, 'threatHealValue') ?? 0;

  const slug = item.slug ?? item.name.toLowerCase().replace(/\s+/g, '-');
  const type = item.type;
  const healingItem = item.system?.traits?.value?.includes('healing');

  let extraFields = '';
  let showBaseValue = true;

  if (type === 'weapon' || type === 'shield') {
    showBaseValue = false;
    extraFields += `
      <label>${loc('pf2e-threat-tracker.threatConfig.attackValue')}:</label>
      <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">
      <label>${loc('pf2e-threat-tracker.threatConfig.damageValue')}:</label>
      <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
  }
  if (type === 'shield') {
    extraFields += `
      <label>${loc('pf2e-threat-tracker.threatConfig.raiseValue')}:</label>
      <input type="number" name="threatRaiseValue" value="${currentRaise}" style="width:100%;">`;
  }
  if (type === 'spell') {
    const hasDamage = !!item.system.damage && Object.keys(item.system.damage).length > 0;
    const isAttack = item.system.defense?.passive?.statistic === 'ac';
    if (isAttack) {
      showBaseValue = false;
      extraFields += `
        <label>${loc('pf2e-threat-tracker.threatConfig.attackValue')}:</label>
        <input type="number" name="threatAttackValue" value="${currentAttack}" style="width:100%;">`;
    }
    if (hasDamage && !healingItem) {
      extraFields += `
        <label>${loc('pf2e-threat-tracker.threatConfig.damageValue')}:</label>
        <input type="number" name="threatDamageValue" value="${currentDamage}" style="width:100%;">`;
    }
  }
  if (healingItem) {
    showBaseValue = false;
    extraFields += `
      <label>${loc('pf2e-threat-tracker.threatConfig.healValue')}:</label>
      <input type="number" name="threatHealValue" value="${currentHeal}" style="width:100%;">`;
  }

  new foundry.applications.api.DialogV2({
    window: { title: loc('pf2e-threat-tracker.threatConfig.title') },
    form: true,
    content: `
      <form>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <label>${loc('pf2e-threat-tracker.threatConfig.slug')}:</label>
          <input type="text" name="slug" value="${slug}" style="width:100%;" readonly>
          <label>${loc('pf2e-threat-tracker.threatConfig.type')}:</label>
          <input type="text" name="type" value="${type}" style="width:100%;" readonly>
          ${showBaseValue ? `
            <label>${loc('pf2e-threat-tracker.threatConfig.value')}:</label>
            <input type="number" name="threatValue" value="${currentValue}" style="width:100%;">
          ` : ''}
          ${extraFields}
          <label>${loc('pf2e-threat-tracker.threatConfig.mode')}:</label>
          <select name="mode">
            <option value="apply" ${currentMode === 'apply' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeApply')}</option>
            <option value="reduce" ${currentMode === 'reduce' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeReduce')}</option>
          </select>
        </div>
      </form>`,
    buttons: [
      { action: 'save', label: loc('pf2e-threat-tracker.threatConfig.save'), default: true },
      { action: 'cancel', label: loc('pf2e-threat-tracker.threatConfig.cancel') },
    ],
    submit: async function (result, dialog) {
      if (result !== 'save') return;

      const formEl = dialog.element.querySelector('form');
      if (!formEl) return;

      const fd = new foundry.applications.ux.FormDataExtended(formEl);
      const data = fd.object ?? {};

      const saveOrUnset = async (key, value) => {
        if (value && value !== 0) await item.setFlag(MODULE_ID, key, value);
        else await item.unsetFlag(MODULE_ID, key);
      };

      await saveOrUnset('threatItemValue', parseInt(data.threatValue) || 0);
      await item.setFlag(MODULE_ID, 'threatItemMode', data.mode);
      await item.setFlag(MODULE_ID, 'threatItemSlug', data.slug);
      await item.setFlag(MODULE_ID, 'threatItemType', data.type);

      if (data.threatAttackValue !== undefined) await saveOrUnset('threatAttackValue', parseInt(data.threatAttackValue) || 0);
      if (data.threatDamageValue !== undefined) await saveOrUnset('threatDamageValue', parseInt(data.threatDamageValue) || 0);
      if (data.threatRaiseValue !== undefined)  await saveOrUnset('threatRaiseValue', parseInt(data.threatRaiseValue) || 0);
      if (data.threatHealValue !== undefined)   await saveOrUnset('threatHealValue', parseInt(data.threatHealValue) || 0);

      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.saved'));
    },
  }).render({ force: true });
}

// ─── Actor threat dialog ──────────────────────────────────────────

async function openActorThreatDialog(actor) {
  const feats = actor.items.filter(i =>
    i.type === 'feat'
    && (i.system.actions?.value !== null || ['reaction', 'free'].includes(i.system.actionType?.value))
  );

  const skillActions = [];
  let content = `<form><div class="scrolltable" style="max-height:600px; min-width:500px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:8px;">`;

  // Skill actions
  content += `<h2 style="text-align:center;">${loc('pf2e-threat-tracker.SkillActions')}</h2>`;
  for (const [skill, actions] of Object.entries(skillActionsData)) {
    const skillRank = actor.system.skills?.[skill]?.rank ?? 0;
    const filtered = actions.filter(a => skillRank >= a.minRank);
    if (!filtered.length) continue;

    content += `<h3 style="margin-top:8px; border-bottom:1px solid #888;">
      ${loc('PF2E.Skill.' + skill.charAt(0).toUpperCase() + skill.slice(1))}
    </h3>`;

    for (const act of filtered) {
      skillActions.push(act);
      const val = await actor.getFlag(MODULE_ID, `skillActionValue.${act.slug}`) ?? 0;
      const mode = await actor.getFlag(MODULE_ID, `skillActionMode.${act.slug}`) ?? 'apply';

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

  // Feats
  if (feats.length) {
    const featCategories = [
      'ancestry', 'general', 'class', 'bonus', 'skill', 'calling',
      'classfeature', 'curse', 'deityboon', 'pfsboon', 'ancestryfeature',
    ];

    content += `<h2 style="margin-top:12px; text-align:center;">${loc('pf2e-threat-tracker.Features')}</h2>`;

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
            <span style="overflow:hidden; text-overflow:ellipsis;">${feat.name}</span>
            <input type="number" name="${slug}-value" value="${val}" style="width:60px;" />
            <select name="${slug}-mode">
              <option value="apply" ${mode === 'apply' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeApply')}</option>
              <option value="reduce" ${mode === 'reduce' ? 'selected' : ''}>${loc('pf2e-threat-tracker.threatConfig.modeReduce')}</option>
            </select>
          </div>`;
      }
    }
  }

  content += `</div></form>`;

  new foundry.applications.api.DialogV2({
    window: { title: loc('pf2e-threat-tracker.threatConfig.title') },
    content,
    buttons: [
      { action: 'save', label: loc('pf2e-threat-tracker.threatConfig.save'), default: true },
      { action: 'cancel', label: loc('pf2e-threat-tracker.threatConfig.cancel') },
    ],
    submit: async function (result, dialog) {
      if (result !== 'save') return;
      const formEl = dialog.element.querySelector('form');
      const fd = new foundry.applications.ux.FormDataExtended(formEl);

      for (const act of skillActions) {
        const val = parseInt(fd.get(`${act.slug}-value`)) || 0;
        const mode = fd.get(`${act.slug}-mode`);
        if (val !== 0) {
          await actor.setFlag(MODULE_ID, `skillActionValue.${act.slug}`, val);
          await actor.setFlag(MODULE_ID, `skillActionMode.${act.slug}`, mode);
        } else {
          await actor.unsetFlag(MODULE_ID, `skillActionValue.${act.slug}`);
          await actor.unsetFlag(MODULE_ID, `skillActionMode.${act.slug}`);
        }
      }

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

      ui.notifications.info(loc('pf2e-threat-tracker.threatConfig.saved'));
    },
  }).render({ force: true });
}
