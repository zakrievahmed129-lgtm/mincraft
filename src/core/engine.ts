/**
 * Engine — Main loop owner.
 * Owns the GPUDevice, orchestrates ECS World, manages frame timing.
 */
import { World } from '../ecs/world';
import { GPUContext, initGPU, createGBuffer } from './gpu-context';
import { InputManager } from './input';

export class Engine {
  readonly world: World;
  gpu!: GPUContext;
  input!: InputManager;

  // Performance counters
  fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private lastTime = 0;
  private running = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.world = new World();
  }

  async init(): Promise<void> {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.handleResize());

    this.gpu = await initGPU(this.canvas);
    this.input = new InputManager(this.canvas);

    await this.world.init();
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop(): void {
    this.running = false;
  }

  private loop(now: number): void {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms
    this.lastTime = now;

    // FPS counter
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1.0) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1.0;
      const el = document.getElementById('fps');
      if (el) el.textContent = String(this.fps);
    }

    // Tick all ECS systems
    const cpuStart = performance.now();
    this.world.update(dt);
    const cpuTime = performance.now() - cpuStart;

    // Update profiler HUD occasionally
    if (this.frameCount === 0) {
      const el = document.getElementById('prof-cpu');
      if (el) el.textContent = cpuTime.toFixed(2);
    }

    // Reset per-frame input
    this.input.resetFrame();

    requestAnimationFrame((t) => this.loop(t));
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  private handleResize(): void {
    this.resizeCanvas();
    if (this.gpu) {
      if (this.gpu.depthTexture) this.gpu.depthTexture.destroy();
      if (this.gpu.gAlbedo) this.gpu.gAlbedo.destroy();
      if (this.gpu.gNormalRoughMetal) this.gpu.gNormalRoughMetal.destroy();
      
      const res = createGBuffer(
        this.gpu.device,
        this.canvas.width,
        this.canvas.height
      );
      this.gpu.depthTexture = res.depth;
      this.gpu.gAlbedo = res.albedo;
      this.gpu.gNormalRoughMetal = res.normal;
    }
  }
}
