/**
 * World — The central ECS container.
 * Manages entity lifecycle, component stores, and system execution order.
 */
import type { Entity, System } from './types';
import { ComponentStore } from './component-store';

export class World {
  private nextId: Entity = 0;
  private alive = new Set<Entity>();
  private stores = new Map<string, ComponentStore<unknown>>();
  private systems: System[] = [];

  /** Create a new entity (just an ID) */
  createEntity(): Entity {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  /** Destroy entity and remove all its components */
  destroyEntity(entity: Entity): void {
    this.alive.delete(entity);
    for (const store of this.stores.values()) {
      store.delete(entity);
    }
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  get entityCount(): number {
    return this.alive.size;
  }

  /** Register a typed component store */
  registerStore<T>(name: string): ComponentStore<T> {
    if (this.stores.has(name)) {
      return this.stores.get(name) as ComponentStore<T>;
    }
    const store = new ComponentStore<T>();
    this.stores.set(name, store as ComponentStore<unknown>);
    return store;
  }

  /** Retrieve a typed component store */
  getStore<T>(name: string): ComponentStore<T> {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Component store "${name}" not registered`);
    return store as ComponentStore<T>;
  }

  /** Add system — execution order = insertion order */
  addSystem(system: System): void {
    this.systems.push(system);
  }

  /** Initialize all systems (async for GPU init) */
  async init(): Promise<void> {
    for (const sys of this.systems) {
      if (sys.init) await sys.init(this);
    }
  }

  /** Tick all systems in order */
  update(dt: number): void {
    for (const sys of this.systems) {
      sys.update(this, dt);
    }
  }

  /** Cleanup */
  destroy(): void {
    for (const sys of this.systems) {
      if (sys.destroy) sys.destroy();
    }
  }
}
