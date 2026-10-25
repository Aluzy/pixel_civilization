/** Prices shown per line of the colony panel (it must stay narrow). */
const PRICES_PER_LINE = 4;

/** Harmony components, in the order of the simulation. */
const COMPONENTS = ['stabilité', 'durabilité', 'ordre spatial', 'savoir', 'bien-être'];

/**
 * Lines of the colony panel (from Simulation#describeColony): population, beds, stock, the
 * projects in progress with what they still need and who worked on them, the libraries, the
 * counter (treasury, jobs, prices) and the colony's knowledge (known, written, lost).
 * @param {object | null} colony
 * @returns {string[]}
 */
export function formatColony(colony) {
  if (!colony || colony.members === 0) return [];
  const lines = [
    `Colonie : ${colony.members} individu(s) · ${colony.births} naissance(s) · ` +
      `${colony.deaths} mort(s)`,
    `${colony.shelters} abri(s), ${colony.beds} lit(s)` +
      (colony.fields ? ` · ${colony.fields} champ(s), ${colony.planted} plant(s)` : ''),
  ];
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
