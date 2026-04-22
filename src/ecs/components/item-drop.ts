import { vec3, type Vec3 } from '../../math/vec3';

export interface ItemDropComponent {
  blockType: number;
  count: number;
  position: Vec3;
  velocity: Vec3;
  age: number;
  bobPhase: number;
  pickupDelay: number;
}

export function createItemDropComponent(blockType: number, count: number, position: Vec3): ItemDropComponent {
  return {
    blockType,
    count,
    position: vec3(position[0], position[1], position[2]),
    velocity: vec3((Math.random() - 0.5) * 2.2, 3.8 + Math.random() * 1.4, (Math.random() - 0.5) * 2.2),
    age: 0,
    bobPhase: Math.random() * Math.PI * 2,
    pickupDelay: 0.2,
  };
}
