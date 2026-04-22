import type { System } from '../ecs/types';
import type { UI } from '../ui';

export class EnvironmentSystem implements System {
  readonly name = 'EnvironmentSystem';

  private ui?: UI;
  private dayTime = 0.28;
  private readonly cycleDuration = 1200;
  private activeNight = -1;

  constructor(ui?: UI) {
    this.ui = ui;
  }

  update(_world: any, dt: number): void {
    this.dayTime = (this.dayTime + dt / this.cycleDuration) % 1;

    const angle = this.dayTime * Math.PI * 2 - Math.PI * 0.5;
    const sunHeight = Math.sin(angle);
    const daylight = smoothstep(-0.16, 0.22, sunHeight);
    const dusk = 1 - Math.min(1, Math.abs(sunHeight) / 0.35);
    const moonlight = smoothstep(-0.02, -0.45, sunHeight);

    const sunColor = mix3([1.0, 0.95, 0.86], [1.0, 0.55, 0.34], dusk * (1 - daylight * 0.5));
    const ambient = 0.18 + daylight * 1.75 + moonlight * 0.18;
    const sunIntensity = 0.12 + daylight * 3.35;

    window.lightParams = {
      sunDx: Math.cos(angle) * 0.55,
      sunDy: Math.max(-0.3, sunHeight),
      sunDz: 0.35 + Math.sin(angle * 0.5) * 0.2,
      sunIntensity,
      sunR: sunColor[0],
      sunG: sunColor[1],
      sunB: sunColor[2],
      ambientIntensity: ambient,
    };

    this.ui?.setTimeOfDay(this.formatClock(this.dayTime), daylight);

    const currentNight = Math.floor(this.dayTime + 0.75);
    if (daylight < 0.12 && this.activeNight !== currentNight) {
      this.activeNight = currentNight;
      const events = [
        'Nuit calme: lumiere lunaire froide',
        'Brume nocturne: contraste plus doux',
        'Ciel clair: reflets plus nets sur l eau',
      ];
      this.ui?.setStatusMessage(events[currentNight % events.length]);
    }
  }

  private formatClock(t: number): string {
    const totalMinutes = Math.floor(((t + 0.25) % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
