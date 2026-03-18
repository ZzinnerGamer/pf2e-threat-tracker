/**
 * @module core/constants
 * Single source of truth for module-wide constants.
 */

export const MODULE_ID = 'pf2e-threat-tracker';

/** Skills whose checks count as attack-like for threat purposes. */
export const ATTACK_SKILLS = new Set([
  'disarm', 'escape', 'force-open', 'grapple',
  'reposition', 'shove', 'trip',
]);

/** All skill actions that can generate threat via skill checks. */
export const SKILL_CHECK_SLUGS = new Set([
  'seek', 'sense-motive', 'balance', 'maneuver-in-flight', 'squeeze',
  'tumble-through', 'identify-magic', 'recall-knowledge', 'climb',
  'disarm', 'force-open', 'grapple', 'high-jump', 'long-jump',
  'reposition', 'shove', 'swim', 'trip', 'create-a-diversion', 'feint',
  'request', 'demoralize', 'administer-first-aid', 'treat-poison',
  'command-an-animal', 'perform', 'hide', 'sneak', 'disable-device',
  'palm-an-object', 'pick-a-lock', 'steal',
]);

/** Available panel themes mapped to display names. */
export const PANEL_THEMES = {
  dark:         'Dark',
  white:        'White',
  blueNeon:     'Blue Neon',
  redNeon:      'Red Neon',
  darkGeoBlack: 'Dark Geo Black',
  darkGeoWhite: 'Dark Geo White',
  fargo:        'Fargo',
  proFantasy:   'Pro Fantasy',
  rpgGame:      'RPG Game',
  invisible:    'Invisible',
  sciFiBlue:    'Sci-Fi Blue',
  sciFiRed:     'Sci-Fi Red',
};

/** All theme CSS class names (for removal during theme switches). */
export const ALL_THEME_CLASSES = Object.keys(PANEL_THEMES);
