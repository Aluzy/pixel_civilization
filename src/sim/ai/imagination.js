/**
 * Mental simulation (docs/design/06-ia.md, couche 5) of a fight against predators: the agent
 * imagines `rollouts` fights on a simplified model drawn from its beliefs (its own health,
 * attack and weapon; a predator about as strong as the ones it knows, give or take `spread`) and
 * counts how often it would end up badly hurt before the predator runs away or dies. The work is
 * fixed by `rollouts` (work units), never by time.
 * @param {object} agent
 * @param {number} agent.hp
 * @param {number} agent.maxHp
 * @param {number} agent.attack - Already multiplied by its weapon.
 * @param {number} agent.defense
 * @param {object} predator - balance.threats: hp, attack, defense, fleeBelow.
 * @param {object} cfg - balance.imagination: rollouts, predatorSpread, riskHealth.
 * @param {import('../core/rng.js').Rng} rng
 * @param {number} [allies=0] - Armed members who would fight alongside.
 * @param {number} [enemies=1] - Predators in sight.
 * @returns {number} Imagined probability of a bad outcome, in [0, 1].
 */
export function imagineFight(agent, predator, cfg, rng, allies = 0, enemies = 1) {
  let bad = 0;
  const floor = agent.maxHp * cfg.riskHealth;
  const vary = () => 1 + (rng.next() * 2 - 1) * cfg.predatorSpread;
  for (let k = 0; k < cfg.rollouts; k++) {
    // A pack pools its health; the blows are shared among the fighters on each side.
    const predatorMax = predator.hp * vary() * Math.max(1, enemies);
    let predatorHp = predatorMax;
    const side = 1 + allies;
    const blowTaken =
      (Math.max(1, predator.attack * vary() - agent.defense) * Math.max(1, enemies)) / side;
    const blowGiven = Math.max(1, agent.attack - predator.defense) * side;
    let hp = agent.hp;
    // Exchanges until one side gives up: the predator under fleeBelow, the agent under floor.
    for (let round = 0; round < 64; round++) {
      hp -= blowTaken;
      if (hp < floor) {
        bad++;
        break;
      }
      predatorHp -= blowGiven;
      if (predatorHp < predatorMax * predator.fleeBelow) break;
    }
  }
  return bad / cfg.rollouts;
}
