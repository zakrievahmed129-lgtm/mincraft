/**
 * WGSL Shaders — Instance-ready voxel rendering.
 * Uses storage buffer for per-instance model matrices (ready for massive instancing).
 * Directional sun lighting + ambient + sky light + distance fog.
 */
export const VOXEL_SHADER = /* wgsl */`

struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,   // w = padding
};

struct InstanceData {
  models : array<mat4x4<f32>>,
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<storage, read> instances : InstanceData;

// ── Vertex ──────────────────────────────────────────

struct VertexIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @builtin(instance_index) idx : u32,
};

struct VertexOut {
  @builtin(position) clip   : vec4<f32>,
  @location(0) worldNormal  : vec3<f32>,
  @location(1) worldPos     : vec3<f32>,
};

@vertex
fn vs_main(v : VertexIn) -> VertexOut {
  let model = instances.models[v.idx];
  let world = model * vec4<f32>(v.position, 1.0);

  var out : VertexOut;
  out.clip        = camera.viewProjection * world;
  out.worldNormal = normalize((model * vec4<f32>(v.normal, 0.0)).xyz);
  out.worldPos    = world.xyz;
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

  // Per-face voxel color (Minecraft-style)
  var base : vec3<f32>;
  let aN = abs(N);
  if (aN.y > 0.5) {
    base = select(vec3<f32>(0.45, 0.32, 0.22),   // bottom: dirt
                  vec3<f32>(0.48, 0.82, 0.35),    // top: grass
                  N.y > 0.0);
  } else if (aN.x > 0.5) {
    base = vec3<f32>(0.42, 0.72, 0.32);           // side X
  } else {
    base = vec3<f32>(0.40, 0.68, 0.30);           // side Z
  }

  let lit = base * (ambient + sky + sunColor * NdotL * 0.75);

  // Distance fog
  let d   = length(f.worldPos - camera.cameraPosition.xyz);
  let fog = clamp((d - 50.0) / 150.0, 0.0, 1.0);
  let fogColor = vec3<f32>(0.55, 0.70, 0.90);

  return vec4<f32>(mix(lit, fogColor, fog), 1.0);
}
`;
