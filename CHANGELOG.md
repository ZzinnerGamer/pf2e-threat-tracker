# CHANGELOG

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
