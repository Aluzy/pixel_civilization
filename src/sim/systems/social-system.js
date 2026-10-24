import { Action } from '../agents/action-types.js';
import { tauOf } from '../agents/beliefs.js';
import { EventType } from '../core/events.js';

/**
 * True if the agent is at rest and can talk: awake and idle, eating or drinking.
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @returns {boolean}
 */
function atRest(a, id) {
  if (a.alive[id] !== 1 || a.asleep[id] === 1) return false;
  const act = a.action[id];
  return act === Action.IDLE || act === Action.NONE || act === Action.EAT || act === Action.DRINK;
}

/**
 * Index drawn with probability proportional to `weight(i)` among `n` items, or -1.
 * @param {number} n
 * @param {(i: number) => number} weight
 * @param {import('../core/rng.js').Rng} rng
 * @returns {number}
 */
function weighted(n, weight, rng) {
  let total = 0;
  for (let i = 0; i < n; i++) total += weight(i);
  if (total <= 0) return -1;
  let pick = rng.next() * total;
  for (let i = 0; i < n; i++) {
    pick -= weight(i);
    if (pick < 0) return i;
  }
  return n - 1;
}

/**
 * One piece of knowledge passed by word of mouth (docs/design/05-savoir.md, « Transmission
 * orale »): a recipe the listener does not know (sometimes misheard), or a remembered place,
 * shifted by a few tiles; both enter its memory at the strength of hearsay.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
export function tell(state, ctx, from, to) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  const rng = a.rng[from];
  const tick = state.tick;
  const book = a.recipes[from];
  const listener = a.recipes[to];
  const recipes = ctx.catalog.recipes.length;
  const newRecipe = (r) => (book.knows(r) && !listener.knows(r) ? book.strength(r, tick) : 0);
  const memory = a.memory[from];
  const r = weighted(recipes, newRecipe, rng);
  if (r >= 0 && (memory.count === 0 || rng.next() < 0.5)) {
    const wrong = book.wrong[r] === 1 || rng.next() < cfg.wrongRecipeChance;
    if (listener.learn(r, tick, ctx.recipeTau, cfg.heardStrength, wrong)) {
      state.events.push(tick, EventType.TOLD, to, a.x[to], a.y[to], r);
    }
    return;
  }
  const i = weighted(memory.count, (k) => memory.strength(k, tick), rng);
  if (i < 0) return;
  const subject = memory.subject[i];
  const x = memory.x[i] + rng.int(-cfg.placeOffset, cfg.placeOffset);
  const y = memory.y[i] + rng.int(-cfg.placeOffset, cfg.placeOffset);
  const m = ctx.balance.memory;
  a.memory[to].remember(
    subject,
    x,
    y,
    0,
    tick,
    cfg.heardStrength,
    tauOf(ctx, subject),
    m.sameRadius,
  );
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} self
 * @param {number} peer
 * @returns {void}
 */
function befriend(state, ctx, self, peer) {
  const model = ctx.agents.social[self];
  const sheet = model.sheet(peer, state.tick);
  model.talks[sheet]++;
  model.affinity[sheet] += ctx.balance.social.talkAffinity;
}

/**
 * Word of mouth: every `talkInterval` ticks (staggered by id), an agent at rest next to another
 * agent at rest exchanges one piece of knowledge with it, each way, and they grow closer.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function socialSystem(state, ctx) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  if (a.aliveCount < 2) return;
  for (let id = 0; id < a.highWater; id++) {
    if ((state.tick + id) % cfg.talkInterval !== 0 || !atRest(a, id)) continue;
    for (let other = 0; other < a.highWater; other++) {
      if (other === id || !atRest(a, other)) continue;
      const gap = Math.max(Math.abs(a.x[other] - a.x[id]), Math.abs(a.y[other] - a.y[id]));
      if (gap > cfg.talkRadius) continue;
      tell(state, ctx, id, other);
      tell(state, ctx, other, id);
      befriend(state, ctx, id, other);
      befriend(state, ctx, other, id);
      break;
    }
  }
}
