/**
 * RenderPipeline — GPU resource factory.
 * Creates pipeline, buffers, bind groups for instanced voxel rendering.
 */
import type { GPUContext } from '../core/gpu-context';
import { VOXEL_SHADER } from './shaders';
import { createCubeGeometry, type CubeGeometry } from './geometry';

export interface RenderResources {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  cameraBuffer: GPUBuffer;
  instanceBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  geometry: CubeGeometry;
  maxInstances: number;
}

export function createRenderResources(gpu: GPUContext, maxInstances = 4096): RenderResources {
  const { device, format } = gpu;

  const shaderModule = device.createShaderModule({
    label: 'Voxel Shader',
    code: VOXEL_SHADER,
  });

  // Vertex layout: position(3f) + normal(3f) = 24 bytes
  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 6 * 4,
    attributes: [
      { shaderLocation: 0, offset: 0,     format: 'float32x3' }, // position
      { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
    ],
  };

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Main BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'Voxel Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex:   { module: shaderModule, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // Geometry buffers
  const geometry = createCubeGeometry();

  const vertexBuffer = device.createBuffer({
    label: 'Cube VBO',
    size: geometry.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);

  const indexBuffer = device.createBuffer({
    label: 'Cube IBO',
    size: geometry.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, geometry.indices);

  // Camera uniform: mat4(64) + vec4(16) = 80 bytes
  const cameraBuffer = device.createBuffer({
    label: 'Camera UBO',
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Instance storage: mat4(64) × maxInstances
  const instanceBuffer = device.createBuffer({
    label: 'Instance SSBO',
    size: maxInstances * 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'Main Bind Group',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
    ],
  });

  return { pipeline, vertexBuffer, indexBuffer, cameraBuffer, instanceBuffer, bindGroup, geometry, maxInstances };
}
