/**
 * Lines of the colony panel (from Simulation#describeColony): population, beds, stock, and the
 * projects in progress with what they still need and who worked on them.
 * @param {object | null} colony
 * @returns {string[]}
 */
export function formatColony(colony) {
  if (!colony || colony.members === 0) return [];
  const lines = [
    `Colonie : ${colony.members} individu(s) · ${colony.births} naissance(s) · ` +
      `${colony.deaths} mort(s)`,
    `${colony.shelters} abri(s), ${colony.beds} lit(s)`,
  ];
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
    lines.push(`Dernier abri : œuvre de ${colony.lastProject.map((id) => `#${id}`).join(', ')}`);
  }
  return lines;
}
