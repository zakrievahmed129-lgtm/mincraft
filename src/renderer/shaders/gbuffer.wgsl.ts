/**
 * WGSL Shaders — G-Buffer Geometry Pass.
 * Outputs to multiple Render Targets: Albedo (location 0) and Normal+PBR (location 1).
 */
export const GBUFFER_SHADER = /* wgsl */`

struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,   // w = padding
};

struct ChunkUniforms {
  worldOffset : vec3<f32>,
  spawnTime : f32, // Passed from CPU
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<uniform> chunkU : ChunkUniforms;
@group(0) @binding(2) var atlasTex : texture_2d<f32>;
@group(0) @binding(3) var atlasSampler : sampler;

struct VertexIn {
  @location(0) position  : vec3<f32>,
  @location(1) normal    : vec3<f32>,
  @location(2) blockType : f32,
  @location(3) uv        : vec2<f32>,
  @location(4) ao        : f32,
};

struct VertexOut {
  @builtin(position) clip  : vec4<f32>,
  @location(0) worldNormal : vec3<f32>,
  @location(1) worldPos    : vec3<f32>,
  @location(2) blockType   : f32,
  @location(3) uv          : vec2<f32>,
  @location(4) ao          : f32,
};

@vertex
fn vs_main(v : VertexIn) -> VertexOut {
  // Pop-in animation: Chunks rise from -32 Y up to 0 over 0.5s
  let currentTime = camera.cameraPosition.w;
  let timeDelta = currentTime - chunkU.spawnTime;
  let scale = clamp(timeDelta / 0.5, 0.0, 1.0);
  
  // Ease-out cubic animation
  let ease = 1.0 - pow(1.0 - scale, 3.0);
  let yOffset = (1.0 - ease) * -32.0;

  var world = v.position + chunkU.worldOffset;
  world.y += yOffset;

  var out : VertexOut;
  out.clip        = camera.viewProjection * vec4<f32>(world, 1.0);
  out.worldNormal = v.normal;
  out.worldPos    = world;
  out.blockType   = v.blockType;
  out.uv          = v.uv;
  out.ao          = v.ao;
  return out;
}

// ── Fragment ────────────────────────────────────────

struct GBufferOutput {
  @location(0) albedo : vec4<f32>,
  @location(1) normalRoughMetal : vec4<f32>,
}

fn selectTile(blockType : f32, normal : vec3<f32>) -> u32 {
  if (blockType < 1.5) {
    if (normal.y > 0.5) {
      return 0u; // grass top
    }
    if (normal.y < -0.5) {
      return 3u; // dirt bottom
    }
    return 1u; // grass side
  }

  if (blockType < 2.5) {
    return 3u; // dirt
  }

  if (blockType < 3.5) {
    return 4u; // stone
  }
  
  if (blockType < 4.5) {
    if (abs(normal.y) > 0.5) {
      return 2u; // wood top
    }
    return 5u; // wood side
  }

  if (blockType < 5.5) {
    return 6u; // leaves
  }

  return 7u; // water
}

fn sampleAtlas(tileId : u32, uv : vec2<f32>) -> vec3<f32> {
  let tiled = fract(uv);
  let pixel = floor(tiled * 16.0);
  let tileCoord = vec2<f32>(f32(tileId % 3u), f32(tileId / 3u));
  let atlasPixel = tileCoord * 16.0 + pixel + vec2<f32>(0.5, 0.5);
  let atlasUV = atlasPixel / vec2<f32>(48.0, 48.0); // 3 cols, 3 rows -> 48x48
  return textureSample(atlasTex, atlasSampler, atlasUV).rgb;
}

@fragment
fn fs_main(f : VertexOut) -> GBufferOutput {
  let baseNormal = normalize(f.worldNormal);
  let currentTime = camera.cameraPosition.w;
  var N = baseNormal;

  // Setup Base Color, Roughness, Metallic based on BlockType
  let tileId = selectTile(f.blockType, baseNormal);
  var albedo = sampleAtlas(tileId, f.uv);
  var roughness = 1.0;
  var materialAlpha = 1.0;

  if (f.blockType < 1.5) { // Grass
    roughness = 0.95;
  } else if (f.blockType < 2.5) { // Dirt
    roughness = 1.0;
  } else if (f.blockType < 3.5) { // Stone
    roughness = 0.6; // Slightly shiny
  } else if (f.blockType < 4.5) { // Wood
    roughness = 0.85;
  } else if (f.blockType < 5.5) { // Leaves
    roughness = 0.9;
  } else { // Water
    let waveX = sin(f.worldPos.x * 0.22 + currentTime * 1.7);
    let waveZ = cos(f.worldPos.z * 0.27 - currentTime * 1.35);
    let ripple = sin((f.worldPos.x + f.worldPos.z) * 0.18 + currentTime * 2.3);
    N = normalize(vec3<f32>(waveX * 0.18 + ripple * 0.08, 1.0, waveZ * 0.18 - ripple * 0.08));
    albedo = mix(vec3<f32>(0.04, 0.14, 0.26), vec3<f32>(0.12, 0.36, 0.58), 0.5 + 0.5 * waveX * waveZ);
    roughness = 0.04;
    materialAlpha = 0.18;
  }

  // Voxel AO darkens creases before the lighting pass; top faces stay more open.
  let ao = clamp(f.ao, 0.0, 1.0);
  if (f.blockType >= 5.5) {
    albedo *= 1.08;
  } else {
    albedo *= mix(0.55, 1.0, ao);
  }

  var out : GBufferOutput;
  out.albedo = vec4<f32>(albedo, select(ao, materialAlpha, f.blockType >= 5.5));
  out.normalRoughMetal = vec4<f32>(N, roughness);

  return out;
}
`;
