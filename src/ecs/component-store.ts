/**
 * ComponentStore — sparse Map-based storage.
 * Ready to be swapped for dense SoA TypedArrays per component type
 * when profiling shows it's needed.
 */
import type { Entity } from './types';

export class ComponentStore<T> {
  private data = new Map<Entity, T>();

  set(entity: Entity, component: T): void {
    this.data.set(entity, component);
  }

  get(entity: Entity): T | undefined {
    return this.data.get(entity);
  }

  has(entity: Entity): boolean {
    return this.data.has(entity);
  }

  delete(entity: Entity): boolean {
    return this.data.delete(entity);
  }

  get size(): number {
    return this.data.size;
  }

  entities(): IterableIterator<Entity> {
    return this.data.keys();
  }

  values(): IterableIterator<T> {
    return this.data.values();
  }

  [Symbol.iterator](): IterableIterator<[Entity, T]> {
    return this.data.entries();
  }
}
