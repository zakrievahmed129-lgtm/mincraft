/**
 * CameraSystem — FPS camera with WASD + mouse look.
 * Reads InputManager, updates CameraComponent, builds viewProjection matrix.
 */
import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { InputManager } from '../core/input';
import type { PlayerStateComponent } from '../ecs/components/player-state';
import { Vec3, vec3, vec3Cross, vec3Normalize, vec3ScaleAndAdd } from '../math/vec3';
import { Mat4, mat4, mat4Perspective, mat4LookAt, mat4Multiply } from '../math/mat4';

export interface CameraComponent {
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  far: number;
  speed: number;
  sensitivity: number;
  position: Vec3;
  viewProjection: Mat4;
}

export function createDefaultCamera(): CameraComponent {
  return {
    yaw: 0,
    pitch: 0,
    fov: Math.PI / 3,    // 60°
    near: 0.1,
    far: 500,
    speed: 5,
    sensitivity: 0.002,
    position: vec3(0, 2, 5),
    viewProjection: mat4(),
  };
}

// Pre-allocated scratch vectors
const _forward = vec3();
const _right   = vec3();
const _target  = vec3();
const _worldUp = vec3(0, 1, 0);
const _view    = mat4();
const _proj    = mat4();
const _intent  = vec3();

export class CameraSystem implements System {
  readonly name = 'CameraSystem';
  private input: InputManager;
  private canvas: HTMLCanvasElement;

  constructor(input: InputManager, canvas: HTMLCanvasElement) {
    this.input = input;
    this.canvas = canvas;
  }

  update(world: World, dt: number): void {
    const store = world.getStore<CameraComponent>('camera');

    for (const [entityId, cam] of store) {
      // ── Mouse look ──
      if (this.input.isPointerLocked) {
        cam.yaw   -= this.input.mouseDeltaX * cam.sensitivity;
        cam.pitch -= this.input.mouseDeltaY * cam.sensitivity;
        cam.pitch  = Math.max(-1.5, Math.min(1.5, cam.pitch)); // clamp ±~86°
      }

      // ── Direction vectors ──
      _forward[0] = Math.cos(cam.pitch) * Math.sin(cam.yaw);
      _forward[1] = Math.sin(cam.pitch);
      _forward[2] = Math.cos(cam.pitch) * Math.cos(cam.yaw);

      vec3Cross(_right, _forward, _worldUp);
      vec3Normalize(_right, _right);

      // ── WASD movement ──
      const physStore = world.getStore<any>('physics'); // Cast to any to avoid importing component just for types if we want, but letting's use duck typing or inject. Actually we can require it or check.
      const phys = physStore ? physStore.get(entityId) : undefined;
      const playerStore = world.getStore<PlayerStateComponent>('playerState');
      const player = playerStore ? playerStore.get(entityId) : undefined;

      if (phys) {
        // Accumulate input direction intent
        _intent[0] = 0; _intent[1] = 0; _intent[2] = 0;
        if (this.input.isKeyDown('KeyW')) vec3ScaleAndAdd(_intent, _intent, _forward, 1);
        if (this.input.isKeyDown('KeyS')) vec3ScaleAndAdd(_intent, _intent, _forward, -1);
        if (this.input.isKeyDown('KeyA')) vec3ScaleAndAdd(_intent, _intent, _right, -1);
        if (this.input.isKeyDown('KeyD')) vec3ScaleAndAdd(_intent, _intent, _right, 1);
        
        // Strip out Y component from intent so we don't try to fly upwards
        _intent[1] = 0;

        // Normalize intent so diagonal movement isn't faster
        const lenSq = _intent[0] * _intent[0] + _intent[2] * _intent[2];
        if (lenSq > 0.001) {
          const invLen = 1.0 / Math.sqrt(lenSq);
          _intent[0] *= invLen;
          _intent[2] *= invLen;
        }

        phys.moveDirection[0] = _intent[0];
        phys.moveDirection[1] = _intent[1];
        phys.moveDirection[2] = _intent[2];

        phys.jumpIntent = this.input.isKeyDown('Space');
        phys.swimIntent = this.input.isKeyDown('Space');
        phys.sinkIntent = this.input.isKeyDown('ShiftLeft');

      } else {
        // Fly mode (Debug)
        const spd = cam.speed * dt;
        if (this.input.isKeyDown('KeyW')) vec3ScaleAndAdd(cam.position, cam.position, _forward, spd);
        if (this.input.isKeyDown('KeyS')) vec3ScaleAndAdd(cam.position, cam.position, _forward, -spd);
        if (this.input.isKeyDown('KeyA')) vec3ScaleAndAdd(cam.position, cam.position, _right, -spd);
        if (this.input.isKeyDown('KeyD')) vec3ScaleAndAdd(cam.position, cam.position, _right, spd);
        if (this.input.isKeyDown('Space'))     cam.position[1] += spd;
        if (this.input.isKeyDown('ShiftLeft')) cam.position[1] -= spd;
      }

      const effectTime = performance.now() * 0.001;
      const trauma = player?.cameraTrauma ?? 0;
      const swimSway = phys?.inWater ? 0.004 : 0;
      const shakenYaw = cam.yaw + Math.sin(effectTime * 19.0) * trauma * 0.018;
      const shakenPitch = cam.pitch + Math.cos(effectTime * 23.0) * trauma * 0.014 + Math.sin(effectTime * 2.4) * swimSway;
      const aspect = this.canvas.width / this.canvas.height;
      _forward[0] = Math.cos(shakenPitch) * Math.sin(shakenYaw);
      _forward[1] = Math.sin(shakenPitch);
      _forward[2] = Math.cos(shakenPitch) * Math.cos(shakenYaw);
      _target[0] = cam.position[0] + _forward[0];
      _target[1] = cam.position[1] + _forward[1];
      _target[2] = cam.position[2] + _forward[2];

      mat4LookAt(_view, cam.position, _target, _worldUp);
      const effectiveFov = cam.fov + trauma * 0.055 + (phys?.inWater ? 0.018 : 0);
      mat4Perspective(_proj, effectiveFov, aspect, cam.near, cam.far);
      mat4Multiply(cam.viewProjection, _proj, _view);

      // ── HUD ──
      const posEl = document.getElementById('pos');
      if (posEl) {
        posEl.textContent = `${cam.position[0].toFixed(1)}, ${cam.position[1].toFixed(1)}, ${cam.position[2].toFixed(1)}`;
      }
    }
  }
}
