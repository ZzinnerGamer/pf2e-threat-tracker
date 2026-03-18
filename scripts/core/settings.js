/**
 * @module core/settings
 * Registers all module settings. Called once during 'init'.
 */

import { MODULE_ID, PANEL_THEMES } from './constants.js';
import { skillActionsData } from '../data/skill-actions.js';
import { ThreatConfigApp } from '../ui/config-app.js';

/** Groups of setting keys for the configuration UI tabs. */
export const SETTINGS_GROUPS = {
  General: [
    'enableThreatPanel', 'xFactor', 'yFactor',
    'decayEnabled', 'decayFactor',
  ],
  Threat: [
    'attackThreatMode', 'applyThreatTargetOnly',
    'baseAttackThreat', 'baseSpellThreat', 'threatPerSpellRank',
    'baseHealThreat', 'skillBase', 'skillCritBonus',
    'enableThreatFromEffects', 'enableIWR', 'unconsciousThreatPercent',
  ],
  Sequencer: [
    'topThreatEffect', 'topThreatEffectType', 'enableTopThreatEffect',
  ],
  Appearance: [
    'panelTheme', 'panelOpacity', 'maxVisibleCards',
  ],
};

/**
 * Helper: game.i18n.localize with fallback.
 */
const loc = (key) => game.i18n?.localize(key) ?? key;

/**
 * Shorthand for registering a setting.
 */
function reg(key, opts) {
  game.settings.register(MODULE_ID, key, opts);
}

/**
 * Register all settings for the module.
 */
export function registerSettings() {
  // ── Menu entry ──
  // Foundry requires a class reference at registration time, but ThreatConfigApp
  // imports SETTINGS_GROUPS from this file (circular). Solution: a thin wrapper
  // that inherits ApplicationV2 and delegates to the real app on render.
  const ThreatConfigShim = class extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: 'tt-config-shim',
      tag: 'div',
      window: { title: 'PF2E Threat Tracker', icon: 'fas fa-user-shield' },
      position: { width: 1, height: 1 },
    };

    async _renderHTML() { return '<div></div>'; }

    _replaceHTML(result, content) {
      content.innerHTML = result;
      // Immediately close this shim and open the real app
      requestAnimationFrame(async () => {
        await this.close({ animate: false });
        const { ThreatConfigApp } = await import('../ui/config-app.js');
        new ThreatConfigApp().render(true);
      });
      return content;
    }
  };

  game.settings.registerMenu(MODULE_ID, 'threatConfigMenu', {
    name: 'Threat Configuration',
    label: '⚙️ Configure Threat',
    hint: 'Open the Threat configuration panel',
    icon: 'fas fa-user-shield',
    type: ThreatConfigShim,
    restricted: true,
  });

  // ── General ──
  reg('xFactor', {
    name: loc('pf2e-threat-tracker.settings.xFactor.name'),
    hint: loc('pf2e-threat-tracker.settings.xFactor.hint'),
    scope: 'client', config: false, type: Number, default: 100,
  });
  reg('yFactor', {
    name: loc('pf2e-threat-tracker.settings.yFactor.name'),
    hint: loc('pf2e-threat-tracker.settings.yFactor.hint'),
    scope: 'client', config: false, type: Number, default: 50,
  });
  reg('decayEnabled', {
    name: loc('pf2e-threat-tracker.settings.decayEnabled.name'),
    hint: loc('pf2e-threat-tracker.settings.decayEnabled.hint'),
    scope: 'world', config: false, type: Boolean, default: true,
  });
  reg('decayFactor', {
    name: loc('pf2e-threat-tracker.settings.decayFactor.name'),
    hint: loc('pf2e-threat-tracker.settings.decayFactor.hint'),
    scope: 'world', config: false, type: Number, default: 0.5,
    range: { min: 0, max: 1, step: 0.01 },
  });

  // ── Threat values ──
  reg('baseAttackThreat', {
    name: loc('pf2e-threat-tracker.settings.baseAttackThreat.name'),
    hint: loc('pf2e-threat-tracker.settings.baseAttackThreat.hint'),
    scope: 'world', config: false, type: Number, default: 10,
  });
  reg('attackThreatMode', {
    name: loc('pf2e-threat-tracker.settings.attackThreatMode.name'),
    hint: loc('pf2e-threat-tracker.settings.attackThreatMode.hint'),
    scope: 'world', config: false, type: Boolean, default: false,
  });
  reg('baseSpellThreat', {
    name: loc('pf2e-threat-tracker.settings.baseSpellThreat.name'),
    hint: loc('pf2e-threat-tracker.settings.baseSpellThreat.hint'),
    scope: 'world', config: false, type: Number, default: 20,
  });
  reg('threatPerSpellRank', {
    name: loc('pf2e-threat-tracker.settings.threatPerSpellRank.name'),
    hint: loc('pf2e-threat-tracker.settings.threatPerSpellRank.hint'),
    scope: 'world', config: false, type: Number, default: 10,
  });
  reg('baseHealThreat', {
    name: loc('pf2e-threat-tracker.settings.baseHealThreat.name'),
    hint: loc('pf2e-threat-tracker.settings.baseHealThreat.hint'),
    scope: 'world', config: false, type: Number, default: 30,
  });
  reg('skillBase', {
    name: loc('pf2e-threat-tracker.settings.skillBase.name'),
    hint: loc('pf2e-threat-tracker.settings.skillBase.hint'),
    scope: 'world', config: false, type: Number, default: 20,
  });
  reg('skillCritBonus', {
    name: loc('pf2e-threat-tracker.settings.skillCritBonus.name'),
    hint: loc('pf2e-threat-tracker.settings.skillCritBonus.hint'),
    scope: 'world', config: false, type: Number, default: 20,
  });
  reg('enableThreatPanel', {
    name: loc('pf2e-threat-tracker.settings.enableThreatPanel.name'),
    hint: loc('pf2e-threat-tracker.settings.enableThreatPanel.hint'),
    scope: 'client', config: false, type: Boolean, default: true,
    onChange: () => {
      ui.notifications.info(loc('pf2e-threat-tracker.notifications.enableThreatPanel.updated'));
      location.reload();
    },
  });
  reg('enableThreatFromEffects', {
    name: loc('pf2e-threat-tracker.settings.enableThreatFromEffects.name'),
    hint: loc('pf2e-threat-tracker.settings.enableThreatFromEffects.hint'),
    scope: 'client', config: false, type: Boolean, default: true,
  });
  reg('enableIWR', {
    name: loc('pf2e-threat-tracker.settings.enableIWR.name'),
    hint: loc('pf2e-threat-tracker.settings.enableIWR.hint'),
    scope: 'client', config: false, type: Boolean, default: true,
  });
  reg('applyThreatTargetOnly', {
    name: loc('pf2e-threat-tracker.settings.applyThreatTargetOlny.name'),
    hint: loc('pf2e-threat-tracker.settings.applyThreatTargetOlny.hint'),
    scope: 'client', config: false, type: Boolean, default: true,
  });
  reg('unconsciousThreatPercent', {
    name: loc('pf2e-threat-tracker.settings.unconsciousThreatReduction.name'),
    hint: loc('pf2e-threat-tracker.settings.unconsciousThreatReduction.hint'),
    scope: 'client', config: false, type: Number, default: 50,
    range: { min: 0, max: 100, step: 10 },
  });

  // ── Sequencer ──
  reg('enableTopThreatEffect', {
    name: loc('pf2e-threat-tracker.settings.enableTopThreatEffect.name'),
    hint: loc('pf2e-threat-tracker.settings.enableTopThreatEffect.hint'),
    scope: 'client', config: false, type: Boolean, default: true,
  });
  reg('topThreatEffectType', {
    name: 'pf2e-threat-tracker.settings.topThreatEffectType.name',
    hint: 'pf2e-threat-tracker.settings.topThreatEffectType.hint',
    scope: 'world', config: false, type: String, default: 'marker',
    choices: {
      marker: 'pf2e-threat-tracker.settings.topThreatEffectType.marker',
      ray:    'pf2e-threat-tracker.settings.topThreatEffectType.ray',
    },
  });
  reg('topThreatEffect', {
    name: loc('pf2e-threat-tracker.settings.topThreatEffect.name'),
    hint: loc('pf2e-threat-tracker.settings.topThreatEffect.hint'),
    scope: 'world', config: false, type: String, default: 'jb2a.icon.skull.dark_red',
  });

  // ── Per-skill-action custom values ──
  // Instead of registering thousands of individual settings (one per skill slug),
  // we use a single Object setting as a key-value store.
  // This handles ANY action slug dynamically, including ones not in our static list.
  reg('globalSkillActionOverrides', {
    scope: 'world', config: false, type: Object, default: {},
  });

  // ── Item threat overrides ──
  // Stores custom threat values for compendium items (which can't have flags set).
  // Key: item UUID or slug, Value: { value, mode, attackValue, damageValue, healValue, ... }
  reg('itemThreatOverrides', {
    scope: 'world', config: false, type: Object, default: {},
  });

  // ── Effect data ──
  reg('effectData', {
    scope: 'world', config: false, type: Object, default: {},
  });
  reg('effectExcludedPacks', {
    name: loc('pf2e-threat-tracker.settings.effectExcludedPacks.name'),
    hint: loc('pf2e-threat-tracker.settings.effectExcludedPacks.hint'),
    scope: 'world', config: false, type: String,
    default: 'Divine Intercessions, Pathfinder Society Boons, Bestiary Effects, Campaign Effects, Kingmaker Features',
  });

  // ── Appearance ──
  reg('panelTheme', {
    name: loc('pf2e-threat-tracker.settings.panelTheme.name'),
    hint: loc('pf2e-threat-tracker.settings.panelTheme.hint'),
    scope: 'client', config: false, type: String, default: 'dark',
    choices: PANEL_THEMES,
  });
  reg('panelOpacity', {
    name: loc('pf2e-threat-tracker.settings.panelOpacity.name'),
    hint: loc('pf2e-threat-tracker.settings.panelOpacity.hint'),
    scope: 'client', config: false, type: Number, default: 1,
    range: { min: 0.3, max: 1.0, step: 0.1 },
  });
  reg('panelMinimized', {
    name: loc('pf2e-threat-tracker.settings.panelMinimized.name'),
    scope: 'client', config: false, type: Boolean, default: false,
  });
  reg('panelShowBorders', {
    scope: 'client', config: false, type: Boolean, default: true,
  });
  reg('panelBgImage', {
    scope: 'client', config: false, type: String, default: '',
  });
  reg('maxVisibleCards', {
    name: loc('pf2e-threat-tracker.settings.maxVisibleCards.name'),
    hint: loc('pf2e-threat-tracker.settings.maxVisibleCards.hint'),
    scope: 'client', config: false, type: Number, default: 4,
    range: { min: 1, max: 20, step: 1 },
  });

  // ── Logging ──
  reg('loggingMode', {
    name: loc('pf2e-threat-tracker.settings.loggingMode.name'),
    scope: 'client', config: true, type: String, default: 'none',
    choices: {
      none:    'pf2e-threat-tracker.settings.loggingMode.none',
      minimal: 'pf2e-threat-tracker.settings.loggingMode.minimal',
      all:     'pf2e-threat-tracker.settings.loggingMode.all',
    },
  });

  // ── Threat history (NEW) ──
  reg('threatHistory', {
    scope: 'world', config: false, type: Object, default: {},
  });
}
