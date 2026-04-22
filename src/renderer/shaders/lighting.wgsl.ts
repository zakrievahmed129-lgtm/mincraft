/**
 * WGSL Shaders — Deferred Lighting Pass (PBR).
 */

export const LIGHTING_SHADER = /* wgsl */`
struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,
};

// Global Lights (Modifiable from JS)
struct LightUniforms {
  sunDirection : vec3<f32>,
  sunIntensity : f32,
  sunColor : vec3<f32>,
  ambientIntensity : f32,
  fogParams : vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<uniform> lights : LightUniforms;

@group(0) @binding(2) var depthTex : texture_depth_2d;
@group(0) @binding(3) var albedoTex : texture_2d<f32>;
@group(0) @binding(4) var normalRoughMetalTex : texture_2d<f32>;
@group(0) @binding(5) var ssaoTex : texture_2d<f32>;

struct VertexOut {
  @builtin(position) fragCoord : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) id : u32) -> VertexOut {
  var out : VertexOut;
  let x = f32((id << 1u) & 2u);
  let y = f32(id & 2u);
  out.uv = vec2<f32>(x, y);
  out.fragCoord = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  return out;
}

// Need InverseVP to reconstruct world position from depth
struct InvVP {
  matrix : mat4x4<f32>,
}
@group(0) @binding(6) var<uniform> invVP : InvVP;

fn getWorldPos(uv : vec2<f32>, coords : vec2<i32>) -> vec3<f32> {
  let depth = textureLoad(depthTex, coords, 0);
  let clipPos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  var worldPos = invVP.matrix * clipPos;
  worldPos /= worldPos.w;
  return worldPos.xyz;
}

// ── PBR Cook-Torrance BRDF ──
const PI = 3.14159265359;

fn fresnelSchlick(cosTheta : f32, F0 : vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn DistributionGGX(N : vec3<f32>, H : vec3<f32>, roughness : f32) -> f32 {
    let a      = roughness*roughness;
    let a2     = a*a;
    let NdotH  = max(dot(N, H), 0.0);
    let NdotH2 = NdotH*NdotH;

    let num   = a2;
    var denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return num / (denom + 0.0001);
}

fn GeometrySchlickGGX(NdotV : f32, roughness : f32) -> f32 {
    let r = (roughness + 1.0);
    let k = (r*r) / 8.0;

    let num   = NdotV;
    let denom = NdotV * (1.0 - k) + k;

    return num / (denom + 0.0001);
}

fn GeometrySmith(N : vec3<f32>, V : vec3<f32>, L : vec3<f32>, roughness : f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2  = GeometrySchlickGGX(NdotV, roughness);
    let ggx1  = GeometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
}

fn hash21(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn starField(uv : vec2<f32>) -> f32 {
  let grid = floor(uv * vec2<f32>(140.0, 80.0));
  let rnd = hash21(grid);
  let sparkle = hash21(grid + vec2<f32>(19.0, 73.0));
  let local = fract(uv * vec2<f32>(140.0, 80.0)) - 0.5;
  let starMask = smoothstep(0.16, 0.01, length(local));
  return select(0.0, starMask * (0.45 + sparkle * 0.55), rnd > 0.985);
}

@fragment
fn fs_main(f : VertexOut) -> @location(0) vec4<f32> {
  let coords = vec2<i32>(f.fragCoord.xy);
  let depth = textureLoad(depthTex, coords, 0);
  let daylight = smoothstep(-0.18, 0.2, lights.sunDirection.y);
  let moonlight = smoothstep(-0.02, -0.45, lights.sunDirection.y);
  let dusk = 1.0 - clamp(abs(lights.sunDirection.y) / 0.3, 0.0, 1.0);

  // Softer skybox gradient
  let uvY = f.uv.y;
  let daySkyTop = vec3<f32>(0.34, 0.58, 0.9);
  let daySkyBottom = vec3<f32>(0.77, 0.86, 0.96);
  let duskSkyTop = vec3<f32>(0.62, 0.38, 0.52);
  let duskSkyBottom = vec3<f32>(0.95, 0.64, 0.42);
  let nightSkyTop = vec3<f32>(0.02, 0.05, 0.11);
  let nightSkyBottom = vec3<f32>(0.08, 0.12, 0.2);
  let skyTop = mix(mix(nightSkyTop, duskSkyTop, dusk), daySkyTop, daylight);
  let skyBottom = mix(mix(nightSkyBottom, duskSkyBottom, dusk), daySkyBottom, daylight);
  var skyColor = mix(skyTop, skyBottom, uvY);
  let moonGlow = vec3<f32>(0.22, 0.3, 0.42) * moonlight * pow(1.0 - uvY, 3.0);
  skyColor += moonGlow;

  let clipPosSky = vec4<f32>(f.uv.x * 2.0 - 1.0, 1.0 - f.uv.y * 2.0, 1.0, 1.0);
  var farWorldPos = invVP.matrix * clipPosSky;
  farWorldPos /= farWorldPos.w;
  let viewDir = normalize(farWorldPos.xyz - camera.cameraPosition.xyz);

  let sunDir = normalize(lights.sunDirection);
  let moonDir = normalize(vec3<f32>(-sunDir.x, -sunDir.y, -sunDir.z));
  
  // Create basis vectors for sun
  var upVec = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(sunDir.y) > 0.99) { upVec = vec3<f32>(1.0, 0.0, 0.0); }
  let sunU = normalize(cross(upVec, sunDir));
  let sunV = cross(sunDir, sunU);

  let sunProjX = dot(viewDir, sunU);
  let sunProjY = dot(viewDir, sunV);
  let sunZ = dot(viewDir, sunDir);
  
  let moonProjX = dot(viewDir, sunU); // Re-use basis for opposite direction
  let moonProjY = dot(viewDir, sunV);
  let moonZ = dot(viewDir, moonDir);

  // Square sun and moon (approx 64x64 pixels relative to screen)
  let sunSize = 0.04;
  let moonSize = 0.035;
  let sunDisc = select(0.0, 1.0, abs(sunProjX) < sunSize && abs(sunProjY) < sunSize && sunZ > 0.0);
  let moonDisc = select(0.0, 1.0, abs(moonProjX) < moonSize && abs(moonProjY) < moonSize && moonZ > 0.0);
  
  // Fix stars to the world sky sphere
  let starDir = viewDir;
  let starPhi = atan2(starDir.z, starDir.x);
  let starTheta = acos(starDir.y);
  let starUv = vec2<f32>(starPhi / (2.0 * PI), starTheta / PI);
  let starMask = starField(starUv * vec2<f32>(4.0, 2.0)) * (1.0 - daylight) * (1.0 - dusk * 0.65);
  
  skyColor += vec3<f32>(1.0, 0.86, 0.56) * sunDisc * (1.1 + daylight * 0.7);
  skyColor += vec3<f32>(0.82, 0.9, 1.0) * moonDisc * moonlight * 1.4;
  skyColor += vec3<f32>(0.72, 0.84, 1.0) * starMask;

  if (depth >= 1.0) {
    // Sky color
    let underwaterSky = mix(skyColor, vec3<f32>(0.06, 0.18, 0.24), lights.fogParams.x);
    return vec4<f32>(underwaterSky, 1.0);
  }

  // 1. Read G-Buffer
  let albedoSample = textureLoad(albedoTex, coords, 0);
  let albedo = albedoSample.rgb;
  let materialMask = albedoSample.a;
  let isWater = materialMask < 0.25;
  let voxelAO = select(materialMask, 1.0, isWater);
  let normalRoughMetal = textureLoad(normalRoughMetalTex, coords, 0);
  let N = normalize(normalRoughMetal.xyz);
  
  let roughness = normalRoughMetal.w;

  let ssao = textureLoad(ssaoTex, coords, 0).r;

  // 2. Setup Vectors
  let worldPos = getWorldPos(f.uv, coords);
  let V = normalize(camera.cameraPosition.xyz - worldPos);
  let L = sunDir;
  let H = normalize(V + L);

  // 3. PBR Basics
  var F0 = vec3<f32>(0.04); 
  if (isWater) {
    F0 = vec3<f32>(0.08, 0.12, 0.16);
  }

  // 4. Sun Light Calculation (Cook-Torrance)
  let NdotL = max(dot(N, L), 0.0);
  let NdotMoon = max(dot(N, moonDir), 0.0);
  var Lo = vec3<f32>(0.0);

  if (NdotL > 0.0) {
      let NDF = DistributionGGX(N, H, roughness);       
      let G   = GeometrySmith(N, V, L, roughness);      
      let F   = fresnelSchlick(max(dot(H, V), 0.0), F0);       

      let kD = vec3<f32>(1.0) - F;
      
      let numerator    = NDF * G * F;
      let denominator  = 4.0 * max(dot(N, V), 0.0) * NdotL;
      let specular     = numerator / max(denominator, 0.001);  

      let directionalAO = mix(0.7, 1.0, voxelAO);
      Lo = (kD * albedo / PI + specular) * lights.sunColor * lights.sunIntensity * NdotL * directionalAO;
  }

  if (moonlight > 0.01 && NdotMoon > 0.0) {
      let Hm = normalize(V + moonDir);
      let NDFm = DistributionGGX(N, Hm, max(0.08, roughness));
      let Gm = GeometrySmith(N, V, moonDir, max(0.08, roughness));
      let Fm = fresnelSchlick(max(dot(Hm, V), 0.0), mix(F0, vec3<f32>(0.1, 0.12, 0.18), 0.35));
      let specMoon = (NDFm * Gm * Fm) / max(4.0 * max(dot(N, V), 0.0) * NdotMoon, 0.001);
      Lo += (albedo * 0.18 / PI + specMoon) * vec3<f32>(0.42, 0.5, 0.66) * moonlight * NdotMoon * 0.8;
  }

  // 5. Ambient Lighting (with SSAO)
  let skyAmbient = mix(vec3<f32>(0.05, 0.08, 0.16), vec3<f32>(0.2, 0.3, 0.45), daylight);
  let groundBounce = mix(vec3<f32>(0.03, 0.05, 0.08), vec3<f32>(0.1, 0.25, 0.15), daylight);
  let ambientLight = mix(groundBounce, skyAmbient, N.y * 0.5 + 0.5) * lights.ambientIntensity * 1.35;
  let ambient = (albedo * ambientLight) * ssao * voxelAO;

  // 6. Combine & Distance Fog
  var color = ambient + Lo;

  if (isWater) {
    let fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    let reflectedSky = mix(skyBottom, skyTop, clamp(reflect(-V, N).y * 0.5 + 0.5, 0.0, 1.0));
    let deepWater = mix(vec3<f32>(0.02, 0.08, 0.14), vec3<f32>(0.0, 0.14, 0.22), daylight);
    let transmission = mix(deepWater, albedo, 0.55);
    color = mix(transmission, reflectedSky + Lo * 0.65, 0.35 + fresnel * 0.55);
  }

  let d = length(worldPos - camera.cameraPosition.xyz);
  // Softer fog curve
  let fog = smoothstep(100.0, 250.0, d);
  var fogColor : vec3<f32> = skyBottom;

  if (lights.fogParams.x > 0.001) {
    let underwaterFog = smoothstep(1.0, 12.0, d);
    let underwaterTint = mix(vec3<f32>(0.06, 0.22, 0.28), vec3<f32>(0.02, 0.09, 0.14), underwaterFog);
    color = mix(color, underwaterTint, underwaterFog * lights.fogParams.x);
    fogColor = mix(fogColor, underwaterTint, lights.fogParams.x);
  }

  // ACES Film HDR Tonemapping (Soft & pleasant)
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d2 = 0.59;
  let e = 0.14;
  var mapped = clamp((color * (a * color + b)) / (color * (c * color + d2) + e), vec3<f32>(0.0), vec3<f32>(1.0));
  
  // Gamma correction
  mapped = pow(mapped, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(mix(mapped, fogColor, fog), 1.0);
}
`;
