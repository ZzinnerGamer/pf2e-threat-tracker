
const MODULE = 'pf2e-threat-tracker';

Hooks.on('controlToken', async(token, controlled) => {
    const combat = game.combats.active
        if (!combat) {
        return;
    }
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE, 'enableTopThreatEffect'))
        return;
    if (!controlled) {
        Sequencer.EffectManager.endEffects({
            name: `top-threat-${token.id}`
        });
        return;
    }

    if (token.actor.hasPlayerOwner)
        return;

    const threatTable = token.document.flags[MODULE]?.threatTable ?? {};
    console.log(`[${MODULE}] threatTable para ${token.name}:`, threatTable);
    const threatsInOrder = Object.entries(threatTable).toSorted((a, b) => b[1].value - a[1].value);
    console.log(`[${MODULE}] Threats ordenados:`, threatsInOrder);
    const topEntry = threatsInOrder?.[0];
    if (!topEntry) {
        console.log(`[${MODULE}] No hay entradas en threatTable, abortando.`);
        return;
    }

    const [topTokenId, threatData] = topEntry;
    const topThreatValue = threatData?.value;

    if (!topTokenId || !topThreatValue) {
        console.log(`[${MODULE}] No se pudo determinar el token o la cantidad de amenaza.`);
        return;
    }

    if (!topTokenId)
        return;

    const topToken = canvas.tokens.get(topTokenId);
    if (!topToken) {
        console.log(`[${MODULE}] No se encontró el token con ID ${topTokenId} en el canvas.`);
        return;
    }

    // Gracias Chasarooni te quiero mucho
    Sequencer.EffectManager.endEffects({
        name: `top-threat-${token.id}`
    });

    const effectPath = game.settings.get(MODULE, 'topThreatEffect');
    console.log(`[${MODULE}] Aplicando efecto '${effectPath}' a ${topToken.name} (${topToken.id}) con amenaza ${topThreatValue}`);

    new Sequence()
    .effect()
    .file(effectPath)
    .attachTo(topToken)
    .scaleToObject(0.4)
    .fadeIn(500)
    .fadeOut(250)
    .persist()
    .anchor({
        x: 0.5,
        y: 1.5
    })
    .name(`top-threat-${token.id}`)
    .forUsers([game.user.id])
    .play();
});