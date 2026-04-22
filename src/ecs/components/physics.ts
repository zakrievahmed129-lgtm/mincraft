import { Vec3, vec3 } from '../../math/vec3';

export interface PhysicsComponent {
  velocity: Vec3;
  width: number;
  height: number;
  depth: number;
  
  // State
  onGround: boolean;
  
  // Input Intent
  moveDirection: Vec3;
  jumpIntent: boolean;
  swimIntent: boolean;
  sinkIntent: boolean;
  
  // Physical Constants
  gravity: number;
  jumpForce: number;
  maxSpeed: number;
  groundAcceleration: number;
  groundDrag: number;
  airAcceleration: number;
  airDrag: number;
  maxSwimSpeed: number;
  swimAcceleration: number;
  waterDrag: number;
  buoyancy: number;

  // Environment state
  inWater: boolean;
  underwater: boolean;
  fallStartY: number;
  peakFallSpeed: number;
}

export function createPhysicsComponent(
  width = 0.6,
  height = 1.8,
  depth = 0.6
): PhysicsComponent {
  return {
    velocity: vec3(0, 0, 0),
    width,
    height,
    depth,
    
    onGround: false,
    
    moveDirection: vec3(0, 0, 0),
    jumpIntent: false,
    swimIntent: false,
    sinkIntent: false,
    
    gravity: 30.0,
    jumpForce: 10.0,
    maxSpeed: 8.0,
    groundAcceleration: 100.0, // High accel on ground
    groundDrag: 10.0,          // Strong friction on ground to stop quickly
    airAcceleration: 10.0,     // Weak air control
    airDrag: 1.0,              // Low friction in air to preserve momentum
    maxSwimSpeed: 4.5,
    swimAcceleration: 18.0,
    waterDrag: 4.5,
    buoyancy: 20.0,
    inWater: false,
    underwater: false,
    fallStartY: 0,
    peakFallSpeed: 0,
  };
}
