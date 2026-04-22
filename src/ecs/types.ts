/**
 * ECS Type Definitions
 * Strict separation: Entities are IDs, Components are pure data, Systems are logic.
 */
import type { World } from './world';

/** Entity — just a numeric handle. No data, no behavior. */
export type Entity = number;

/** System — stateless logic operating on component data */
export interface System {
  readonly name: string;
  init?(world: World): void | Promise<void>;
  update(world: World, deltaTime: number): void;
  destroy?(): void;
}
