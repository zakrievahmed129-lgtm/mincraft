import { BlockType, getBlockLabel } from '../../world/chunk';

export interface InventorySlot {
  blockType: number;
  count: number;
}

export interface InventoryComponent {
  slots: InventorySlot[];
}

export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;
export const MAX_STACK_SIZE = 64;

export function createInventoryComponent(): InventoryComponent {
  return {
    slots: Array.from({ length: INVENTORY_SIZE }, () => ({ blockType: BlockType.Air, count: 0 })),
  };
}

export function addItemToInventory(inventory: InventoryComponent, blockType: number, count: number): number {
  let remaining = count;

  for (const slot of inventory.slots) {
    if (slot.blockType !== blockType || slot.count <= 0 || slot.count >= MAX_STACK_SIZE) continue;
    const moved = Math.min(MAX_STACK_SIZE - slot.count, remaining);
    slot.count += moved;
    remaining -= moved;
    if (remaining === 0) return count;
  }

  for (const slot of inventory.slots) {
    if (slot.count > 0) continue;
    const moved = Math.min(MAX_STACK_SIZE, remaining);
    slot.blockType = blockType;
    slot.count = moved;
    remaining -= moved;
    if (remaining === 0) return count;
  }

  return count - remaining;
}

export function removeItemFromSlot(inventory: InventoryComponent, index: number, count = 1): boolean {
  const slot = inventory.slots[index];
  if (!slot || slot.count < count) return false;

  slot.count -= count;
  if (slot.count <= 0) {
    slot.count = 0;
    slot.blockType = BlockType.Air;
  }
  return true;
}

export function getSlotLabel(slot: InventorySlot): string {
  return slot.count > 0 ? `${getBlockLabel(slot.blockType)} x${slot.count}` : 'Vide';
}
