const MODULE = 'pf2e-threat-tracker';

import { ThreatConfigApp } from "./ui/option-menu.js";
import { skillActionsData } from "./data/skill-actions.js";

Hooks.once('init', async() => {
    console.log(`[${MODULE}] Inicializado`);

    game.settings.registerMenu("pf2e-threat-tracker", "threatConfigMenu", {
        name: "Threat Configuration",
        label: "⚙️ Configure Threat",
        hint: "Open the Threat configuration panel",
        icon: "fas fa-user-shield",
        type: ThreatConfigApp,
        restricted: true
    });

    game.settings.register(MODULE, 'xFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.xFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.xFactor.hint"),
        scope: 'client',
        config: false,
    default:
        100,
        type: Number
    });

    game.settings.register(MODULE, 'yFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.yFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.yFactor.hint"),
        scope: 'client',
        config: false,
    default:
        50,
        type: Number
    });

    game.settings.register(MODULE, 'decayEnabled', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.decayEnabled.hint"),
        scope: 'world',
        config: false,
    default:
        true,
        type: Boolean
    });

    game.settings.register(MODULE, 'decayFactor', {
        name: game.i18n.localize("pf2e-threat-tracker.Settings.decayFactor.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.Settings.decayFactor.hint"),
        scope: 'world',
        config: false,
        type: Number,
        range: {
            min: 0,
            max: 1,
            step: 0.01
        },
    default:
        0.5,
        onChange: value => {
            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.decayFactor"));
            location.reload();
        }
    })
    game.settings.register(MODULE, 'baseAttackThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseAttackThreat.hint"),
        scope: 'world',
        config: false,
        type: Number,
    default:
        10
    });

    game.settings.register(MODULE, 'attackThreatMode', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.attackThreatMode.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.attackThreatMode.hint"),
        scope: 'world',
        config: false,
        type: Boolean,
    default:
        false
    });

    game.settings.register(MODULE, 'baseSpellThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseSpellThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseSpellThreat.hint"),
        scope: 'world',
        config: false,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'threatPerSpellRank', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.threatPerSpellRank.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.threatPerSpellRank.hint"),
        scope: 'world',
        config: false,
    default:
        10,
        type: Number
    });

    game.settings.register(MODULE, 'baseHealThreat', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.baseHealThreat.hint"),
        scope: 'world',
        config: false,
    default:
        30,
        type: Number
    });

    game.settings.register(MODULE, 'skillBase', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.skillBase.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.skillBase.hint"),
        scope: 'world',
        config: false,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'skillCritBonus', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.skillCritBonus.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.skillCritBonus.hint"),
        scope: 'world',
        config: false,
    default:
        20,
        type: Number
    });

    game.settings.register(MODULE, 'enableThreatPanel', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatPanel.hint"),
        scope: 'client',
        config: false,
    default:
        true,
        type: Boolean,
        onChange: () => {
            ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.enableThreatPanel.updated"));
            location.reload();
        }
    });

    game.settings.register(MODULE, 'enableTopThreatEffect', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.enableTopThreatEffect.hint"),
        scope: "client",
        config: false,
    default:
        true,
        type: Boolean
    });

    game.settings.register(MODULE, 'topThreatEffect', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.topThreatEffect.hint"),
        scope: 'world',
        config: false,
    default:
        'jb2a.icon.skull.dark_red',
        type: String
    });

    for (const [skill, actions] of Object.entries(skillActionsData)) {
        for (const act of actions) {
            game.settings.register(MODULE, `globalSkillActionValue.${act.slug}`, {
                scope: "world",
                config: false,
                type: Number,
                default: 0
            });
            game.settings.register(MODULE, `globalSkillActionMode.${act.slug}`, {
                scope: "world",
                config: false,
                type: String,
                default: "apply"
            });
        }
    }

    game.settings.register(MODULE, "effectData", {
        scope: "world",
        config: false,
        type: Object,
    default: {}
    });

    
    game.settings.register(MODULE, 'enableThreatFromEffects', {
        name: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatFromEffects.name"),
        hint: game.i18n.localize("pf2e-threat-tracker.settings.enableThreatFromEffects.hint"),
        scope: "client",
        config: false,
    default:
        true,
        type: Boolean
    });


    game.settings.register(MODULE, 'effectExcludedPacks', {
      name: game.i18n.localize("pf2e-threat-tracker.settings.effectExcludedPacks.name"),  
      hint: game.i18n.localize("pf2e-threat-tracker.settings.effectExcludedPacks.hint"),  
      scope: 'world',
      config: false,
      type: String,
      default: 'Divine Intercessions, Pathfinder Society Boons, Bestiary Effects, Campaign Effects, Kingmaker Features'
    });

    game.settings.register(MODULE, 'panelTheme', {
      name: game.i18n.localize("pf2e-threat-tracker.Settings.panelTheme.name"),
      hint: game.i18n.localize("pf2e-threat-tracker.Settings.panelTheme.name"),
      scope: 'client',
      config: false,
      type: String,
      choices: {
        blueNeon: "pf2e-threat-tracker.Settings.panelTheme.blueNeon",
        redNeon: "pf2e-threat-tracker.Settings.panelTheme.redNeon",
        dark: "pf2e-threat-tracker.Settings.panelTheme.dark",
        darkGeoBlack: "pf2e-threat-tracker.Settings.panelTheme.darkGeoBlack",
        darkGeoWhite: "pf2e-threat-tracker.Settings.panelTheme.darkGeoWhite",
        fargo: "pf2e-threat-tracker.Settings.panelTheme.fargo",
        sciFiBlue: "pf2e-threat-tracker.Settings.panelTheme.sciFiBlue",
        sciFiRed: "pf2e-threat-tracker.Settings.panelTheme.sciFiRed",
        white: "pf2e-threat-tracker.Settings.panelTheme.white"
      },
      default: 'dark',
            onChange: () => {
                ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.threatPanelStyle.noCombat"));
            }
    });

    game.settings.register(MODULE, 'panelOpacity', {
      name: game.i18n.localize("pf2e-threat-tracker.Settings.panelOpacity.name"),
      hint: game.i18n.localize("pf2e-threat-tracker.Settings.panelOpacity.name"),
      scope: 'client',
      config: false,
      type: Number,
      range: { min: 0.3, max: 1.0, step: 0.1 },
      default: 1,
            onChange: () => {
                ui.notifications.info(game.i18n.localize("pf2e-threat-tracker.notifications.threatPanelStyle.noCombat"));
            }
    });

    game.settings.register(MODULE, 'panelMinimized', {
      name: game.i18n.localize("pf2e-threat-tracker.Settings.panelMinimized.name"),
      scope: 'client',
      config: false,
      type: Boolean,
      default: false
    });


    game.settings.register(MODULE, 'panelShowBorders', {
      scope: 'client', config: false, type: Boolean, default: true
    });

    game.settings.register(MODULE, 'panelBgImage', {
      scope: 'client', config: false, type: String, default: ''
    });

    game.settings.register(MODULE, 'loggingMode', {
    name: game.i18n.localize("pf2e-threat-tracker.Settings.loggingMode.name"),
    hint: game.i18n.localize("pf2e-threat-tracker.Settings.loggingMode.hint"),
    scope: 'client',
    config: true,
    type: String,
    choices: {
        none: "pf2e-threat-tracker.Settings.loggingMode.none",
        minimal: "pf2e-threat-tracker.Settings.loggingMode.minimal",
        all: "pf2e-threat-tracker.Settings.loggingMode.all"
    },
    default: 'none'
});

    console.log(`[${MODULE}] Settings registrados:`);
    [...game.settings.settings.entries()]
    .filter(([key]) => key.startsWith(`${MODULE}.`))
    .forEach(([key, setting]) => {
        console.log(`→ ${key}: type=${setting.type?.name}, default=${setting.default}, config=${setting.config}`);
    });

});


