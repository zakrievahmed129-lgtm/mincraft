/**
 * WGSL Shaders — Chunk Rendering.
 * Uses greedy-meshed vertex layout and simple lighting.
 */
export const CHUNK_SHADER = /* wgsl */`

struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,   // w = padding
};

// Push constants / per-chunk uniforms
struct ChunkUniforms {
  worldOffset : vec3<f32>,
  pad : f32,
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<uniform> chunkU : ChunkUniforms;

// ── Vertex ──────────────────────────────────────────

struct VertexIn {
  @location(0) position  : vec3<f32>,
  @location(1) normal    : vec3<f32>,
  @location(2) blockType : f32, // Passed as float to avoid uint packing overhead for now
};

struct VertexOut {
  @builtin(position) clip  : vec4<f32>,
  @location(0) worldNormal : vec3<f32>,
  @location(1) worldPos    : vec3<f32>,
  @location(2) blockType   : f32,
};

@vertex
fn vs_main(v : VertexIn) -> VertexOut {
  // Apply chunk offset to local vertex position
  let world = v.position + chunkU.worldOffset;

  var out : VertexOut;
  out.clip        = camera.viewProjection * vec4<f32>(world, 1.0);
  out.worldNormal = v.normal;
  out.worldPos    = world;
  out.blockType   = v.blockType;
  return out;
}

// ── Fragment ────────────────────────────────────────

@fragment
fn fs_main(f : VertexOut) -> @location(0) vec4<f32> {
  let N = normalize(f.worldNormal);

  // Sun directional light
  let sunDir   = normalize(vec3<f32>(0.5, 0.8, 0.3));
  let sunColor = vec3<f32>(1.0, 0.95, 0.85);
  let NdotL    = max(dot(N, sunDir), 0.0);

  // Ambient + sky fill
  let ambient  = vec3<f32>(0.15, 0.18, 0.25);
  let sky      = max(N.y, 0.0) * vec3<f32>(0.05, 0.08, 0.12);

  // Colors based on block type (1=Grass, 2=Dirt, 3=Stone)
  var base : vec3<f32>;
  if (f.blockType < 1.5) {
    base = vec3<f32>(0.48, 0.82, 0.35); // Grass
  } else if (f.blockType < 2.5) {
    base = vec3<f32>(0.45, 0.32, 0.22); // Dirt
  } else {
    base = vec3<f32>(0.50, 0.50, 0.50); // Stone
  }

  // Adjust brightness based on normal (fake AO/shading for voxel faces)
  var faceShade = 1.0;
  let aN = abs(N);
  if (aN.x > 0.5) {
    faceShade = 0.85;
  } else if (aN.z > 0.5) {
    faceShade = 0.75;
  } else if (N.y < -0.5) {
    faceShade = 0.5;
  }
  base *= faceShade;

  let lit = base * (ambient + sky + sunColor * NdotL * 0.75);

  // Distance fog
  let d   = length(f.worldPos - camera.cameraPosition.xyz);
  let fog = clamp((d - 50.0) / 250.0, 0.0, 1.0);
  let fogColor = vec3<f32>(0.53, 0.68, 0.88); // Match skybox/clear color

  return vec4<f32>(mix(lit, fogColor, fog), 1.0);
}
`;
