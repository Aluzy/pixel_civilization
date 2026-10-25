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
  // A thirsty or hungry listener asks where to drink or eat: that place is told first.
  const asked = askedPlace(ctx, memory, to, tick);
  if (asked >= 0) {
    tellPlace(state, ctx, memory, asked, to, rng);
    return;
  }
  const r = weighted(recipes, newRecipe, rng);
  if (r >= 0 && (memory.count === 0 || rng.next() < 0.5)) {
    const wrong = book.wrong[r] === 1 || rng.next() < cfg.wrongRecipeChance;
    if (listener.learn(r, tick, ctx.recipeTau, cfg.heardStrength, wrong)) {
      state.events.push(tick, EventType.TOLD, to, a.x[to], a.y[to], r);
    }
    return;
  }
  const i = weighted(memory.count, (k) => memory.strength(k, tick), rng);
  if (i >= 0) tellPlace(state, ctx, memory, i, to, rng);
}

/**
 * The speaker's strongest memory of what the listener asks for (water when it is thirsty, food
 * when it is hungry, past `askNeed`), or -1.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../agents/memory.js').Memory} memory - The speaker's.
 * @param {number} to
 * @param {number} tick
 * @returns {number} Memory index.
 */
function askedPlace(ctx, memory, to, tick) {
  const a = ctx.agents;
  const ask = ctx.balance.social.askNeed;
  const thirsty = a.thirst[to] >= ask;
  const hungry = a.hunger[to] >= ask;
  if (!thirsty && !hungry) return -1;
  let best = -1;
  let bestStrength = 0;
  for (let k = 0; k < memory.count; k++) {
    const subject = memory.subject[k];
    const wanted = (thirsty && subject === 0) || (hungry && ctx.edible[subject] === 1);
    if (!wanted) continue;
    const strength = memory.strength(k, tick);
    if (strength > bestStrength) {
      bestStrength = strength;
      best = k;
    }
  }
  return best;
}

/**
 * Tells one remembered place, shifted by a few tiles; it enters the listener's memory at the
 * strength of hearsay.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../agents/memory.js').Memory} memory - The speaker's.
 * @param {number} i
 * @param {number} to
 * @param {import('../core/rng.js').Rng} rng
 * @returns {void}
 */
function tellPlace(state, ctx, memory, i, to, rng) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  const tick = state.tick;
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
 * An agent in need on the move calls out to an awake agent within `askRadius` to ask where to
 * drink or eat; the other answers if it remembers such a place.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function ask(state, ctx, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  if (a.alive[id] !== 1 || a.asleep[id] === 1) return;
  if (a.thirst[id] < cfg.askNeed && a.hunger[id] < cfg.askNeed) return;
  for (let other = 0; other < a.highWater; other++) {
    if (other === id || a.alive[other] !== 1 || a.asleep[other] === 1) continue;
    const gap = Math.max(Math.abs(a.x[other] - a.x[id]), Math.abs(a.y[other] - a.y[id]));
    if (gap > cfg.askRadius) continue;
    const memory = a.memory[other];
    const i = askedPlace(ctx, memory, id, state.tick);
    if (i < 0) continue;
    tellPlace(state, ctx, memory, i, id, a.rng[other]);
    return;
  }
}

/**
 * Word of mouth: every `talkInterval` ticks (staggered by id), an agent at rest next to another
 * agent at rest exchanges one piece of knowledge with it, each way, and they grow closer; an
 * agent in need on the move asks its way.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function socialSystem(state, ctx) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  if (a.aliveCount < 2) return;
  for (let id = 0; id < a.highWater; id++) {
    if ((state.tick + id) % cfg.talkInterval !== 0) continue;
    if (!atRest(a, id)) {
      ask(state, ctx, id);
      continue;
    }
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
