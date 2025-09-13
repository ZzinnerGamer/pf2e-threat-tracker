# CHANGELOG

# [1.4.0] - 2025-9-13

## Added

* Threat to target only option
  * If this option is enabled, the threat of attacks, skills and actions will target only the user targeted tokens
* Hide Sequencer settings if Sequencer is not enabled

## Fixed

* Attack spells threat will only apply on actual attacks, not spell cards.
* Sequencer effect type will not save its visual configuration, the configuration itself was saved but visually, reopening the menu, the setting was set on `Marker`.
* Some typos in code

# [1.3.1] - 2025-9-9

## Added
* Moar FR localization [@rectulo]
* New sequencer effect type "ray"

## Fixed
* Menu opening on v12

# [1.3.0] - 2025-9-7

## Added
* New Themes
  * Invisible
  * Pro Fantasy
  * RPG Game  
<img width="369" height="590" alt="image" src="https://github.com/user-attachments/assets/82e88f7f-2f69-453f-b983-ec355d818609" />
<img width="501" height="614" alt="image" src="https://github.com/user-attachments/assets/cf6cd269-66f9-41f5-b02e-3eac8be22c6e" />
<img width="391" height="607" alt="image" src="https://github.com/user-attachments/assets/1856754e-acd3-48e9-95db-3832a531b68c" />

* Added Unconscious Threat Reduction
  * This value option is percentual reduction of thre own threat value if a ally PC/NPC get the Unconscious condition
<img width="645" height="118" alt="image" src="https://github.com/user-attachments/assets/e6e77691-98bb-4c65-bce0-e4296f10a1ce" />

# [1.2.1] - 2025-9-6

## Added
* Max visible threat cards on the threat panel
* Highlight selected token own threat card and reduce visibility of others

# [1.2.0] - 2025-9-5

## Added
* Robust detection of “dead/defeated” by combining PF2e conditions (`dead`, `unconscious`) and `defeated` from the Combat Tracker.
* Panel interaction UX:
  * **Hover** over **title** of each card → highlights the token on the canvas.
  * **Click** on and title → selects the token (multi-select with Shift/Ctrl/⌘).

## Changed
* Floating Panel:
  * Filters **ignored/defeated tokens** at the card level.
  * Listeners on card title for hover/click (in addition to rows).

## Fixed
* Displaying/dragging **ignored/defeated** tokens is avoided; automatic cleanup of their Threat Table.
* Ensure Threat Panel clears all tokens flags after every combat encounter.

# [1.1.1] - 2025-8-30

Fixed logging

# [1.1.0] - 2025-8-30

* Remade IWR (Immunity/Weakness/Resistance) calculation
* Added IWR Toggle on the settings menu
* Added French Localization (@rectulo)
* Added logging toggle (None/Minimum/All)
* Fixed themes assets downloading
* Reduced logging
* Expanded localization

# [1.0.0] - 2025-8-29

## 🚀 Main changes

* **Complete module restructuring**: the code has been reorganized into folders (`scripts/`, `logic/`, `ui/`, `data/`), improving maintainability and facilitating future expansions.
* **New configuration system**: there is now a dedicated options menu within Foundry to enable, disable, and customize the threat tracker's behavior.
* **Improved floating panel**:

* It can now be moved freely around the screen.
  * Includes visual themes (dark, light, etc.) and opacity adjustment.
  * Better aesthetic integration thanks to the new `threat-panel.css` file.
* **New preset system**: added a sample file (`MMO-preset.json` (WIP)) to load predefined threat configurations.

## 🎮 User experience

* **More intuitive interface**:

  * New menus:

    * **Advanced settings menu** (settings-menu.hbs).
    * **Custom threat menu** with quick options.
  * Revised and expanded English and Spanish localization.
* **Improved visual feedback**: the panel displays threat values more clearly, with icons and visual indicators.

## ⚙️ Internal changes

* **Before**: a single large file (`script.js`) contained all the logic.
* **Now**:

* `logic/` → threat calculations and utilities.
  * `ui/` → menus and graphical interfaces.
  * `addons/` → optional compatibility (e.g., integration with *Sequencer*).

This makes bugs easier to locate and future development faster.

## 🛠️ Fixes and improvements

* Fixed localization issues.
* Removed old configuration files (`action-threats.json`, `effects-threats.json`, `trait-threat.json`, `trait-vulnerability.json`) that were rigidly defined: now everything is managed from interactive menus.
* Optimized threat loading to make the system faster and more stable.

---

# ✅ TL;DR

* The module is now easier to use: movable, configurable floating panel with improved design.
* New menus to change threat rules without manually editing files.
* Major code refactoring.
* Old JSON files removed and replaced with presets and dynamic menus.
 
## [Beta5.1.1] - 2025-8-15

* Update compatibility with [Cleaner Sheet Title Bar](https://github.com/MiahNelah/cleaner-sheet-title-bar) module

## [Beta5.1] - 2025-8-11

### Fixed
* Attacks were not applying threat correctly

## [Beta5] - 2025-8-11

### Fixed
* Attacks were not applying threat correctly

## [Beta5] - 2025-8-11

### ✨ Gameplay Improvements

* **Smarter detection of actions and spells:** The system now better identifies when an action comes from an item, skill, spell, weapon, or feat.
* **Custom threat per item and actor:** You can now set specific threat values for items or abilities, and the system will use these instead of the global ones.
* **New “reduce” mode:** If an action is configured as reduce threat instead of apply, it will, certainly, reduce the threat based on normal calculations.

### 🛠 Threat Calculation Adjustments

* **More accurate application of immunity, resistance, and weakness modifiers:** Immunities and resistances now reliably block threat, while weaknesses proportionally increase it.

### 🧠 Event Detection and Handling

* **Improved HP tracking:** The script now more consistently stores and updates hit points before damage or healing is applied.
* **Better support for different action types:** It now correctly responds to attacks, spells, healing, saving throws, and skill maneuvers.

### 🐛 Fixes

* Prevents applying threat when the target is immune to the action.
* Fixes inconsistencies when calculating threat for repeated skill actions.
* Resolves cases where threat was applied twice for the same event.
* Added missing localization

## [Beta4] - 2025-8-7
### Taunts
✅ New taunt threat calculation based on:
- Action-relevant traits
- Action slug (demoralize, etc.)
- Bonuses for result (success, critical success) and traits
- TauntBase added as a separately configurable setting.

### Heals
- Revised calculation of threat generated by healing:
- The preHP of the healed target is obtained..

### Spellcasting
🔄 Improved spell detection:
- Correctly detects spellSlug and rank.
- Ignores spells with the healing trait.

### Attacks and Maneuvers
- Improved detection of skill attacks and new, more comprehensive skill checks.
- Threat adjustment by result (failure, success, critical success)
- Support for modifying threat with resistances, vulnerabilities, and immunities.


# Fixed
- NonGMs cannot update threat menu, how could i didnt get this before? i dont know

## [Beta3] - 2025-8-2

New Features
* Non-offensive spells now generates threat plus spells generate threat to all creatures in combat
* All Effects from Compendium.pf2e.equipment-effects, Compendium.pf2e.feat-effects and Compendium.pf2e.spell-effects are parsed (might revisit every single one of them to set the correct values)

Fixed
* Saving module configuration actually works
* Floating Panel position configuration
* Vulnerabilities by trait option now shows the document

## [Beta2.1] - 2025-8-1
* Automated Releases by @ChasarooniZ in https://github.com/ZzinnerGamer/pf2e-threat-tracker/pull/1
* Actually support for non skill actions

## [beta2] - 2025-8-1
UPDATE YAY

Now we have this:

- Remove threat increase per check outcome for threat increase from damage dealt:
Now if a spell or weapon attack deals damage to a target, the threat is calculated based on the whole damage dealt instead of grade of success.

- Support for offensive skill-checks:
Maneuvers like trip, shove, grapple, disarm, etc. now generate threat, even though they are not standard attack-rolls.

- Full handling of skill-attack:
Added suppor for skill actions. A new threat calculation based on the skill outcome (failure, success, etc.) and the actor's level.

- Dynamic distance-based threat multiplier:
A new function adjusts generated threat based on the distance between the source token and enemies. Applies to attacks, healing, and taunts.

- New setting: decayFactor:
Determine how quickly threat values converge towards the average each round. 0 forces all threats to equalize to the average, 1 applies decay only without additional convergence.

---
**_Special_**
BATTLECRY! IS OUT AND GUARDIAN IS COMPATIBLE WITH THIS WOOOHOOO

- Add Guardian class actions


## [beta1] - 2025-7-29
Initial release
