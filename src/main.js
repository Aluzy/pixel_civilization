import * as Phaser from 'phaser';
import { SimClient } from './bridge/sim-client.js';
import { UiScene } from './scenes/ui-scene.js';
import { WorldScene } from './scenes/world-scene.js';

/**
 * Reads the seed from `?seed=`; otherwise picks one and writes it in the URL so that a reload
 * or a shared link shows the same world. Randomness is allowed here: this is not simulation code.
 * @returns {number}
 */
function resolveSeed() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('seed');
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff) return parsed;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
  return seed;
}

const seed = resolveSeed();
const sim = new SimClient();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#c9d3a8',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [WorldScene, UiScene],
});

game.registry.set('sim', sim);
game.registry.set('seed', seed);
game.registry.set('version', typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev');
game.registry.set('commit', typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'local');

sim.init(seed);
