/**
 * GPUContext — WebGPU device/adapter/surface initialization.
 * Single point of ownership for all GPU resources.
 */
export interface GPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  format: GPUTextureFormat;
  depthTexture: GPUTexture;
  gAlbedo: GPUTexture;
  gNormalRoughMetal: GPUTexture;
}

export async function initGPU(canvas: HTMLCanvasElement): Promise<GPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No GPU adapter found');
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  });

  device.lost.then((info) => {
    console.error(`[GPU] Device lost: ${info.message}`);
  });

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  const { depth, albedo, normal } = createGBuffer(device, canvas.width, canvas.height);

  return { 
    device, context, canvas, format, 
    depthTexture: depth, 
    gAlbedo: albedo, 
    gNormalRoughMetal: normal 
  };
}

export function createGBuffer(device: GPUDevice, width: number, height: number) {
  const depth = device.createTexture({
    label: 'G-Buffer Depth',
    size: { width, height },
    format: 'depth32float', // high precision for SSAO raymarching
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const albedo = device.createTexture({
    label: 'G-Buffer Albedo',
    size: { width, height },
    format: 'bgra8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  // rgba16float to store Normal (xyz) and packed Roughness/Metallic (w)
  // or rgba8unorm if we pack normal in 0-1 and Roughness/Metallic in Z/W.
  // We'll use rgba16float for precision on normals.
  const normal = device.createTexture({
    label: 'G-Buffer Normal/Rough/Metal',
    size: { width, height },
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  return { depth, albedo, normal };
}
