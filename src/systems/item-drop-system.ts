import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { CameraComponent } from './camera-system';
import type { InventoryComponent } from '../ecs/components/inventory';
import type { ItemDropComponent } from '../ecs/components/item-drop';
import { addItemToInventory } from '../ecs/components/inventory';
import { ChunkManager } from '../world/chunk-manager';
import { BlockType, getBlockLabel } from '../world/chunk';
import type { UI } from '../ui';

type FloatingDropUI = {
  id: string;
  x: number;
  y: number;
  scale: number;
  blockType: number;
  count: number;
};

export class ItemDropSystem implements System {
  readonly name = 'ItemDropSystem';

  private chunkMgr: ChunkManager;
  private ui?: UI;

  constructor(chunkMgr: ChunkManager, ui?: UI) {
    this.chunkMgr = chunkMgr;
    this.ui = ui;
  }

  update(world: World, dt: number): void {
    const dropStore = world.getStore<ItemDropComponent>('itemDrop');
    const inventoryStore = world.getStore<InventoryComponent>('inventory');
    const cameraStore = world.getStore<CameraComponent>('camera');

    let camEntity: number | undefined;
    let cam: CameraComponent | undefined;
    for (const [entityId, current] of cameraStore) {
      camEntity = entityId;
      cam = current;
      break;
    }

    if (camEntity === undefined || !cam) {
      this.ui?.setFloatingDrops([]);
      return;
    }

    const inventory = inventoryStore.get(camEntity);
    const floatingDrops: FloatingDropUI[] = [];

    for (const [entityId, drop] of dropStore) {
      drop.age += dt;
      drop.pickupDelay = Math.max(0, drop.pickupDelay - dt);

      const nextX = drop.position[0] + drop.velocity[0] * dt;
      if (!this.isBlocked(nextX, drop.position[1], drop.position[2])) {
        drop.position[0] = nextX;
      } else {
        drop.velocity[0] *= -0.18;
      }

      const nextZ = drop.position[2] + drop.velocity[2] * dt;
      if (!this.isBlocked(drop.position[0], drop.position[1], nextZ)) {
        drop.position[2] = nextZ;
      } else {
        drop.velocity[2] *= -0.18;
      }

      drop.velocity[1] -= 16 * dt;
      const nextY = drop.position[1] + drop.velocity[1] * dt;
      if (!this.isBlocked(drop.position[0], nextY, drop.position[2])) {
        drop.position[1] = nextY;
      } else {
        drop.position[1] = Math.floor(drop.position[1]) + 0.02;
        drop.velocity[1] = Math.max(0, -drop.velocity[1] * 0.2);
        drop.velocity[0] *= 0.84;
        drop.velocity[2] *= 0.84;
      }

      const dx = cam.position[0] - drop.position[0];
      const dy = (cam.position[1] - 0.9) - drop.position[1];
      const dz = cam.position[2] - drop.position[2];
      const distSq = dx * dx + dy * dy + dz * dz;

      if (inventory && drop.pickupDelay <= 0 && distSq <= 4) {
        const picked = addItemToInventory(inventory, drop.blockType, drop.count);
        if (picked > 0) {
          this.ui?.setInventory(inventory.slots);
          this.ui?.showPickup(getBlockLabel(drop.blockType), picked);
          world.destroyEntity(entityId);
          continue;
        }
      }

      const bobY = Math.sin(drop.age * 3.5 + drop.bobPhase) * 0.18 + 0.42;
      const projected = projectWorldToScreen(
        cam.viewProjection,
        drop.position[0] + 0.5,
        drop.position[1] + bobY,
        drop.position[2] + 0.5
      );

      if (projected) {
        floatingDrops.push({
          id: `drop-${entityId}`,
          x: projected.x,
          y: projected.y,
          scale: projected.scale,
          blockType: drop.blockType,
          count: drop.count,
        });
      }

      if (drop.age > 45) {
        world.destroyEntity(entityId);
      }
    }

    this.ui?.setFloatingDrops(floatingDrops);
  }

  private isBlocked(x: number, y: number, z: number): boolean {
    const block = this.chunkMgr.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return block !== BlockType.Air && block !== BlockType.Water;
  }
}

function projectWorldToScreen(viewProjection: Float32Array, x: number, y: number, z: number) {
  const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
  const clipY = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
  const clipW = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];

  if (clipW <= 0.05) return null;

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;

  if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) return null;

  return {
    x: (ndcX * 0.5 + 0.5) * window.innerWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * window.innerHeight,
    scale: Math.max(0.65, Math.min(1.4, 1 / Math.max(0.55, clipW * 0.045))),
  };
}
