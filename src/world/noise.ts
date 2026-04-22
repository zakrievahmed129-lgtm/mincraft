/**
 * Simplex-inspired 2D/3D noise for terrain generation.
 * Deterministic, seedable, no dependencies.
 */

// Permutation table (doubled for wrapping)
const PERM = new Uint8Array(512);
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

export function noiseSeed(seed: number): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with seed
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

// Initialize with default seed
noiseSeed(42);

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

function grad3d(hash: number, x: number, y: number, z: number): number {
  const g = GRAD3[hash % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}

/** Classic Perlin noise 3D, returns value in [-1, 1] */
export function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);

  const u = fade(x), v = fade(y), w = fade(z);

  const A  = PERM[X] + Y,     AA = PERM[A] + Z,     AB = PERM[A + 1] + Z;
  const B  = PERM[X + 1] + Y, BA = PERM[B] + Z,     BB = PERM[B + 1] + Z;

  return lerp(
    lerp(
      lerp(grad3d(PERM[AA],     x,   y,   z),   grad3d(PERM[BA],     x-1, y,   z),   u),
      lerp(grad3d(PERM[AB],     x,   y-1, z),   grad3d(PERM[BB],     x-1, y-1, z),   u),
      v),
    lerp(
      lerp(grad3d(PERM[AA + 1], x,   y,   z-1), grad3d(PERM[BA + 1], x-1, y,   z-1), u),
      lerp(grad3d(PERM[AB + 1], x,   y-1, z-1), grad3d(PERM[BB + 1], x-1, y-1, z-1), u),
      v),
    w);
}

/** Fractal Brownian Motion — stacked octaves of noise */
export function fbm2D(x: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, 0, z * frequency);
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp; // Normalize to [-1, 1]
}
