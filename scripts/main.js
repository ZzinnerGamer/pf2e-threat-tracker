/**
 * @file main.js
 * Single entry point for pf2e-threat-tracker v2.0.0.
 * Orchestrates module initialisation, settings registration, and hook setup.
 */

import { MODULE_ID } from './core/constants.js';
import { registerSettings } from './core/settings.js';
import { registerHooks, setPanelUpdateFn } from './core/hooks.js';
import { updateFloatingPanel } from './ui/threat-panel.js';
import { registerItemConfigHooks } from './ui/item-config.js';
import { registerSequencerHooks } from './addons/sequencer.js';

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] v2.0.0 — Initialising`);
  registerSettings();
  console.log(`[${MODULE_ID}] Settings registered`);
});

Hooks.once('ready', () => {
  console.log(`[${MODULE_ID}] Ready — registering hooks`);

  // Wire the panel update function into the hooks system
  setPanelUpdateFn(updateFloatingPanel);

  // Register all gameplay hooks
  registerHooks();

  // Register item/actor sheet hooks
  registerItemConfigHooks();

  // Register Sequencer addon (if available)
  registerSequencerHooks();

  console.log(`[${MODULE_ID}] v2.0.0 — Fully loaded`);
});
