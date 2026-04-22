/**
 * ChunkPipeline — GPU resource factory for chunk rendering.
 */
import type { GPUContext } from '../core/gpu-context';
import { CHUNK_SHADER } from './chunk-shaders';

export interface ChunkRenderResources {
  pipeline: GPURenderPipeline;
  cameraBuffer: GPUBuffer;
  chunkUniformBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createChunkRenderResources(gpu: GPUContext): ChunkRenderResources {
  const { device, format } = gpu;

  const shaderModule = device.createShaderModule({
    label: 'Chunk Shader',
    code: CHUNK_SHADER,
  });

  // Vertex layout: position(3f) + normal(3f) + blockType(1f) = 28 bytes
  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 7 * 4,
    attributes: [
      { shaderLocation: 0, offset: 0,     format: 'float32x3' }, // position
      { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
      { shaderLocation: 2, offset: 6 * 4, format: 'float32'   }, // blockType
    ],
  };

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Chunk BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'Chunk Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex:   { module: shaderModule, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // Camera uniform: mat4(64) + vec4(16) = 80 bytes
  const cameraBuffer = device.createBuffer({
    label: 'Camera UBO',
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Since we don't have push constants in WGSL right now, we use a single dynamic uniform buffer
  // for chunk world offsets. Max 4096 chunks. Aligned to 256 bytes per struct.
  const MAX_CHUNKS = 4096;
  const chunkUniformBuffer = device.createBuffer({
    label: 'Chunk Uniform Buffer',
    size: MAX_CHUNKS * 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return { pipeline, cameraBuffer, chunkUniformBuffer, bindGroupLayout };
}
