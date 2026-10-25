import { openTasks, releaseTask } from '../colony/colony-logic.js';
import { ProjectKind } from '../colony/colony-store.js';

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
  for (const colony of state.colonies) colony.members = 0;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || a.colony[id] < 0) continue;
    state.colonies[a.colony[id]].members++;
    if (a.taskProject[id] >= 0 && state.tick - a.taskTick[id] > cfg.reservationTicks) {
      releaseTask(state, ctx, id);
    }
  }
  for (const colony of state.colonies) {
    if (!colony.hasCamp || colony.members === 0) continue;
    if (
      colony.beds(cfg.bedsPerShelter) <= colony.members &&
      colony.findProject(ProjectKind.SHELTER) < 0
    ) {
      const slot = colony.freeSlot();
      if (slot >= 0) openBuildProject(state, ctx, colony, slot, ProjectKind.SHELTER, 'shelter');
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
    colony.open = openTasks(colony, cfg);
  }
}

/**
 * Opens a project to build a structure of the given catalogue kind at the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} slot
 * @param {number} kind - {@link ProjectKind}.
 * @param {string} structureKind - "shelter" or "library".
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
  p.number = kind === ProjectKind.SHELTER ? colony.sheltersBuilt + 1 : colony.libraryCount + 1;
  p.startTick = state.tick;
  for (const input of ctx.catalog.recipes[r].inputs) p.needs[input.good] = input.count;
}
