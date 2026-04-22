export interface PlayerStateComponent {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  saturation: number;
  maxSaturation: number;
  speedMultiplier: number;
  isSwimming: boolean;
  isUnderwater: boolean;
  waterContact: number;
  fallDistance: number;
  lastImpactSpeed: number;
  damageFlash: number;
  cameraTrauma: number;
  stomachCooldown: number;
  starvationCooldown: number;
}

export function createPlayerStateComponent(): PlayerStateComponent {
  return {
    health: 20,
    maxHealth: 20,
    hunger: 20,
    maxHunger: 20,
    saturation: 10,
    maxSaturation: 10,
    speedMultiplier: 1,
    isSwimming: false,
    isUnderwater: false,
    waterContact: 0,
    fallDistance: 0,
    lastImpactSpeed: 0,
    damageFlash: 0,
    cameraTrauma: 0,
    stomachCooldown: 8,
    starvationCooldown: 1.5,
  };
}
