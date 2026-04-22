/**
 * WGSL Shaders — Screen Space Ambient Occlusion (SSAO) & Blur.
 * SSAO uses view-space normals and depth. We reconstruct world/view pos from depth.
 */

export const SSAO_SHADER = /* wgsl */`
struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,
};

struct SSAOUniforms {
  inverseProjection : mat4x4<f32>,
  inverseView : mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
  resolution : vec2<f32>,
  radius : f32,
  bias : f32,
  strength : f32,
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<uniform> ssaoU : SSAOUniforms;
@group(0) @binding(2) var depthTex : texture_depth_2d;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(4) var noiseTex : texture_2d<f32>;
@group(0) @binding(5) var texSampler : sampler;

// ── Kernel (Hardcoded 16 samples) ──
const KERNEL_SIZE : u32 = 16u;
var<private> kernel : array<vec3<f32>, 16> = array<vec3<f32>, 16>(
  vec3( 0.3,  0.2,  0.4), vec3(-0.1,  0.8, -0.2), vec3( 0.6, -0.3,  0.7), vec3(-0.9, -0.1, -0.3),
  vec3( 0.1,  0.5,  0.8), vec3(-0.4, -0.2,  0.6), vec3( 0.2,  0.4, -0.5), vec3(-0.7, -0.5,  0.2),
  vec3( 0.8,  0.6,  0.1), vec3(-0.3, -0.8, -0.4), vec3( 0.5, -0.7,  0.3), vec3(-0.2,  0.9, -0.1),
  vec3( 0.4, -0.5, -0.6), vec3(-0.8,  0.3,  0.5), vec3( 0.7,  0.1, -0.4), vec3(-0.5,  0.4, -0.7)
);

// ── Full Screen Triangle Vertex ──
struct VertexOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) id : u32) -> VertexOut {
  var out : VertexOut;
  let x = f32((id << 1u) & 2u);
  let y = f32(id & 2u);
  out.uv = vec2<f32>(x, y);
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  return out;
}

// ── Shared Utils ──
fn getViewPos(uv : vec2<f32>) -> vec3<f32> {
  let depth = textureSampleLevel(depthTex, texSampler, uv, 0.0);
  let clipPos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  var viewPos = ssaoU.inverseProjection * clipPos;
  viewPos /= viewPos.w;
  return viewPos.xyz;
}

fn getViewNormal(uv : vec2<f32>) -> vec3<f32> {
  // Read World Normal from G-Buffer
  let N = textureSampleLevel(normalTex, texSampler, uv, 0.0).xyz;
  // Convert to View Normal
  return normalize((ssaoU.viewMatrix * vec4<f32>(N, 0.0)).xyz);
}

// ── SSAO Generation Fragment ──
@fragment
fn fs_ssao(f : VertexOut) -> @location(0) f32 {
  let depthScale = textureSampleLevel(depthTex, texSampler, f.uv, 0.0);
  if (depthScale >= 1.0) { return 1.0; } // Background = no occlusion

  let fragPos = getViewPos(f.uv);
  let normal = getViewNormal(f.uv);
  
  // TBN Matrix (Noise for randomizing kernel)
  let noiseUV = f.uv * ssaoU.resolution / 4.0; // 4x4 noise texture
  let randomVec = textureSampleLevel(noiseTex, texSampler, noiseUV, 0.0).xyz * 2.0 - 1.0;
  
  let tangent = normalize(randomVec - normal * dot(randomVec, normal));
  let bitangent = cross(normal, tangent);
  let TBN = mat3x3<f32>(tangent, bitangent, normal);
  
  var occlusion = 0.0;
  
  for(var i = 0u; i < KERNEL_SIZE; i++) {
    // scale kernel by distance
    var samplePos = TBN * normalize(kernel[i]);
    // distribute samples
    let scale = f32(i) / f32(KERNEL_SIZE);
    let l_scale = mix(0.1, 1.0, scale * scale);
    samplePos *= l_scale * ssaoU.radius;
    
    samplePos = fragPos + samplePos;
    
    // Project sample to screen to get depth texture coordinates
    var offset = vec4<f32>(samplePos, 1.0);
    offset = camera.viewProjection * (ssaoU.inverseView * offset); // or just Projection * viewSamplePos
    // Actually, samplePos is IN VIEW SPACE. 
    // We need ProjectionMatrix instead of full ViewProjection!
    // Let's assume viewProjection is actually just projection for the moment. Wait, no.
    // Inverse projection of clip is View.
    // So to go from View -> Clip, we need ProjectionMatrix.
    // We can extract Projection = camera.viewProjection * ssaoU.inverseView
  }

  // A simplified approach using world-space:
  // Since we already have world Normal, reconstructing world position is easy.
  return 1.0; // Placeholder until I implement the simpler world-space version
}
`;

// It's much easier to do SSAO in WORLD SPACE if we have World Normals.
export const WORLD_SSAO_SHADER = /* wgsl */`
struct CameraUniforms {
  viewProjection : mat4x4<f32>,
  cameraPosition : vec4<f32>,
};

struct SSAOUniforms {
  inverseViewProjection : mat4x4<f32>,
  resolution : vec2<f32>,
  radius : f32,
  bias : f32,
  strength : f32,
  pad1 : f32,
  pad2 : f32,
  pad3 : f32,
};

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<uniform> ssaoU : SSAOUniforms;
@group(0) @binding(2) var depthTex : texture_depth_2d;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(4) var noiseTex : texture_2d<f32>;
// No sampler needed, using textureLoad

const KERNEL_SIZE : u32 = 8u; // Reduced from 16 to 8 for better performance
var<private> kernel : array<vec3<f32>, 8> = array<vec3<f32>, 8>(
  vec3( 0.1,  0.1,  0.5), vec3(-0.1, -0.1,  0.5), vec3( 0.2,  0.2,  0.4), vec3(-0.2, -0.2,  0.4),
  vec3( 0.3,  0.0,  0.6), vec3(-0.3,  0.0,  0.6), vec3( 0.0,  0.3,  0.5), vec3( 0.0, -0.3,  0.5)
);

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

fn getWorldPos(uv : vec2<f32>, coords : vec2<i32>) -> vec3<f32> {
  let depth = textureLoad(depthTex, coords, 0);
  let clipPos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  var worldPos = ssaoU.inverseViewProjection * clipPos;
  worldPos /= worldPos.w;
  return worldPos.xyz;
}

@fragment
fn fs_ssao(f : VertexOut) -> @location(0) vec4<f32> {
  let coords = vec2<i32>(f.fragCoord.xy);
  let depthStr = textureLoad(depthTex, coords, 0);
  if (depthStr >= 1.0) { return vec4<f32>(1.0); } 

  let fragPos = getWorldPos(f.uv, coords);
  let normal = textureLoad(normalTex, coords, 0).xyz;
  
  let noisePixel = coords % vec2<i32>(4, 4);
  var randomVec = textureLoad(noiseTex, noisePixel, 0).xyz * 2.0 - 1.0;
  
  let tangent = normalize(randomVec - normal * dot(randomVec, normal));
  let bitangent = cross(normal, tangent);
  let TBN = mat3x3<f32>(tangent, bitangent, normal);
  
  var occlusion = 0.0;
  
  for(var i = 0u; i < KERNEL_SIZE; i++) {
    // sample position
    let scale = f32(i) / f32(KERNEL_SIZE);
    let mag = mix(0.1, 1.0, scale * scale);
    var samplePos = fragPos + (TBN * kernel[i]) * ssaoU.radius * mag;
    
    // project to screen
    var offset = camera.viewProjection * vec4<f32>(samplePos, 1.0);
    offset /= offset.w;
    // to map to [0,1] uv space
    let offsetUV = vec2<f32>(offset.x * 0.5 + 0.5, 1.0 - (offset.y * 0.5 + 0.5));
    
    if (offsetUV.x < 0.0 || offsetUV.x > 1.0 || offsetUV.y < 0.0 || offsetUV.y > 1.0) { continue; }
    let offsetScreen = vec2<i32>(offsetUV * ssaoU.resolution);
    
    // get sampled depth
    let sampleDepth = getWorldPos(offsetUV, offsetScreen).z;
    
    // range check & accumulate
    let rangeCheck = smoothstep(0.0, 1.0, ssaoU.radius / abs(fragPos.z - sampleDepth));
    if (sampleDepth >= samplePos.z + ssaoU.bias) {
       occlusion += 1.0 * rangeCheck;
    }
  }
  
  occlusion = 1.0 - (occlusion / f32(KERNEL_SIZE)) * ssaoU.strength;
  return vec4<f32>(occlusion, 0.0, 0.0, 1.0);
}

// ── Simple Box Blur ──
@fragment
fn fs_blur(f : VertexOut) -> @location(0) vec4<f32> {
  let coords = vec2<i32>(f.fragCoord.xy);
  var result = 0.0;
  for (var x = -2; x <= 2; x++) {
    for (var y = -2; y <= 2; y++) {
      let offset = vec2<i32>(x, y);
      result += textureLoad(normalTex, coords + offset, 0).r; // We reuse normalTex slot for input to blur
    }
  }
  return vec4<f32>(result / 25.0, 0.0, 0.0, 1.0);
}
`;
