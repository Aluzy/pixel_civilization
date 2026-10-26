/** Prices shown per line of the colony panel (it must stay narrow). */
const PRICES_PER_LINE = 4;

/** Harmony components, in the order of the simulation. */
const COMPONENTS = ['stabilité', 'durabilité', 'ordre spatial', 'savoir', 'bien-être'];

/**
 * Lines of the colony panel (from Simulation#describeColony): population, beds, stock, the
 * projects in progress with what they still need and who worked on them, the libraries, the
 * counter (treasury, jobs, prices), its filiation, expedition and relations with the other
 * colonies, its treasure and enclosure, and the colony's knowledge (known, written, lost).
 * @param {object | null} colony
 * @param {{ id: number, members: number }[]} [colonies] - All colonies, for the list.
 * @returns {string[]}
 */
export function formatColony(colony, colonies = []) {
  if (!colony || colony.members === 0) return [];
  const lines = [];
  if (colonies.length > 1) {
    const shown = colonies.filter((c) => c.members > 0).map((c) => `n°${c.id} (${c.members})`);
    lines.push(`Colonies : ${shown.join(' · ')}`);
  }
  const name = colonies.length > 1 || colony.parent >= 0 ? `Colonie n°${colony.id}` : 'Colonie';
  lines.push(
    `${name} : ${colony.members} individu(s) · ${colony.births} naissance(s) · ` +
      `${colony.deaths} mort(s)`,
  );
  if (colony.parent >= 0) {
    lines.push(`Fille de la colonie n°${colony.parent}, fondée le jour ${colony.foundedDay}`);
  }
  lines.push(
    `${colony.shelters} abri(s), ${colony.beds} lit(s)` +
      (colony.canalTiles ? ` · ${colony.canalTiles} case(s) de canal` : '') +
      (colony.fields ? ` · ${colony.fields} champ(s), ${colony.planted} plant(s)` : ''),
  );
  const h = colony.harmony;
  if (h && h.focus >= 0) {
    const parts = COMPONENTS.map((name, k) => `${name} ${h.components[k].toFixed(2)}`);
    lines.push(`Harmonie ${Math.round(h.score)} : ${parts.join(' · ')}`);
    lines.push(`Point faible visé : ${COMPONENTS[h.focus]}`);
  }
  if (colony.stock.length > 0) {
    lines.push(`Réserve : ${colony.stock.map((g) => `${g.name} ${g.count}`).join(', ')}`);
  }
  for (const p of colony.projects) {
    const goods = p.goods.map((g) => `${g.name} ${g.have}/${g.need}`).join(', ');
    const who =
      p.contributors.length > 0
        ? ` · apports : ${p.contributors.map((id) => `#${id}`).join(' ')}`
        : '';
    const builder = p.builder >= 0 ? ` · bâtisseur #${p.builder}` : '';
    lines.push(`${p.name} : ${goods}${who}${builder}`);
  }
  if (colony.lastProject.length > 1) {
    lines.push(`Dernier projet : œuvre de ${colony.lastProject.map((id) => `#${id}`).join(', ')}`);
  }
  for (const lib of colony.libraries ?? []) {
    const state = lib.abandoned ? ' (abandonnée)' : '';
    lines.push(
      `Bibliothèque (${lib.x}, ${lib.y})${state} : ${lib.documents} document(s), ` +
        `${lib.recipes.length} recette(s)`,
    );
  }
  const farm = colony.farm;
  if (farm && farm.plots > 0) {
    const share = Math.round(farm.cropShare * 100);
    lines.push(
      `Cultures : ${farm.plots} parcelle(s), ${farm.harvests} moisson(s) · ` +
        `hier ${share} % de la nourriture venait des cultures`,
    );
  }
  if (farm && farm.dishes > 0) {
    lines.push(`Cuisine : ${farm.dishesYesterday} plat(s) mangé(s) hier, ${farm.dishes} en tout`);
  }
  if (farm?.cooks?.length) lines.push(`Cuisiniers : ${farm.cooks.map((k) => `#${k}`).join(' ')}`);
  const market = colony.market;
  if (market) {
    lines.push(
      `Comptoir : ${market.treasury} écus en caisse, ${market.minted} frappés · ` +
        `${market.rations} ration(s) données`,
    );
    if (market.jobs.length > 0) {
      lines.push(
        `Métiers : ${market.jobs.map((j) => `${j.name.toLowerCase()} ${j.count}`).join(' · ')}`,
      );
    }
    if (market.prices.length > 0) {
      lines.push('Prix achat/vente (stock) :');
      const shown = market.prices.map((p) => `${p.name} ${p.bid}/${p.ask} (${p.stock})`);
      for (let i = 0; i < shown.length; i += PRICES_PER_LINE) {
        lines.push(`  ${shown.slice(i, i + PRICES_PER_LINE).join(' · ')}`);
      }
    }
  }
  const exp = colony.expedition;
  if (exp) {
    const where = `(${exp.x}, ${exp.y})`;
    const state = !exp.posted
      ? `site trouvé ${where}, le chef #${exp.leader} rentre l’annoncer`
      : exp.recruiting
        ? `recrute pour ${where}, ${exp.members} inscrit(s), menée par #${exp.leader}`
        : `en route vers ${where}, ${exp.members} membre(s), menée par #${exp.leader}`;
    lines.push(`Expédition : ${state}`);
  } else if (colony.scout >= 0) lines.push(`Éclaireur : #${colony.scout}`);
  for (const r of colony.relations ?? []) {
    const kin = r.kin ? ` (${r.kin})` : '';
    lines.push(
      `Colonie n°${r.id}${kin} : camp (${r.camp.x}, ${r.camp.y}) · ${r.meetings} rencontre(s) · ` +
        `${r.trades} caravane(s)`,
    );
  }
  lines.push(...formatFortress(colony.fortress));
  if (colony.scribe >= 0) lines.push(`Scribe : #${colony.scribe}`);
  if (colony.inventor >= 0) lines.push(`Inventeur : #${colony.inventor}`);
  if (colony.guards?.length) lines.push(`Gardes : ${colony.guards.map((g) => `#${g}`).join(' ')}`);
  const k = colony.knowledge;
  if (k && k.known.length + k.written.length + k.lost.length > 0) {
    lines.push(`Savoir : ${k.known.length} recette(s) connue(s), ${k.written.length} écrite(s)`);
    if (k.lost.length > 0) lines.push(`Savoir perdu : ${k.lost.join(', ')}`);
    if (k.saved.length > 0) lines.push(`Sauvé par un livre : ${k.saved.join(', ')}`);
    if (k.recovered.length > 0) lines.push(`Retrouvé : ${k.recovered.join(', ')}`);
  }
  return lines;
}

/**
 * Lines about the treasure and the enclosure (from Simulation#describeFortress).
 * @param {object | undefined} f
 * @returns {string[]}
 */
export function formatFortress(f) {
  if (!f) return [];
  const lines = [];
  if (f.treasure) {
    const goods = f.goods.map((g) => `${g.name.toLowerCase()} ${g.count}`).join(', ');
    lines.push(
      `Trésor (${f.treasure.x}, ${f.treasure.y}) : ${f.coins} écus, ${goods} · valeur ${f.value}`,
    );
  }
  const e = f.enclosure;
  if (e) {
    const state = e.closed
      ? `fermée le jour ${e.closedDay}`
      : `en chantier depuis le jour ${e.plannedDay}, ${e.built}/${e.total} pans`;
    const built = e.gates.filter((g) => g.built);
    const gate =
      built.length > 0
        ? `porte(s) ${built.map((g) => `(${g.x}, ${g.y})`).join(' ')}`
        : `${e.gates.length} porte(s) à bâtir`;
    const up = (e.towers ?? []).filter((t) => t.built);
    const tower = up.length > 0 ? ` · ${up.length}/${e.towers.length} tour(s) de guet` : '';
    lines.push(`Enceinte ${state} · ${gate}${tower}`);
    if (e.closed) lines.push(`Intrusions de prédateurs depuis : ${e.breaches}`);
  }
  if (f.danger >= 0.5) lines.push(`Danger ressenti au camp : ${f.danger.toFixed(1)}`);
  return lines;
}
