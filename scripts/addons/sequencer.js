
const MODULE = 'pf2e-threat-tracker';

const getLoggingMode = () => globalThis.game?.settings?.get?.(MODULE, 'loggingMode') ?? 'none';

const log = {
  all:  (...a) => { if (getLoggingMode() === 'all') console.log(...a); },
  min:  (...a) => { const m = getLoggingMode(); if (m === 'minimal' || m === 'all') console.log(...a); },
  warn: (...a) => { if (getLoggingMode() !== 'none') console.warn(...a); }
};

Hooks.on('controlToken', async(token, controlled) => {
    const combat = game.combats.active
        if (!combat) return;
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE, 'enableTopThreatEffect')) return;
    if (!controlled) {
        Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });
        return;
    }

    if (token.actor.hasPlayerOwner) return;

    const threatTable = token.document.flags[MODULE]?.threatTable ?? {};
    log.all(`[${MODULE}] threatTable for ${token.name}:`, threatTable);
    const threatsInOrder = Object.entries(threatTable).toSorted((a, b) => b[1].value - a[1].value);
    log.all(`[${MODULE}] Threats in order:`, threatsInOrder);
    const topEntry = threatsInOrder?.[0];
    if (!topEntry) {
        log.all(`[${MODULE}] No threat entries found for applying a Sequencer effect.`);
        return;
    }

    const [topTokenId, threatData] = topEntry;
    const topThreatValue = threatData?.value;

    if (!topTokenId || !topThreatValue) {
        log.all(`[${MODULE}] The token or threat level could not be determined.`);
        return;
    }

    if (!topTokenId)  return;

    const topToken = canvas.tokens.get(topTokenId);
    if (!topToken) {
        log.all(`[${MODULE}] The token with ID ${topTokenId} was not found on the canvas.`);
        return;
    }

    // Gracias Chasarooni te quiero mucho
    Sequencer.EffectManager.endEffects({ name: `top-threat-${token.id}` });

    const effectPath = game.settings.get(MODULE, 'topThreatEffect');

    const seq = new Sequence();

    const effectType = game.settings.get(MODULE, 'topThreatEffectType');

    if (effectType === 'ray') {
    seq.effect()
      .file(effectPath)
      .attachTo(token)
      .stretchTo(topToken)
      .persist()
      .fadeIn(200)
      .fadeOut(200)
      .name(`top-threat-${token.id}`)
      .forUsers([game.user.id])
      .belowTokens(false);
    } else {
    seq.effect()
      .file(effectPath)
      .attachTo(topToken)
      .scaleToObject(0.4)
      .fadeIn(500)
      .fadeOut(250)
      .persist()
      .anchor({ x: 0.5, y: 1.5 })
      .name(`top-threat-${token.id}`)
      .forUsers([game.user.id]);
  }
  seq.play();
});
