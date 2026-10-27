import { EventType } from '../core/events.js';
import { Tier } from '../agents/agent-store.js';
import { askOf, bidOf } from './prices.js';

// The colony's counter (docs/design/14-economie.md, « Le marché »): what members bring to the
// stock is bought at the counter's price, what they take for themselves (food, ingredients of
// their trade) is sold to them a little dearer (`spread`). The counter pays with the écus of its
// treasury, and no more: when it is empty, what is brought still goes to the common stock, unpaid.
// Members' wealth is their own; at death it goes to their living children, else to the counter.

/**
 * The job the agent is doing now: its post if it holds one, else its chosen job (-1 if none).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony | null} colony
 * @param {number} id
 * @returns {number}
 */
export function roleOf(ctx, colony, id) {
  if (colony !== null) {
    const posts = ctx.jobs.postJob;
    if (posts[0] >= 0 && colony.guards.includes(id)) return posts[0];
    if (posts[1] >= 0 && colony.inventor === id) return posts[1];
    if (posts[2] >= 0 && colony.scribe === id) return posts[2];
  }
  return ctx.agents.job[id];
}

/**
 * Notes a trade in the agent's recent trades (inspector): units > 0 sold, < 0 bought.
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @param {number} tick
 * @param {number} good
 * @param {number} units
 * @param {number} coins - Paid or received.
 * @returns {void}
 */
function noteTrade(a, id, tick, good, units, coins) {
  const slots = a.tradeSlots;
  const i = id * slots + a.tradeNext[id];
  a.tradeTick[i] = tick;
  a.tradeGood[i] = good;
  a.tradeUnits[i] = units;
  a.tradeCoins[i] = coins;
  a.tradeNext[id] = (a.tradeNext[id] + 1) % slots;
}

/**
 * Sells units the agent carries to the counter: they go to the stock, the counter pays its price.
 * The first sale of a good in the colony is a chronicle event.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} good
 * @param {number} units
 * @returns {number} Écus received.
 */
export function sell(state, ctx, colony, id, good, units) {
  if (units <= 0) return 0;
  const a = ctx.agents;
  a.addCarried(id, good, -units);
  colony.stock[good] += units;
  colony.inToday[good] += units;
  const due = bidOf(colony.price[good]) * units;
  // Gold and gems are paid only with the écus the counter can spare: the rest keeps the market of
  // food and materials going.
  const spare = ctx.treasureGoods[good] === 1 ? treasureSpare(ctx, colony) : colony.treasury;
  const pay = due < spare ? due : spare > 0 ? spare : 0;
  a.coins[id] += pay;
  a.earnedToday[id] += pay;
  colony.treasury -= pay;
  let role = roleOf(ctx, colony, id);
  // One of the people has no job of its own: it does the trade of what it brings.
  if (role < 0 && a.tier[id] === Tier.COMMONER) role = ctx.jobs.sellerOf[good];
  colony.sold[(role + 1) * colony.stock.length + good] += units;
  colony.lastSeller[good] = id;
  noteTrade(a, id, state.tick, good, units, pay);
  if (colony.firstSold[good] === 0) {
    colony.firstSold[good] = 1;
    state.events.push(state.tick, EventType.FIRST_SALE, id, a.x[id], a.y[id], good, role);
  }
  return pay;
}

/**
 * Écus the counter can spend on gold and gems: the treasury beyond a reserve per member.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {number}
 */
export function treasureSpare(ctx, colony) {
  const reserve = ctx.balance.fortress.treasureReserve * colony.members;
  return colony.treasury > reserve ? colony.treasury - reserve : 0;
}

/**
 * Takes units from the stock for the colony's own use (a building, a field, a trial): nothing is
 * paid, but the counter counts what leaves its stock.
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} good
 * @param {number} units
 * @returns {void}
 */
export function take(colony, good, units) {
  colony.stock[good] -= units;
  colony.outToday[good] += units;
}

/**
 * Buys up to `units` of a good for the agent, as many as the stock holds and it can pay for.
 * The first purchase of a good in the colony is a chronicle event (naming who made it).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} good
 * @param {number} units
 * @param {boolean} [trade=false] - Inputs of its trade: they count against its income.
 * @returns {number} Units bought.
 */
export function buy(state, ctx, colony, id, good, units, trade = false) {
  const a = ctx.agents;
  const ask = askOf(colony.price[good], ctx.balance.economy.spread);
  const n = Math.min(units, colony.stock[good], Math.floor(a.coins[id] / ask));
  if (n <= 0) return 0;
  take(colony, good, n);
  a.addCarried(id, good, n, state.tick);
  a.coins[id] -= n * ask;
  if (trade) a.spentToday[id] += n * ask;
  colony.treasury += n * ask;
  const role = roleOf(ctx, colony, id);
  colony.bought[(role + 1) * colony.stock.length + good] += n;
  noteTrade(a, id, state.tick, good, -n, n * ask);
  if (colony.firstBought[good] === 0) {
    colony.firstBought[good] = 1;
    const maker = colony.lastSeller[good];
    state.events.push(state.tick, EventType.FIRST_PURCHASE, id, a.x[id], a.y[id], good, maker);
  }
  return n;
}

/**
 * At the counter, a hungry member takes a meal's reserve: it buys the food that gives it the most
 * for its écus (what nourishes, and the pleasure of a dish), and what it cannot pay for, the
 * colony gives it: the cheapest food for what it nourishes (the colony feeds its members first).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} nutrition - Nutrition wanted.
 * @returns {void}
 */
export function buyFood(state, ctx, colony, id, nutrition) {
  const a = ctx.agents;
  const t = ctx.foodTables;
  const cfg = ctx.balance.economy;
  let want = nutrition;
  while (want > 0) {
    const room = Math.floor(ctx.capacity(id) - a.carriedTotal(id));
    if (room <= 0) return;
    let best = 0;
    let bestValue = 0;
    let cheap = 0;
    let cheapCost = Infinity;
    for (let k = 0; k < t.order.length; k++) {
      const g = t.order[k];
      if (colony.stock[g] === 0) continue;
      const ask = askOf(colony.price[g], cfg.spread);
      const value = (t.nutrition[g] * (1 + t.pleasure[g] * cfg.pleasureValue)) / ask;
      if (ask <= a.coins[id] && value > bestValue) {
        bestValue = value;
        best = g;
      }
      if (ask / t.nutrition[g] < cheapCost) {
        cheapCost = ask / t.nutrition[g];
        cheap = g;
      }
    }
    if (cheap === 0) return;
    const g = best > 0 ? best : cheap;
    const units = Math.min(Math.ceil(want / t.nutrition[g]), room);
    const n = best > 0 ? buy(state, ctx, colony, id, g, units) : ration(colony, a, id, g, units);
    if (n <= 0) return;
    want -= n * t.nutrition[g];
  }
}

/**
 * Food given by the colony to a member who cannot pay.
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @param {number} good
 * @param {number} units
 * @returns {number} Units given.
 */
function ration(colony, a, id, good, units) {
  const n = Math.min(units, colony.stock[good]);
  if (n <= 0) return 0;
  take(colony, good, n);
  a.addCarried(id, good, n);
  colony.rations += n;
  return n;
}

/**
 * Wages of the posts (guards, scribe, inventor), paid by the counter at dawn while it can.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {void}
 */
export function payWages(ctx, colony) {
  const a = ctx.agents;
  const wage = ctx.balance.economy.wage;
  const pay = (id) => {
    if (id < 0 || a.alive[id] !== 1 || colony.treasury < wage) return;
    a.coins[id] += wage;
    a.earnedToday[id] += wage;
    colony.treasury -= wage;
  };
  for (let k = 0; k < colony.guards.length; k++) pay(colony.guards[k]);
  pay(colony.inventor);
  pay(colony.scribe);
}

/**
 * The colony's money: the counter mints écus into its treasury so that its members and itself hold
 * `coinsPerMember` per member (a growing colony needs more money; écus are never destroyed).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} c - Colony id.
 * @returns {void}
 */
export function mint(ctx, colony, c) {
  const a = ctx.agents;
  let money = colony.treasury;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] === 1 && a.colony[id] === c) money += a.coins[id];
  }
  const target = ctx.balance.economy.coinsPerMember * colony.members;
  if (money >= target) return;
  colony.treasury += target - money;
  colony.minted += target - money;
}

/**
 * The wealth of a member who dies goes to its living children, in equal shares (the rest to the
 * youngest id), else back to the counter.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function bequeath(state, ctx, id) {
  const a = ctx.agents;
  const coins = a.coins[id];
  a.coins[id] = 0;
  if (coins <= 0) return;
  let heirs = 0;
  let first = -1;
  const child = (c) =>
    c !== id && a.alive[c] === 1 && a.parent[c] === id && a.bornTick[c] > a.bornTick[id];
  for (let c = 0; c < a.highWater; c++) {
    if (!child(c)) continue;
    if (first < 0) first = c;
    heirs++;
  }
  if (heirs === 0) {
    if (a.colony[id] >= 0) state.colonies[a.colony[id]].treasury += coins;
    return;
  }
  const share = Math.floor(coins / heirs);
  for (let c = 0; c < a.highWater; c++) {
    if (child(c)) a.coins[c] += share;
  }
  a.coins[first] += coins - share * heirs;
}
