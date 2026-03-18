/**
 * @module core/logger
 * Centralised logging with three verbosity levels: none, minimal, all.
 * Reads the 'loggingMode' setting once per call to stay in sync.
 */

import { MODULE_ID } from './constants.js';

function _mode() {
  try {
    return game.settings.get(MODULE_ID, 'loggingMode') ?? 'none';
  } catch {
    return 'none';
  }
}

const PREFIX = `[${MODULE_ID}]`;

export const Logger = {
  /** Logs only when mode === 'all'. */
  debug(...args) {
    if (_mode() === 'all') console.log(PREFIX, ...args);
  },

  /** Logs when mode is 'minimal' or 'all'. */
  info(...args) {
    const m = _mode();
    if (m === 'minimal' || m === 'all') console.log(PREFIX, ...args);
  },

  /** Logs when mode is anything other than 'none'. */
  warn(...args) {
    if (_mode() !== 'none') console.warn(PREFIX, ...args);
  },

  /** Always logs — for critical errors. */
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
