/**
 * GBufferPipeline — Renders chunk meshes into the G-Buffer (Deferred).
 */
import type { GPUContext } from '../core/gpu-context';
import { GBUFFER_SHADER } from './shaders/gbuffer.wgsl';
import { createVoxelTextureAtlas } from './voxel-texture-atlas';

export interface GBufferPipelineResources {
  pipeline: GPURenderPipeline;
  cameraBuffer: GPUBuffer;
  chunkUniformBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
  atlasView: GPUTextureView;
  atlasSampler: GPUSampler;
}

export function createGBufferPipeline(gpu: GPUContext): GBufferPipelineResources {
  const { device } = gpu;

  const shaderModule = device.createShaderModule({
    label: 'GBuffer Shader',
    code: GBUFFER_SHADER,
  });

  const atlas = createVoxelTextureAtlas(device);

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 10 * 4,
    attributes: [
      { shaderLocation: 0, offset: 0,     format: 'float32x3' }, // position
      { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
      { shaderLocation: 2, offset: 6 * 4, format: 'float32'   }, // blockType
      { shaderLocation: 3, offset: 7 * 4, format: 'float32x2' }, // face uv
      { shaderLocation: 4, offset: 9 * 4, format: 'float32'   }, // vertex ao
    ],
  };

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'GBuffer BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'GBuffer Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex:   { module: shaderModule, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { 
      module: shaderModule, 
      entryPoint: 'fs_main', 
      targets: [
        { format: 'bgra8unorm' }, // Albedo
        { format: 'rgba16float' } // Normal/Rough/Metal
      ] 
    },
    // Some greedy-meshed chunk quads currently arrive with inconsistent winding.
    // However, fixing the bug in dynamic offsets allows us to use backface culling safely
    // to preserve framerate.
    primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // Camera UBO
  const cameraBuffer = device.createBuffer({
    label: 'Camera UBO',
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Dynamic chunk offsets
  const MAX_CHUNKS = 4096;
  const chunkUniformBuffer = device.createBuffer({
    label: 'Chunk Uniform Buffer',
    size: MAX_CHUNKS * 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return {
    pipeline,
    cameraBuffer,
    chunkUniformBuffer,
    bindGroupLayout,
    atlasView: atlas.view,
    atlasSampler: atlas.sampler,
  };
}
