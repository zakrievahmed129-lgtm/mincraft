/**
 * ChunkRenderSystem — Refactored for Deferred Rendering (GBuffer, SSAO, Lighting).
 */
import type { System } from '../ecs/types';
import type { World } from '../ecs/world';
import type { GPUContext } from '../core/gpu-context';
import type { CameraComponent } from './camera-system';
import type { PlayerStateComponent } from '../ecs/components/player-state';
import { ChunkManager } from '../world/chunk-manager';
import { CHUNK_SIZE, type Chunk } from '../world/chunk';
import { frustumFromVP, frustumContainsAABB } from '../math/frustum';

import { createGBufferPipeline, type GBufferPipelineResources } from '../renderer/gbuffer-pipeline';
import { createSSAOResources, type SSAOResources } from '../renderer/ssao-pipeline';
import { createDeferredResources, type DeferredResources } from '../renderer/deferred-pipeline';

// Matrix inversion utility (simplified standard 4x4 inversion)
function invertMat4(out: Float32Array, a: Float32Array): boolean {
  let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
      a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
      a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) return false;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return true;
}

export class ChunkRenderSystem implements System {
  readonly name = 'ChunkRenderSystem';

  private gpu: GPUContext;
  private chunkMgr: ChunkManager;

  // Render resources
  private gbuffer!: GBufferPipelineResources;
  private ssao!: SSAOResources;
  private deferred!: DeferredResources;

  private gbufferBg!: GPUBindGroup;
  private ssaoBg!: GPUBindGroup;
  private blurBg!: GPUBindGroup;
  private lightingBg!: GPUBindGroup;

  // Double-buffering garbage collection to prevent flickering during remesh
  private garbageQueue: { vb: GPUBuffer | null, ib: GPUBuffer | null, framesLeft: number }[] = [];
  private bufferUploadQueue: Chunk[] = [];
  private bufferUploadTimer: number | null = null;

  // Pre-allocated buffers to avoid GC pressure
  private camData = new Float32Array(20);
  private invVP = new Float32Array(16);
  private ssaoData = new Float32Array(28);
  private lightData = new Float32Array(12);
  private uboData = new Float32Array(4096 * 64);

  public stats = { visibleChunks: 0, totalChunks: 0, totalTriangles: 0 };

  constructor(gpu: GPUContext, chunkMgr: ChunkManager) {
    this.gpu = gpu;
    this.chunkMgr = chunkMgr;
  }

  init(world: World): void {
    this.gbuffer = createGBufferPipeline(this.gpu);
    this.ssao = createSSAOResources(this.gpu);
    this.deferred = createDeferredResources(this.gpu);

    this.gbufferBg = this.gpu.device.createBindGroup({
      layout: this.gbuffer.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.gbuffer.cameraBuffer } },
        { binding: 1, resource: { buffer: this.gbuffer.chunkUniformBuffer, size: 16, offset: 0 } },
        { binding: 2, resource: this.gbuffer.atlasView },
        { binding: 3, resource: this.gbuffer.atlasSampler },
      ],
    });

    // Initial setup of post-processing bind groups
    this.setupPostProcessingBindGroups();

    // Listen to resize to recreate target-dependent bind groups
    // GPUContext handles recreation of its G-Buffer targets synchronously before next frame.
    window.addEventListener('resize', () => {
      // Recreate the ssao render targets and bindgroups synchronously
      this.ssao.ssaoTarget.destroy();
      this.ssao.blurTarget.destroy();
      
      this.ssao.ssaoTarget = this.gpu.device.createTexture({
        size: [this.gpu.canvas.width, this.gpu.canvas.height], format: 'r8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.ssao.blurTarget = this.gpu.device.createTexture({
        size: [this.gpu.canvas.width, this.gpu.canvas.height], format: 'r8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });

      this.setupPostProcessingBindGroups();
    });
  }

  private setupPostProcessingBindGroups() {
    const { device, depthTexture, gAlbedo, gNormalRoughMetal } = this.gpu;

    // SSAO Gen BindGroup
    this.ssaoBg = device.createBindGroup({
      layout: this.ssao.ssaoBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.gbuffer.cameraBuffer } },
        { binding: 1, resource: { buffer: this.ssao.ssaoUniformBuffer } },
        { binding: 2, resource: depthTexture.createView() },
        { binding: 3, resource: gNormalRoughMetal.createView() },
        { binding: 4, resource: this.ssao.noiseTexture.createView() },
      ]
    });

    // Blur BindGroup
    this.blurBg = device.createBindGroup({
      layout: this.ssao.blurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.gbuffer.cameraBuffer } },
        { binding: 1, resource: { buffer: this.ssao.ssaoUniformBuffer } },
        { binding: 2, resource: depthTexture.createView() },
        { binding: 3, resource: this.ssao.ssaoTarget.createView() }, // blur reads from SSAO
        { binding: 4, resource: this.ssao.noiseTexture.createView() }, // dummy
      ]
    });

    // Deferred Lighting BindGroup
    this.lightingBg = device.createBindGroup({
      layout: this.deferred.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.gbuffer.cameraBuffer } },
        { binding: 1, resource: { buffer: this.deferred.lightsBuffer } },
        { binding: 2, resource: depthTexture.createView() },
        { binding: 3, resource: gAlbedo.createView() },
        { binding: 4, resource: gNormalRoughMetal.createView() },
        { binding: 5, resource: this.ssao.blurTarget.createView() }, // lighting reads from blurred SSAO
        { binding: 6, resource: { buffer: this.deferred.invVPBuffer } },
      ]
    });
  }

  update(world: World, _dt: number): void {
    this.enqueueDirtyChunks();

    const { device, context } = this.gpu;

    // ── Camera & Uniforms Update ──
    const camStore = world.getStore<CameraComponent>('camera');
    let cam: CameraComponent | undefined;
    for (const [, c] of camStore) { cam = c; break; }
    if (!cam) return;

    // Camera UBO
    this.camData.set(cam.viewProjection, 0);
    this.camData[16] = cam.position[0];
    this.camData[17] = cam.position[1];
    this.camData[18] = cam.position[2];
    this.camData[19] = performance.now() / 1000.0; // Pass global time in W component
    device.queue.writeBuffer(this.gbuffer.cameraBuffer, 0, this.camData as any);

    // Update chunk async loaders around camera
    this.chunkMgr.update(cam.position);

    // Inverse VP for World Position Reconstruction
    invertMat4(this.invVP, cam.viewProjection);
    device.queue.writeBuffer(this.deferred.invVPBuffer, 0, this.invVP as any);

    // SSAO Uniforms: Inverse VP, resolution, radius, bias, strength
    this.ssaoData.set(this.invVP, 0); // 0-15
    this.ssaoData[16] = this.gpu.canvas.width;
    this.ssaoData[17] = this.gpu.canvas.height;
    this.ssaoData[18] = 0.5; // SSAO Radius
    this.ssaoData[19] = 0.05; // SSAO Bias
    this.ssaoData[20] = 1.0; // SSAO Strength
    device.queue.writeBuffer(this.ssao.ssaoUniformBuffer, 0, this.ssaoData as any);

    // Update global lights if changed via window.lightParams
    if (window.lightParams) {
      const p = window.lightParams;
      const playerStore = world.getStore<PlayerStateComponent>('playerState');
      let underwaterAmount = 0;
      for (const [, player] of playerStore) {
        underwaterAmount = player.isUnderwater ? 1 : 0;
        break;
      }
      // Normalize direction
      const dl = Math.sqrt(p.sunDx*p.sunDx + p.sunDy*p.sunDy + p.sunDz*p.sunDz) || 1;
      this.lightData[0] = p.sunDx/dl;
      this.lightData[1] = p.sunDy/dl;
      this.lightData[2] = p.sunDz/dl;
      this.lightData[3] = p.sunIntensity;
      this.lightData[4] = p.sunR;
      this.lightData[5] = p.sunG;
      this.lightData[6] = p.sunB;
      this.lightData[7] = p.ambientIntensity;
      this.lightData[8] = underwaterAmount;
      this.lightData[9] = 0;
      this.lightData[10] = 0;
      this.lightData[11] = 0;
      device.queue.writeBuffer(this.deferred.lightsBuffer, 0, this.lightData as any);
    }

    const bufStart = performance.now();
    const frustum = frustumFromVP(cam.viewProjection);
    
    interface VisibleChunk { chunk: Chunk, dynamicOffset: number }
    const visibleChunks: VisibleChunk[] = [];
    const MAX_CHUNKS = 4096;
    let offsetIdx = 0;

    this.stats.totalTriangles = 0;

    // Process chunks with Frustum Culling
    for (const chunk of this.chunkMgr.allChunks()) {
      if (chunk.isEmpty || chunk.indexCount === 0) continue;

      if (frustumContainsAABB(frustum, chunk.worldX, chunk.worldY, chunk.worldZ, 
          chunk.worldX + CHUNK_SIZE, chunk.worldY + CHUNK_SIZE, chunk.worldZ + CHUNK_SIZE)) {
        if (offsetIdx < MAX_CHUNKS) {
          const offset = offsetIdx * 256;
          this.uboData[(offset/4)+0] = chunk.worldX;
          this.uboData[(offset/4)+1] = chunk.worldY;
          this.uboData[(offset/4)+2] = chunk.worldZ;
          this.uboData[(offset/4)+3] = chunk.spawnTime; // Used for Spawn Animation!

          visibleChunks.push({ chunk, dynamicOffset: offset });
          
          this.stats.totalTriangles += chunk.indexCount / 3;
          offsetIdx++;
        }
      }
    }

    this.stats.visibleChunks = visibleChunks.length;
    this.stats.totalChunks = this.chunkMgr.chunkCount;

    if (visibleChunks.length > 0) {
      device.queue.writeBuffer(this.gbuffer.chunkUniformBuffer, 0, this.uboData as any, 0, offsetIdx * (256/4));
    }
    const bufTime = performance.now() - bufStart;

    // Update profiler HUD occasionally
    const framesSinceReset = (performance.now() % 1000) < 20; // roughly once per second
    if (framesSinceReset) {
      const elB = document.getElementById('prof-buf');
      if (elB) elB.textContent = bufTime.toFixed(2);
    }

    // Update HUD stats
    const chEl = document.getElementById('chunks');
    if (chEl) chEl.textContent = `${this.stats.visibleChunks} / ${this.stats.totalChunks}`;
    const triEl = document.getElementById('triangles');
    if (triEl) triEl.textContent = `${this.stats.totalTriangles.toLocaleString()}`;


    // ==========================================
    // MULTI-PASS RENDER PIPELINE
    // ==========================================
    const gpuStart = performance.now();
    const encoder = device.createCommandEncoder();

    // 1. G-BUFFER PASS
    if (visibleChunks.length > 0) {
      const gbufferPass = encoder.beginRenderPass({
        label: 'GBuffer Pass',
        colorAttachments: [
          { view: this.gpu.gAlbedo.createView(), clearValue: {r:0,g:0,b:0,a:0}, loadOp: 'clear', storeOp: 'store' },
          { view: this.gpu.gNormalRoughMetal.createView(), clearValue: {r:0,g:0,b:0,a:0}, loadOp: 'clear', storeOp: 'store' }
        ],
        depthStencilAttachment: {
          view: this.gpu.depthTexture.createView(), depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
        }
      });
      gbufferPass.setPipeline(this.gbuffer.pipeline);
      for (const { chunk, dynamicOffset } of visibleChunks) {
        if (!chunk.vertexBuffer || !chunk.indexBuffer) continue;
        gbufferPass.setBindGroup(0, this.gbufferBg, [dynamicOffset]);
        gbufferPass.setVertexBuffer(0, chunk.vertexBuffer);
        gbufferPass.setIndexBuffer(chunk.indexBuffer, 'uint32');
        gbufferPass.drawIndexed(chunk.indexCount);
      }
      gbufferPass.end();
    }

    // 2. SSAO GENERATION PASS
    const ssaoPass = encoder.beginRenderPass({
      label: 'SSAO Pass',
      colorAttachments: [{ view: this.ssao.ssaoTarget.createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r:1,g:1,b:1,a:1} }]
    });
    ssaoPass.setPipeline(this.ssao.ssaoPipeline);
    ssaoPass.setBindGroup(0, this.ssaoBg);
    ssaoPass.draw(3); // Fullscreen triangle
    ssaoPass.end();

    // 3. SSAO BLUR PASS
    const blurPass = encoder.beginRenderPass({
      label: 'SSAO Blur Pass',
      colorAttachments: [{ view: this.ssao.blurTarget.createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r:1,g:1,b:1,a:1} }]
    });
    blurPass.setPipeline(this.ssao.blurPipeline);
    blurPass.setBindGroup(0, this.blurBg);
    blurPass.draw(3);
    blurPass.end();

    // 4. DEFERRED LIGHTING PASS (To Screen)
    const lightingPass = encoder.beginRenderPass({
      label: 'Lighting Pass',
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r:0,g:0,b:0,a:1} }]
    });
    lightingPass.setPipeline(this.deferred.pipeline);
    lightingPass.setBindGroup(0, this.lightingBg);
    lightingPass.draw(3);
    lightingPass.end();

    device.queue.submit([encoder.finish()]);
    const gpuDispTime = performance.now() - gpuStart;

    if (framesSinceReset) {
      const elG = document.getElementById('prof-gpu');
      if (elG) elG.textContent = gpuDispTime.toFixed(2);
    }

    this.processGarbage();
  }

  private processGarbage(): void {
    for (let i = this.garbageQueue.length - 1; i >= 0; i--) {
      const item = this.garbageQueue[i];
      item.framesLeft--;
      if (item.framesLeft <= 0) {
        item.vb?.destroy();
        item.ib?.destroy();
        this.garbageQueue.splice(i, 1);
      }
    }
  }

  private enqueueDirtyChunks(): void {
    for (const chunk of this.chunkMgr.dirtyChunks()) {
      if (!chunk.pendingMesh || chunk.uploadQueued || chunk.uploadInProgress) continue;
      chunk.uploadQueued = true;
      this.bufferUploadQueue.push(chunk);
    }

    this.scheduleBufferUpload();
  }

  private scheduleBufferUpload(): void {
    if (this.bufferUploadTimer !== null || this.bufferUploadQueue.length === 0) return;

    this.bufferUploadTimer = window.setTimeout(() => {
      this.bufferUploadTimer = null;
      this.processOneBufferUpload();
      if (this.bufferUploadQueue.length > 0) {
        this.scheduleBufferUpload();
      }
    }, 0);
  }

  private processOneBufferUpload(): void {
    while (this.bufferUploadQueue.length > 0) {
      const chunk = this.bufferUploadQueue.shift()!;
      chunk.uploadQueued = false;

      if (chunk.disposed || chunk.uploadInProgress || !chunk.pendingMesh) continue;

      const pending = chunk.pendingMesh;
      chunk.uploadInProgress = true;

      // Keep old buffers alive until the replacement upload is complete.
      if (chunk.vertexBuffer || chunk.indexBuffer) {
        this.garbageQueue.push({ vb: chunk.vertexBuffer, ib: chunk.indexBuffer, framesLeft: 3 });
      }

      if (pending.indexCount > 0) {
        const vertexData = pending.vertices as unknown as Float32Array<ArrayBuffer>;
        const indexData = pending.indices as unknown as Uint32Array<ArrayBuffer>;

        chunk.vertexBuffer = this.gpu.device.createBuffer({
          size: pending.vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.gpu.device.queue.writeBuffer(chunk.vertexBuffer, 0, vertexData as any);

        chunk.indexBuffer = this.gpu.device.createBuffer({
          size: pending.indices.byteLength,
          usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.gpu.device.queue.writeBuffer(chunk.indexBuffer, 0, indexData as any);

        chunk.indexCount = pending.indexCount;
        chunk.vertexCount = pending.vertexCount;
      } else {
        chunk.vertexBuffer = null;
        chunk.indexBuffer = null;
        chunk.indexCount = 0;
        chunk.vertexCount = 0;
      }

      if (chunk.pendingMesh === pending) {
        chunk.pendingMesh = null;
        chunk.dirty = false;
      } else {
        chunk.dirty = true;
        if (!chunk.uploadQueued) {
          chunk.uploadQueued = true;
          this.bufferUploadQueue.push(chunk);
        }
      }

      chunk.uploadInProgress = false;
      return;
    }
  }
}
