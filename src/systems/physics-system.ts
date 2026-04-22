import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { PhysicsComponent } from '../ecs/components/physics';
import type { PlayerStateComponent } from '../ecs/components/player-state';
import type { CameraComponent } from './camera-system';
import { ChunkManager } from '../world/chunk-manager';
import { BlockType } from '../world/chunk';

export class PhysicsSystem implements System {
  readonly name = 'PhysicsSystem';
  private chunkMgr: ChunkManager;

  constructor(chunkMgr: ChunkManager) {
    this.chunkMgr = chunkMgr;
  }

  update(world: World, dt: number): void {
    const physicsStore = world.getStore<PhysicsComponent>('physics');
    const cameraStore  = world.getStore<CameraComponent>('camera');
    const playerStore = world.getStore<PlayerStateComponent>('playerState');

    // Currently, our player is represented by the Camera Entity
    for (const [entityId, phys] of physicsStore) {
      const cam = cameraStore.get(entityId);
      const player = playerStore.get(entityId);
      if (!cam) continue;

      const pos = cam.position;
      const hw = phys.width / 2;
      const previousOnGround = phys.onGround;

      const sampleBlock = (px: number, py: number, pz: number): number =>
        this.chunkMgr.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));

      const isSolidBlock = (block: number): boolean =>
        block !== BlockType.Air && block !== BlockType.Water;

      // Function to check AABB solid intersection
      const checkCollision = (px: number, py: number, pz: number) => {
        const minX = Math.floor(px - hw);
        const maxX = Math.floor(px + hw);
        const minY = Math.floor(py - phys.height);
        const maxY = Math.floor(py + 0.1);
        const minZ = Math.floor(pz - hw);
        const maxZ = Math.floor(pz + hw);

        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
              if (isSolidBlock(this.chunkMgr.getBlock(x, y, z))) {
                return true;
              }
            }
          }
        }
        return false;
      };

      const sampleWaterCoverage = (px: number, py: number, pz: number): number => {
        const samplePoints = [
          [px, py - phys.height + 0.2, pz],
          [px, py - phys.height * 0.55, pz],
          [px, py - phys.height * 0.15, pz],
          [px + hw * 0.8, py - phys.height * 0.45, pz],
          [px - hw * 0.8, py - phys.height * 0.45, pz],
          [px, py - phys.height * 0.45, pz + hw * 0.8],
          [px, py - phys.height * 0.45, pz - hw * 0.8],
        ] as const;

        let submerged = 0;
        for (const [sx, sy, sz] of samplePoints) {
          if (sampleBlock(sx, sy, sz) === BlockType.Water) submerged++;
        }
        return submerged / samplePoints.length;
      };

      const waterCoverage = sampleWaterCoverage(pos[0], pos[1], pos[2]);
      const headBlock = sampleBlock(pos[0], pos[1] - 0.15, pos[2]);
      phys.inWater = waterCoverage > 0.15;
      phys.underwater = headBlock === BlockType.Water;

      if (player) {
        player.isSwimming = phys.inWater;
        player.isUnderwater = phys.underwater;
        player.waterContact = Math.max(player.waterContact, waterCoverage);
      }

      const movementInput = Math.hypot(phys.moveDirection[0], phys.moveDirection[2]);
      const speedMultiplier = player?.speedMultiplier ?? 1;
      let hVelX = phys.velocity[0];
      let hVelZ = phys.velocity[2];

      if (phys.inWater) {
        const waterGravity = Math.max(2.0, phys.gravity - phys.buoyancy * waterCoverage);
        phys.velocity[1] -= waterGravity * dt;

        if (phys.swimIntent) phys.velocity[1] += phys.swimAcceleration * dt;
        if (phys.sinkIntent) phys.velocity[1] -= phys.swimAcceleration * 0.65 * dt;
        if (!phys.swimIntent && !phys.sinkIntent) {
          phys.velocity[1] += phys.buoyancy * 0.3 * waterCoverage * dt;
        }

        if (movementInput > 0) {
          hVelX = phys.velocity[0] + phys.moveDirection[0] * phys.swimAcceleration * dt * speedMultiplier;
          hVelZ = phys.velocity[2] + phys.moveDirection[2] * phys.swimAcceleration * dt * speedMultiplier;
        } else {
          hVelX = phys.velocity[0];
          hVelZ = phys.velocity[2];
        }

        const currentAngle = (pos[0] * 0.11) + (pos[2] * 0.07) + performance.now() * 0.0004;
        hVelX += Math.sin(currentAngle) * 0.75 * waterCoverage * dt;
        hVelZ += Math.cos(currentAngle * 1.3) * 0.75 * waterCoverage * dt;

        const waterDrag = Math.exp(-phys.waterDrag * dt);
        hVelX *= waterDrag;
        hVelZ *= waterDrag;
        phys.velocity[1] *= Math.exp(-phys.waterDrag * 0.55 * dt);
      } else {
        // Apply Gravity
        phys.velocity[1] -= phys.gravity * dt;
      }

      const isMoving = phys.moveDirection[0] !== 0 || phys.moveDirection[2] !== 0;

      // ── State Machine: Grounded vs Airborn ──
      if (!phys.inWater && phys.onGround) {
        // Jump execution
        if (phys.jumpIntent) {
          phys.velocity[1] = phys.jumpForce;
          phys.onGround = false;
        }

        // Ground Acceleration
        if (isMoving) {
          hVelX += phys.moveDirection[0] * phys.groundAcceleration * dt * speedMultiplier;
          hVelZ += phys.moveDirection[2] * phys.groundAcceleration * dt * speedMultiplier;
        }

        // Ground Friction (Drag)
        // We apply exponential decay for smooth sliding/stopping
        const dragFactor = Math.exp(-phys.groundDrag * dt);
        hVelX *= dragFactor;
        hVelZ *= dragFactor;

      } else if (!phys.inWater) {
        // Air Acceleration (Air Control)
        if (isMoving) {
          hVelX += phys.moveDirection[0] * phys.airAcceleration * dt * speedMultiplier;
          hVelZ += phys.moveDirection[2] * phys.airAcceleration * dt * speedMultiplier;
        }

        // Air Friction
        const dragFactor = Math.exp(-phys.airDrag * dt);
        hVelX *= dragFactor;
        hVelZ *= dragFactor;
      }

      // Cap maximum horizontal speed
      const speedSq = hVelX * hVelX + hVelZ * hVelZ;
      const maxHorizontalSpeed = phys.inWater ? phys.maxSwimSpeed : phys.maxSpeed * speedMultiplier;
      if (speedSq > maxHorizontalSpeed * maxHorizontalSpeed) {
        const invSpeed = maxHorizontalSpeed / Math.sqrt(speedSq);
        hVelX *= invSpeed;
        hVelZ *= invSpeed;
      }

      phys.velocity[0] = hVelX;
      phys.velocity[2] = hVelZ;

      // Ensure tiny velocities are zeroed out to strictly stop sliding
      if (Math.abs(phys.velocity[0]) < 0.001) phys.velocity[0] = 0;
      if (Math.abs(phys.velocity[2]) < 0.001) phys.velocity[2] = 0;

      // X-Axis
      if (phys.velocity[0] !== 0) {
        const nextX = pos[0] + phys.velocity[0] * dt;
        if (!checkCollision(nextX, pos[1], pos[2])) {
          pos[0] = nextX;
        } else {
          phys.velocity[0] = 0;
        }
      }

      // Y-Axis
      let landedThisFrame = false;
      let impactSpeed = 0;
      if (phys.velocity[1] !== 0) {
        const nextY = pos[1] + phys.velocity[1] * dt;
        if (!checkCollision(pos[0], nextY, pos[2])) {
          pos[1] = nextY;
          phys.onGround = phys.inWater && waterCoverage > 0.75 ? phys.onGround : false;
        } else {
          // We hit the ground (or ceiling)
          if (phys.velocity[1] < 0) {
            impactSpeed = -phys.velocity[1];
            phys.onGround = true;
            landedThisFrame = !previousOnGround;
            // Snapping to block surface
            pos[1] = Math.floor(pos[1] - phys.height) + phys.height + 0.0001; 
          } else {
            // Hit ceiling
            pos[1] = Math.ceil(pos[1] + 0.1) - 0.1001; 
          }
          phys.velocity[1] = 0;
        }
      }

      // Z-Axis
      if (phys.velocity[2] !== 0) {
        const nextZ = pos[2] + phys.velocity[2] * dt;
        if (!checkCollision(pos[0], pos[1], nextZ)) {
          pos[2] = nextZ;
        } else {
          phys.velocity[2] = 0;
        }
      }

      if (!phys.onGround && !phys.inWater && phys.velocity[1] < 0) {
        phys.peakFallSpeed = Math.max(phys.peakFallSpeed, -phys.velocity[1]);
        player && (player.fallDistance = Math.max(player.fallDistance, Math.max(0, phys.fallStartY - pos[1])));
      }

      if (previousOnGround && !phys.onGround && !phys.inWater) {
        phys.fallStartY = pos[1];
        phys.peakFallSpeed = 0;
        if (player) player.fallDistance = 0;
      }

      if (phys.onGround) {
        phys.fallStartY = pos[1];
      }

      if (player && landedThisFrame) {
        const fallDistance = Math.max(player.fallDistance, Math.max(0, phys.fallStartY - pos[1]));
        const waterLanding = phys.inWater && waterCoverage > 0.45;
        let damage = 0;

        if (!waterLanding && (impactSpeed > 12 || fallDistance > 4)) {
          damage = Math.max(0, (impactSpeed - 12) * 0.75 + (fallDistance - 4) * 0.45);
        } else if (waterLanding && impactSpeed > 18) {
          damage = Math.max(0, (impactSpeed - 18) * 0.35);
        }

        player.lastImpactSpeed = impactSpeed;
        player.fallDistance = 0;
        phys.peakFallSpeed = 0;

        if (damage > 0) {
          player.health = Math.max(0, player.health - damage);
          player.damageFlash = Math.min(1, player.damageFlash + Math.min(0.9, damage / 8));
          player.cameraTrauma = Math.min(1, player.cameraTrauma + Math.min(0.85, damage / 12));
        } else if (impactSpeed > 7) {
          player.cameraTrauma = Math.min(1, player.cameraTrauma + 0.08);
        }
      }
    }
  }
}
