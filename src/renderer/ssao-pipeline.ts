/**
 * SSAOPipeline — Setup SSAO and Blur post-processing passes.
 */
import type { GPUContext } from '../core/gpu-context';
import { WORLD_SSAO_SHADER } from './shaders/ssao.wgsl';

export interface SSAOResources {
  ssaoPipeline: GPURenderPipeline;
  blurPipeline: GPURenderPipeline;
  ssaoTarget: GPUTexture;
  blurTarget: GPUTexture;
  noiseTexture: GPUTexture;
  ssaoUniformBuffer: GPUBuffer;
  ssaoBindGroupLayout: GPUBindGroupLayout;
  blurBindGroupLayout: GPUBindGroupLayout;
}

export function createSSAOResources(gpu: GPUContext): SSAOResources {
  const { device, canvas, format } = gpu;

  const shaderModule = device.createShaderModule({
    label: 'SSAO Shader',
    code: WORLD_SSAO_SHADER,
  });

  const ssaoTarget = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'r8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const blurTarget = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'r8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  // 4x4 Noise Texture
  const noiseSize = 16;
  const noiseData = new Uint8Array(noiseSize * 4);
  for (let i = 0; i < noiseSize; i++) {
    noiseData[i * 4 + 0] = Math.floor(Math.random() * 255);
    noiseData[i * 4 + 1] = Math.floor(Math.random() * 255);
    noiseData[i * 4 + 2] = 0;
    noiseData[i * 4 + 3] = 255;
  }

  const noiseTexture = device.createTexture({
    size: [4, 4],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: noiseTexture },
    noiseData as any,
    { bytesPerRow: 4 * 4 },
    [4, 4]
  );

  const ssaoBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ]
  });

  const ssaoPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [ssaoBindGroupLayout] }),
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: { module: shaderModule, entryPoint: 'fs_ssao', targets: [{ format: 'r8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });

  const blurBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Reusing camera buffer slot, even if unused
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ]
  });

  const blurPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout] }),
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: { module: shaderModule, entryPoint: 'fs_blur', targets: [{ format: 'r8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });

  const ssaoUniformBuffer = device.createBuffer({
    size: 112, // bumped to 112 to silence WGSL structural alignment warning
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return {
    ssaoPipeline, blurPipeline,
    ssaoTarget, blurTarget,
    noiseTexture, ssaoUniformBuffer,
    ssaoBindGroupLayout, blurBindGroupLayout
  };
}
