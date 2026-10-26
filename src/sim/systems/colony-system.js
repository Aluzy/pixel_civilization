import { canalProject } from '../colony/canal.js';
import { claimFreeStock, openTasks, releaseTask } from '../colony/colony-logic.js';
import { Enclosure, ProjectKind } from '../colony/colony-store.js';
import { planEnclosure, updateDanger, wallNeeds, wantsEnclosure } from '../colony/fortress.js';
import { PACK } from '../world/chunk-store.js';
import { fieldResource, openField } from '../colony/field.js';
import { Component } from '../colony/harmony.js';
import { FarmJob, countFarmJobs } from '../farming/farm-jobs.js';
import { updateExpedition } from '../colony/migration.js';

/**
 * Task generators of each colony (docs/design/06-ia.md, couche 4), every `taskInterval` ticks:
 * counts members, opens a shelter project when every bed is taken (no birth without a bed), keeps
 * a pantry, and frees reservations held too long.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function colonySystem(state, ctx) {
  const cfg = ctx.balance.colony;
  if (state.tick % cfg.taskInterval !== 0) return;
  const a = ctx.agents;
  for (const colony of state.colonies) {
    colony.members = 0;
    colony.gleaning = 0;
  }
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || a.colony[id] < 0) continue;
    state.colonies[a.colony[id]].members++;
    if (a.farmJob[id] === FarmJob.GLEAN) state.colonies[a.colony[id]].gleaning++;
    if (a.taskProject[id] >= 0 && state.tick - a.taskTick[id] > cfg.reservationTicks) {
      releaseTask(state, ctx, id);
    }
  }
  const dawn = state.tick % ctx.balance.time.ticksPerDay === 0;
  for (const colony of state.colonies) {
    if (!colony.hasCamp || colony.members === 0) continue;
    if (dawn) updateDanger(state, ctx, colony);
    updateExpedition(state, ctx, colony);
    // Shelters: one at a time for a small colony, more at once as it grows (a large colony has
    // many hands to gather the materials).
    let building = 0;
    for (const p of colony.projects) if (p.kind === ProjectKind.SHELTER) building++;
    const atOnce = 1 + Math.floor(colony.members / cfg.membersPerShelterProject);
    // Beds ahead of the births: a share of the members more, at least one.
    const ahead = Math.max(1, Math.ceil(colony.members * cfg.bedMargin));
    const missingBeds = colony.members + ahead - colony.beds();
    const perHouse = ctx.bedsPerHouse;
    if (missingBeds > 0 && building < atOnce && building * perHouse < missingBeds + perHouse) {
      const slot = colony.freeSlot();
      if (slot >= 0) openBuildProject(state, ctx, colony, slot, ProjectKind.SHELTER, 'shelter');
    } else if (missingBeds + perHouse <= 0) {
      // Fewer mouths than beds now: houses nobody has started building are given up (their
      // materials stay in the stock).
      for (const p of colony.projects) {
        if (p.kind === ProjectKind.SHELTER && p.builder < 0) dropProject(state, ctx, colony, p);
      }
    }
    // A library once the colony is large enough to have knowledge worth keeping.
    if (
      colony.members >= ctx.balance.writing.libraryMembers &&
      colony.librariesStanding() === 0 &&
      colony.findProject(ProjectKind.LIBRARY) < 0
    ) {
      const slot = colony.freeSlot();
      if (slot >= 0) openBuildProject(state, ctx, colony, slot, ProjectKind.LIBRARY, 'library');
    }
    fortress(state, ctx, colony);
    canalProject(state, ctx, colony);
    // Plant what is over-harvested near the camp when durability or spatial order is the weakest
    // point, and berries when stability or well-being is (food to spare is what lets it grow).
    const focus = colony.focus;
    if (
      focus >= 0 &&
      focus !== Component.KNOWLEDGE &&
      colony.members >= ctx.balance.harmony.fieldMembers &&
      state.tick - colony.lastField >=
        ctx.balance.harmony.fieldEveryDays * ctx.balance.time.ticksPerDay &&
      colony.findProject(ProjectKind.FIELD) < 0
    ) {
      const slot = colony.freeSlot();
      const hungry = focus === Component.STABILITY || focus === Component.WELLBEING;
      const resource = fieldResource(ctx, colony, hungry);
      if (slot >= 0 && resource > 0) {
        openField(colony, slot, resource, ctx.balance.harmony.fieldUnits, state.tick);
        claimFreeStock(colony, colony.projects[slot]);
      }
    }
    if (colony.findProject(ProjectKind.PANTRY) < 0) {
      const slot = colony.freeSlot();
      if (slot >= 0) {
        const p = colony.projects[slot];
        p.clear();
        p.kind = ProjectKind.PANTRY;
        p.startTick = state.tick;
        // A marker per edible resource: the target itself grows with the colony.
        for (let r = 1; r < ctx.edible.length; r++) if (ctx.edible[r] === 1) p.needs[r] = 1;
      }
    }
    // What the counter bought lies in the stock: the projects take it before asking for more.
    for (const p of colony.projects) {
      if (p.kind !== ProjectKind.NONE && p.kind !== ProjectKind.PANTRY && p.builder < 0) {
        claimFreeStock(colony, p);
      }
    }
    colony.open = openTasks(colony, cfg, ctx.foodTables, ctx.balance.cooking.portion);
    countFarmJobs(state, ctx, colony);
  }
}

/**
 * Treasures and fortresses (docs/design/16-guerre-et-forteresses.md): a treasure room once the
 * colony is large enough, an enclosure around it when danger or wealth calls for it, then a tower
 * beside each gate.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {void}
 */
function fortress(state, ctx, colony) {
  const cfg = ctx.balance.fortress;
  if (
    !colony.hasTreasure &&
    colony.members >= cfg.treasureMembers &&
    colony.findProject(ProjectKind.TREASURE) < 0
  ) {
    const slot = colony.freeSlot();
    if (slot >= 0) openBuildProject(state, ctx, colony, slot, ProjectKind.TREASURE, 'treasury');
  }
  if (wantsEnclosure(ctx, colony)) {
    const slot = colony.freeSlot();
    if (slot >= 0 && planEnclosure(state, ctx, colony)) {
      const p = colony.projects[slot];
      p.clear();
      p.kind = ProjectKind.ENCLOSURE;
      p.number = 1;
      p.startTick = state.tick;
    }
  }
  const s = colony.findProject(ProjectKind.ENCLOSURE);
  if (s >= 0 && colony.projects[s].builder < 0) {
    if (colony.encState === Enclosure.BUILDING) wallNeeds(ctx, colony, colony.projects[s]);
    else colony.projects[s].clear();
  }
  // A tower beside each gate, one after the other.
  let towerDue = false;
  for (let i = 0; i < colony.towerCount; i++) {
    if ((colony.towersBuilt & (1 << i)) !== 0) continue;
    const tile = state.world.packedAt(colony.towerX[i], colony.towerY[i]) >>> PACK.STRUCTURE_SHIFT;
    if (tile === ctx.wallCode) towerDue = true;
  }
  if (
    colony.encState === Enclosure.CLOSED &&
    towerDue &&
    colony.findProject(ProjectKind.TOWER) < 0
  ) {
    const slot = colony.freeSlot();
    if (slot >= 0) openBuildProject(state, ctx, colony, slot, ProjectKind.TOWER, 'tower');
  }
}

/**
 * Gives a project up: the members working for it are freed, what they brought stays in the stock.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/colony-store.js').Project} project
 * @returns {void}
 */
function dropProject(state, ctx, colony, project) {
  const a = ctx.agents;
  const slot = colony.projects.indexOf(project);
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] === 1 && a.colony[id] === colony.id && a.taskProject[id] === slot) {
      releaseTask(state, ctx, id);
    }
  }
  project.clear();
}

/**
 * Opens a project to build a structure of the given catalogue kind at the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} slot
 * @param {number} kind - {@link ProjectKind}.
 * @param {string} structureKind - "shelter", "library", "treasury" or "tower".
 * @returns {void}
 */
function openBuildProject(state, ctx, colony, slot, kind, structureKind) {
  const structure = ctx.catalog.structures.find((st) => st.kind === structureKind);
  if (!structure) return;
  const r = ctx.catalog.recipeForStructure[structure.code];
  if (r < 0) return;
  const p = colony.projects[slot];
  p.clear();
  p.kind = kind;
  p.recipe = r;
  let open = 0;
  for (const q of colony.projects) if (q !== p && q.kind === kind) open++;
  p.number =
    kind === ProjectKind.SHELTER
      ? colony.sheltersBuilt + open + 1
      : kind === ProjectKind.LIBRARY
        ? colony.libraryCount + open + 1
        : 1;
  p.startTick = state.tick;
  for (const input of ctx.catalog.recipes[r].inputs) p.needs[input.good] = input.count;
  claimFreeStock(colony, p);
}
