/**
 * DeferredPipeline — Combines G-Buffer and SSAO to compute final PBR lighting.
 */
import type { GPUContext } from '../core/gpu-context';
import { LIGHTING_SHADER } from './shaders/lighting.wgsl';

export interface DeferredResources {
  pipeline: GPURenderPipeline;
  lightsBuffer: GPUBuffer;
  invVPBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createDeferredResources(gpu: GPUContext): DeferredResources {
  const { device, format } = gpu;

  const shaderModule = device.createShaderModule({
    label: 'Deferred Lighting Shader',
    code: LIGHTING_SHADER,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Camera (reused from GBuffer)
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Lights
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }, // Depth
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, // Albedo
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, // Normal/Rough/Metal
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, // SSAO
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // InvVP
    ]
  });

  const pipeline = device.createRenderPipeline({
    label: 'Deferred Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }, // Draw a full-screen triangle natively in shader
  });

  // sunDirection(3) + sunIntensity(1) + sunColor(3) + ambientIntensity(1) + fogParams(4) = 12 floats = 48 bytes
  const lightsBuffer = device.createBuffer({
    label: 'Lights Buffer',
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Default light values
  const defaultLights = new Float32Array([
    // sunDir
    0.5, 0.8, 0.3, 0.0, // padded to vec4 technically? No, alignment for vec3 is 16 bytes
  ]);
  // Wait, let's write them properly respecting WGSL alignment:
  // struct LightUniforms {
  //   sunDirection : vec3<f32>, (offset 0)
  //   sunIntensity : f32,       (offset 12)
  //   sunColor : vec3<f32>,     (offset 16)
  //   ambientIntensity : f32,   (offset 28)
  // }; -> total size 32 bytes.
  
  const initialLightData = new Float32Array(12);
  initialLightData[0] = 0.5; initialLightData[1] = 0.8; initialLightData[2] = 0.3; // sun direction
  initialLightData[3] = 1.0; // sun intensity
  initialLightData[4] = 1.0; initialLightData[5] = 0.95; initialLightData[6] = 0.85; // sun color
  initialLightData[7] = 2.0; // ambient intensity
  initialLightData[8] = 0.0; // underwater amount
  initialLightData[9] = 0.0;
  initialLightData[10] = 0.0;
  initialLightData[11] = 0.0;
  device.queue.writeBuffer(lightsBuffer, 0, initialLightData);

  const invVPBuffer = device.createBuffer({
    label: 'Inverse ViewProjection Buffer',
    size: 64, // mat4
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return { pipeline, lightsBuffer, invVPBuffer, bindGroupLayout };
}

// Global hook to modify lights from browser console
declare global {
  interface Window {
    lightParams: {
      sunDx: number, sunDy: number, sunDz: number,
      sunIntensity: number,
      sunR: number, sunG: number, sunB: number,
      ambientIntensity: number
    }
  }
}

window.lightParams = {
  sunDx: 0.5, sunDy: 0.8, sunDz: 0.3,
  sunIntensity: 3.5, // Brighter sun for PBR
  sunR: 1.0, sunG: 0.95, sunB: 0.85,
  ambientIntensity: 2.0
};
