/**
 * RenderSystem — Collects instance transforms, uploads to GPU, issues draw calls.
 * Designed for massive instancing: single drawIndexed call for all voxels.
 */
import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { GPUContext } from '../core/gpu-context';
import { createRenderResources, type RenderResources } from '../renderer/pipeline';
import type { CameraComponent } from './camera-system';
import { Vec3 } from '../math/vec3';

// ── Component data types ──

export interface TransformComponent {
  position: Vec3;
  rotation: Vec3;  // Euler XYZ radians
  scale: Vec3;
}

export interface RenderableComponent {
  visible: boolean;
}

// ── System ──

export class RenderSystem implements System {
  readonly name = 'RenderSystem';

  private gpu: GPUContext;
  private res!: RenderResources;
  private instanceData!: Float32Array;

  constructor(gpu: GPUContext) {
    this.gpu = gpu;
  }

  init(world: World): void {
    this.res = createRenderResources(this.gpu);
    this.instanceData = new Float32Array(this.res.maxInstances * 16);
  }

  update(world: World, _dt: number): void {
    const { device, context } = this.gpu;
    const { pipeline, vertexBuffer, indexBuffer, cameraBuffer, instanceBuffer, bindGroup, geometry } = this.res;

    // ── Camera uniforms ──
    const camStore = world.getStore<CameraComponent>('camera');
    let cam: CameraComponent | undefined;
    for (const [, c] of camStore) { cam = c; break; }
    if (!cam) return;

    const camData = new Float32Array(20); // mat4(16) + vec4(4)
    camData.set(cam.viewProjection, 0);
    camData[16] = cam.position[0];
    camData[17] = cam.position[1];
    camData[18] = cam.position[2];
    camData[19] = 0; // pad
    device.queue.writeBuffer(cameraBuffer, 0, camData as any);

    // ── Collect visible instances ──
    const transforms  = world.getStore<TransformComponent>('transform');
    const renderables = world.getStore<RenderableComponent>('renderable');

    let count = 0;
    for (const [entity, tr] of transforms) {
      if (!renderables.has(entity)) continue;
      const r = renderables.get(entity)!;
      if (!r.visible) continue;
      if (count >= this.res.maxInstances) break;

      this.writeModelMatrix(tr, count * 16);
      count++;
    }

    if (count === 0) return;

    // Upload instance matrices
    device.queue.writeBuffer(instanceBuffer, 0, this.instanceData as any, 0, count * 16);

    // Update HUD
    const instEl = document.getElementById('instances');
    if (instEl) instEl.textContent = String(count);

    // ── Render pass ──
    const encoder = device.createCommandEncoder({ label: 'Frame Encoder' });

    const pass = encoder.beginRenderPass({
      label: 'Main Pass',
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.53, g: 0.68, b: 0.88, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.gpu.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(geometry.indexCount, count);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /** Build a model matrix from TransformComponent into the instance buffer */
  private writeModelMatrix(tr: TransformComponent, offset: number): void {
    const { position: p, rotation: r, scale: s } = tr;
    const cx = Math.cos(r[0]), sx1 = Math.sin(r[0]);
    const cy = Math.cos(r[1]), sy1 = Math.sin(r[1]);
    const cz = Math.cos(r[2]), sz1 = Math.sin(r[2]);

    const d = this.instanceData;
    // Column 0
    d[offset]     = (cy * cz + sy1 * sx1 * sz1) * s[0];
    d[offset + 1] = (cx * sz1) * s[0];
    d[offset + 2] = (-sy1 * cz + cy * sx1 * sz1) * s[0];
    d[offset + 3] = 0;
    // Column 1
    d[offset + 4] = (cy * -sz1 + sy1 * sx1 * cz) * s[1];
    d[offset + 5] = (cx * cz) * s[1];
    d[offset + 6] = (sy1 * sz1 + cy * sx1 * cz) * s[1];
    d[offset + 7] = 0;
    // Column 2
    d[offset + 8]  = (sy1 * cx) * s[2];
    d[offset + 9]  = (-sx1) * s[2];
    d[offset + 10] = (cy * cx) * s[2];
    d[offset + 11] = 0;
    // Column 3 (translation)
    d[offset + 12] = p[0];
    d[offset + 13] = p[1];
    d[offset + 14] = p[2];
    d[offset + 15] = 1;
  }
}
