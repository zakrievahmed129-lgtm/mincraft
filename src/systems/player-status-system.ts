import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { PlayerStateComponent } from '../ecs/components/player-state';
import type { PhysicsComponent } from '../ecs/components/physics';
import type { CameraComponent } from './camera-system';
import type { UI } from '../ui';

export class PlayerStatusSystem implements System {
  readonly name = 'PlayerStatusSystem';

  private ui?: UI;
  private audioCtx: AudioContext | null = null;

  constructor(ui?: UI) {
    this.ui = ui;
  }

  update(world: World, dt: number): void {
    const playerStore = world.getStore<PlayerStateComponent>('playerState');
    const physicsStore = world.getStore<PhysicsComponent>('physics');
    const cameraStore = world.getStore<CameraComponent>('camera');

    for (const [entityId, player] of playerStore) {
      const phys = physicsStore.get(entityId);
      const cam = cameraStore.get(entityId);

      const movement = phys ? Math.hypot(phys.moveDirection[0], phys.moveDirection[2]) : 0;
      const hungerDrain = (0.010 + movement * 0.018 + (player.isSwimming ? 0.02 : 0)) * dt;

      if (player.saturation > 0) {
        player.saturation = Math.max(0, player.saturation - hungerDrain * 1.4);
      } else {
        player.hunger = Math.max(0, player.hunger - hungerDrain);
      }

      if (player.hunger < 8) {
        player.stomachCooldown -= dt;
        if (player.stomachCooldown <= 0) {
          this.playGurgle(Math.max(0.2, 1 - player.hunger / 8));
          player.stomachCooldown = 8 + Math.random() * 6;
        }
      } else {
        player.stomachCooldown = Math.min(player.stomachCooldown + dt * 0.5, 10);
      }

      if (player.hunger <= 0) {
        player.starvationCooldown -= dt;
        if (player.starvationCooldown <= 0) {
          player.health = Math.max(0, player.health - 1);
          player.damageFlash = Math.min(1, player.damageFlash + 0.25);
          player.cameraTrauma = Math.min(1, player.cameraTrauma + 0.08);
          player.starvationCooldown = 1.5;
        }
      } else {
        player.starvationCooldown = 1.5;
      }

      if (player.hunger < 4) {
        player.speedMultiplier = 0.72;
      } else if (player.hunger < 8) {
        player.speedMultiplier = 0.86;
      } else {
        player.speedMultiplier = 1;
      }

      player.damageFlash = Math.max(0, player.damageFlash - dt * 0.65);
      player.cameraTrauma = Math.max(0, player.cameraTrauma - dt * (player.isSwimming ? 0.65 : 1.35));
      player.waterContact = Math.max(0, player.waterContact - dt * 0.8);

      if (player.health <= 0 && cam && phys) {
        cam.position[0] = 0;
        cam.position[1] = 42;
        cam.position[2] = 0;
        phys.velocity[0] = 0;
        phys.velocity[1] = 0;
        phys.velocity[2] = 0;
        phys.onGround = false;
        player.health = player.maxHealth;
        player.hunger = Math.max(player.maxHunger * 0.6, 12);
        player.saturation = player.maxSaturation * 0.5;
        player.damageFlash = 0.6;
        player.cameraTrauma = 0.3;
      }

      this.ui?.setHealth(player.health, player.maxHealth);
      this.ui?.setHunger(player.hunger, player.maxHunger, player.saturation, player.maxSaturation);
      this.ui?.setUnderwater(player.isUnderwater, player.waterContact);
      this.ui?.setDamageFlash(player.damageFlash);

      if (player.hunger < 4) {
        this.ui?.setStatusMessage('Faim critique: vitesse reduite et degats progressifs');
      } else if (player.isUnderwater) {
        this.ui?.setStatusMessage('Sous l eau: deplacement ralenti et vision bleutee');
      }
    }
  }

  private playGurgle(intensity: number): void {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    if (!this.audioCtx) {
      this.audioCtx = new AudioCtor();
    }

    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const lfo = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const lfoGain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.45);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(4, now);
    lfoGain.gain.value = 8;

    filter.type = 'lowpass';
    filter.frequency.value = 420;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.02 * intensity, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.6);
    lfo.stop(now + 0.6);
  }
}
