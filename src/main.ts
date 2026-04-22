/**
 * Main Entry Point — Bootstrap the Voxel Engine with Chunk System.
 */
import { Engine } from './core/engine';
import { CameraSystem, createDefaultCamera, type CameraComponent } from './systems/camera-system';
import { ChunkRenderSystem } from './systems/chunk-render-system';
import { ChunkManager } from './world/chunk-manager';
import { PhysicsSystem } from './systems/physics-system';
import { PlayerInteractionSystem } from './systems/player-interaction-system';
import { createPhysicsComponent, type PhysicsComponent } from './ecs/components/physics';
import { createInventoryComponent, type InventoryComponent } from './ecs/components/inventory';
import type { ItemDropComponent } from './ecs/components/item-drop';
import { createPlayerStateComponent, type PlayerStateComponent } from './ecs/components/player-state';
import { PlayerStatusSystem } from './systems/player-status-system';
import { EnvironmentSystem } from './systems/environment-system';
import { ItemDropSystem } from './systems/item-drop-system';
import { UI } from './ui';

async function main() {
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  if (!navigator.gpu) {
    const errScreen = document.getElementById('error-screen');
    if (errScreen) errScreen.style.display = 'flex';
    return;
  }

  // ── Init Core Components ──
  const engine = new Engine(canvas);
  await engine.init();

  const chunkMgr = new ChunkManager();
  const ui = new UI();
  
  // Terrain will generate asynchronously around the camera during the loop!
  console.log('Async chunk loading system initialized.');

  // ── Register ECS ──
  engine.world.registerStore<CameraComponent>('camera');
  engine.world.registerStore<PhysicsComponent>('physics');
  engine.world.registerStore<InventoryComponent>('inventory');
  engine.world.registerStore<ItemDropComponent>('itemDrop');
  engine.world.registerStore<PlayerStateComponent>('playerState');

  // ── Systems ──
  const cameraSys = new CameraSystem(engine.input, canvas);
  const chunkRenderSys = new ChunkRenderSystem(engine.gpu, chunkMgr);
  const physicsSys = new PhysicsSystem(chunkMgr);
  const environmentSys = new EnvironmentSystem(ui);
  const playerStatusSys = new PlayerStatusSystem(ui);
  const interactSys = new PlayerInteractionSystem(engine.input, chunkMgr, ui);
  const itemDropSys = new ItemDropSystem(chunkMgr, ui);

  engine.world.addSystem(cameraSys);
  engine.world.addSystem(environmentSys);
  engine.world.addSystem(physicsSys);
  engine.world.addSystem(playerStatusSys);
  engine.world.addSystem(interactSys);
  engine.world.addSystem(itemDropSys);
  engine.world.addSystem(chunkRenderSys);

  await engine.world.init();

  // ── Setup Camera ──
  const cameraEntity = engine.world.createEntity();
  const camData = createDefaultCamera();
  // Lift camera up slightly to drop into the new terrain
  camData.position[1] = 40; 
  camData.speed = 20; // Used only if flying
  
  const physData = createPhysicsComponent();
  const inventory = createInventoryComponent();
  const playerState = createPlayerStateComponent();

  engine.world.getStore<CameraComponent>('camera').set(cameraEntity, camData);
  engine.world.getStore<PhysicsComponent>('physics').set(cameraEntity, physData);
  engine.world.getStore<InventoryComponent>('inventory').set(cameraEntity, inventory);
  engine.world.getStore<PlayerStateComponent>('playerState').set(cameraEntity, playerState);
  ui.setInventory(inventory.slots);
  ui.setStatusMessage('Inventaire vide: cassez des blocs pour recolter des ressources');

  // Add click to start/lock mouse
  canvas.addEventListener('click', () => {
    const inv = document.getElementById('inventory-overlay');
    if (inv && inv.style.display !== 'none') return; // Don't lock if inventory is open
    canvas.requestPointerLock();
  });

  // ── Start loop ──
  engine.start();

  console.log(
    `%c[VoxelEngine] Chunk Render Pipeline Started — ${chunkMgr.chunkCount} chunks`,
    'color: #4de6a0; font-weight: bold;'
  );
}

main().catch((err) => {
  console.error('[VoxelEngine] Fatal:', err);
  const errScreen = document.getElementById('error-screen');
  if (errScreen) {
    errScreen.style.display = 'flex';
    const p = errScreen.querySelector('p');
    if (p) p.textContent = err.message;
  }
});
