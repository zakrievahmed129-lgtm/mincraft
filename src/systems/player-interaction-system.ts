import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { InputManager } from '../core/input';
import type { CameraComponent } from './camera-system';
import { ChunkManager } from '../world/chunk-manager';
import { fastVoxelRaycast } from '../math/raycast';
import { vec3 } from '../math/vec3';
import { createItemDropComponent, type ItemDropComponent } from '../ecs/components/item-drop';
import { removeItemFromSlot, type InventoryComponent } from '../ecs/components/inventory';
import { BlockType, getBlockDropCount, getBlockHardness, getBlockLabel } from '../world/chunk';
import type { UI } from '../ui';

export class PlayerInteractionSystem implements System {
  readonly name = 'PlayerInteractionSystem';
  private input: InputManager;
  private chunkMgr: ChunkManager;
  private ui?: UI;
  private breakingKey = '';
  private breakingProgress = 0;

  public interactionDistance = 6.0; // Reach

  constructor(input: InputManager, chunkMgr: ChunkManager, ui?: UI) {
    this.input = input;
    this.chunkMgr = chunkMgr;
    this.ui = ui;
  }

  update(world: World, dt: number): void {
    const cameraStore = world.getStore<CameraComponent>('camera');
    const inventoryStore = world.getStore<InventoryComponent>('inventory');
    const itemDropStore = world.getStore<ItemDropComponent>('itemDrop');
    let cam: CameraComponent | undefined;
    let playerEntity: number | undefined;
    for (const [entityId, c] of cameraStore) {
      playerEntity = entityId;
      cam = c;
      break;
    }
    if (!cam) return;

    // Calculate forward vector based on yaw and pitch
    const forwardX = Math.cos(cam.pitch) * Math.sin(cam.yaw);
    const forwardY = Math.sin(cam.pitch);
    const forwardZ = Math.cos(cam.pitch) * Math.cos(cam.yaw);
    const direction = vec3(forwardX, forwardY, forwardZ);

    const getBlock = (x: number, y: number, z: number) => {
      const b = this.chunkMgr.getBlock(x, y, z);
      return b !== BlockType.Air && b !== BlockType.Water; // Raycast ignores water
    };

    const hit = fastVoxelRaycast(cam.position, direction, this.interactionDistance, getBlock);

    if (hit) {
      const hitBlock = this.chunkMgr.getBlock(hit.hitWorldPos[0], hit.hitWorldPos[1], hit.hitWorldPos[2]);
      const hitKey = `${hit.hitWorldPos[0]},${hit.hitWorldPos[1]},${hit.hitWorldPos[2]}`;

      if (this.input.isMouseDownLeft && this.input.isPointerLocked && hitBlock !== BlockType.Air && hitBlock !== BlockType.Water) {
        if (this.breakingKey !== hitKey) {
          this.breakingKey = hitKey;
          this.breakingProgress = 0;
        }

        const breakDuration = getBreakDuration(hitBlock);
        this.breakingProgress = Math.min(1, this.breakingProgress + dt / breakDuration);
        this.ui?.setBreakOverlay({
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.5,
          size: 64,
          progress: this.breakingProgress,
          blockType: hitBlock,
        });

        if (this.breakingProgress >= 1) {
          this.chunkMgr.setBlockWorld(hit.hitWorldPos[0], hit.hitWorldPos[1], hit.hitWorldPos[2], BlockType.Air);
          const dropCount = getBlockDropCount(hitBlock);
          if (dropCount > 0) {
            const dropEntity = world.createEntity();
            itemDropStore.set(
              dropEntity,
              createItemDropComponent(hitBlock, dropCount, vec3(
                hit.hitWorldPos[0] + 0.5,
                hit.hitWorldPos[1] + 0.15,
                hit.hitWorldPos[2] + 0.5
              ))
            );
            this.ui?.setStatusMessage(`${getBlockLabel(hitBlock)} casse: objet au sol`);
          }

          this.breakingKey = '';
          this.breakingProgress = 0;
          this.ui?.setBreakOverlay(null);
        }
      } else {
        this.breakingKey = '';
        this.breakingProgress = 0;
        this.ui?.setBreakOverlay(null);
      }

      if (this.input.justPressedRight) {
        if (playerEntity === undefined) return;
        const inventory = inventoryStore.get(playerEntity);
        const slotIndex = this.ui?.getActiveSlotIndex() ?? 0;
        const slot = inventory?.slots[slotIndex];
        if (!inventory || !slot || slot.count <= 0 || slot.blockType === BlockType.Air) {
          this.ui?.setStatusMessage('Inventaire vide: aucun bloc a placer');
          return;
        }

        // Place Block
        const px = hit.placeWorldPos[0];
        const py = hit.placeWorldPos[1];
        const pz = hit.placeWorldPos[2];
        
        const dx = Math.abs(cam.position[0] - (px + 0.5));
        const dy = Math.abs(cam.position[1] - (py + 0.5));
        const dz = Math.abs(cam.position[2] - (pz + 0.5));
        
        if (dx > 0.6 || dy > 1.0 || dz > 0.6) {
          const blockType = slot.blockType;
          this.chunkMgr.setBlockWorld(px, py, pz, blockType);
          if (removeItemFromSlot(inventory, slotIndex, 1)) {
            this.ui?.setInventory(inventory.slots);
          }
        }
      }
    } else {
      this.breakingKey = '';
      this.breakingProgress = 0;
      this.ui?.setBreakOverlay(null);
    }
  }
}

function getBreakDuration(blockType: number): number {
  return Math.max(0.18, getBlockHardness(blockType) * 0.75);
}
