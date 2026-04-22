const TILE_SIZE = 16;
const ATLAS_COLUMNS = 3;
const ATLAS_ROWS = 3;
const ATLAS_WIDTH = TILE_SIZE * ATLAS_COLUMNS;
const ATLAS_HEIGHT = TILE_SIZE * ATLAS_ROWS;

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function setPixel(
  data: Uint8Array,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  const idx = (x + y * ATLAS_WIDTH) * 4;
  data[idx + 0] = clampByte(r);
  data[idx + 1] = clampByte(g);
  data[idx + 2] = clampByte(b);
  data[idx + 3] = clampByte(a);
}

// Minecraft-like Texture Palettes
const PALETTE: Record<string, [number, number, number]> = {
  // Dirt
  'a': [134, 96, 67],  // base
  'b': [121, 85, 58],  // dark
  'c': [104, 73, 49],  // darkest
  'd': [150, 108, 74], // light
  'e': [164, 118, 80], // lightest
  // Grass
  'A': [116, 169, 78], // base
  'B': [100, 153, 64], // dark
  'C': [82, 133, 47],  // darkest
  'D': [133, 188, 94], // light
  'E': [148, 203, 109], // lightest
  // Stone
  '0': [125, 125, 125], // base
  '1': [104, 104, 104], // dark
  '2': [143, 143, 143], // light
  '3': [89, 89, 89],    // darkest
  '4': [163, 163, 163], // lightest
  // Wood Log
  'w': [66, 49, 29],   // bark dark
  'x': [83, 64, 42],   // bark mid
  'y': [103, 82, 58],  // bark light
  'm': [157, 127, 85], // inside dark
  'n': [182, 152, 103], // inside mid
  'o': [204, 175, 125], // inside light
  // Leaves
  'l': [55, 91, 35],   // dark
  'L': [73, 114, 49],  // mid
  'f': [91, 143, 61],  // light
  // Water
  '~': [40, 60, 200],  // base
  '-': [50, 70, 220],  // highlight
};

const TEX_GRASS_TOP = [
  "DBBBDABABDBBDBBD",
  "BDDABAAABDBAAABB",
  "BABAAAABBBBAAAAB",
  "AABAAAABCBBAAAAB",
  "AABBAABCCBBAABAA",
  "AAABBABBBAAAABBA",
  "AAAABAABBAAABBBB",
  "ABBAAABBBBAAABBD",
  "BBAAAAAABABAAABB",
  "BBAABAAAABAABBBB",
  "BBBBBAAABBBAAABA",
  "BBBBAAAABBBBBABB",
  "DBBBAAAABCBBAAAB",
  "BDBBAAABCCBBABAA",
  "BDBBBAABBBAAAABA",
  "BDBBBAAABBAAABBD",
];

const TEX_GRASS_SIDE = [
  "DABBAABBBBAAABBD",
  "DBBBABBCCBBABABB",
  "DBBBAABBBAAAABBA",
  "AABBAAAAABBAAABB",
  "CBBaAABCBBAAABBa",
  "CabaBAABbaaabBAa",
  "bcaabBcaabbabacb",
  "acbaabdaabcaabdc",
  "bacabdaabacbdaac",
  "acbdaabaacabdaab",
  "abdaacabdaabdaab",
  "daacbacabdaacbac",
  "acbacdaacbacdaab",
  "bacdaabacdaabacb",
  "aabacdaabacdaabc",
  "daabacbacdaabacb",
];

const TEX_DIRT = [
  "abdaacabdaabdaab",
  "daacbacabdaacbac",
  "acbacdaacbacdaab",
  "bacdaabacdaabacb",
  "aabacdaabacdaabc",
  "daabacbacdaabacb",
  "abdaacabdaabdaab",
  "daacbacabdaacbac",
  "acbacdaacbacdaab",
  "bacdaabacdaabacb",
  "aabacdaabacdaabc",
  "daabacbacdaabacb",
  "abdaacabdaabdaab",
  "daacbacabdaacbac",
  "acbacdaacbacdaab",
  "bacdaabacdaabacb",
];

const TEX_STONE = [
  "1201010120100010",
  "0000210000010020",
  "0200000101000100",
  "1001010000000001",
  "0000000201002000",
  "0100200000000000",
  "0000000100100102",
  "0201000000000000",
  "0000020101002001",
  "1010000000000000",
  "0000001002000100",
  "0100200000010000",
  "0000000100000020",
  "0020010000201000",
  "1000000010000001",
  "0101020000010100",
];

const TEX_WOOD_SIDE = [
  "wxxwyxxwyxwyywxw",
  "xwyywxwyyxwxwxxw",
  "xwxwxwyyxwxxwyxw",
  "wwxxwyxwyywxyyww",
  "xwyxxwyyxwxyxwyx",
  "yyxwxwxxwyxwyyww",
  "xyywxwyyxwxxwyxw",
  "wwxwxxwyywxxwyxw",
  "xwyxwyxwyywxyxwy",
  "xwyyxwxxwyywxyyw",
  "wwxxwyxwyxwyxxwy",
  "xwyxwyxwyxwyywxx",
  "xwyywxxwyyxwxwyy",
  "wwxxwyyxwxwxwxxw",
  "xwyxwyxwyxwyxwyy",
  "xwyywxwxxwyxwyxw",
];

const TEX_WOOD_TOP = [
  "wwwxxwxwxwxwwxww",
  "wxmmnmnmmnmnmxxw",
  "wmnoononnooonmxw",
  "xmnonmmnnmnonnmw",
  "xmommnmmmnmmonmx",
  "wmnmmnnonnmmnomw",
  "xnnomnononmnmnmx",
  "xnmononnmonnmonx",
  "xmnomnonmonnmonw",
  "wnmnomnononmmnmw",
  "xnommnonnonmnonx",
  "wmmnnmnmmnmmnomw",
  "xmonnomnmnnnonmw",
  "wnnooonnonoonomx",
  "xwmmnmnnmnmnmmxw",
  "wxwxxwxwxwwxwwwx",
];

const TEX_LEAVES = [
  "LllLllfLllLlllLl",
  "llfllLlfllfllLlf",
  "LllLllflllLllfll",
  "llfllLlfLllLllLl",
  "LllLlllLllfllLlf",
  "llfllfllLlllLlll",
  "LllLllLlllLllfLl",
  "llfllLlfllfllLlf",
  "LllLllfLllLlllLl",
  "llfllLlfllfllLlf",
  "LllLllflllLllfll",
  "llfllLlfLllLllLl",
  "LllLlllLllfllLlf",
  "llfllfllLlllLlll",
  "LllLllLlllLllfLl",
  "llfllLlfllfllLlf",
];

const TEX_WATER = [
  "~~-~~~-~~~~~~~~-",
  "~~~~-~~~~~-~~~~~",
  "-~~~~~~~~~~~-~~~",
  "~~~~-~~~~~~~~~~~",
  "~~~~~~~~-~~~~-~~",
  "~~-~~~~~~~~~~~~~",
  "~~~~~~~~~~~-~~~~",
  "~~~~-~~~~~~~~~~~",
  "-~~~~~~~~~-~~~~~",
  "~~~~~~-~~~~~~~-~",
  "~~-~~~~~~~~~~~~~",
  "~~~~~~~~-~~~~~~~",
  "~~~~-~~~~~~~-~~~",
  "~~~~~~~~~~~~~~-~",
  "-~~~~~~~-~~~~~~~",
  "~~~~-~~~~~~~-~~~",
];

function drawStringTex(data: Uint8Array, tileX: number, tileY: number, tex: string[]) {
  const originX = tileX * TILE_SIZE;
  const originY = tileY * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const char = tex[y][x];
      const color = PALETTE[char] || [255, 0, 255]; // magenta fallback
      setPixel(data, originX + x, originY + y, color[0], color[1], color[2]);
    }
  }
}

export interface VoxelTextureAtlas {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
}

export function createVoxelTextureAtlas(device: GPUDevice): VoxelTextureAtlas {
  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);

  // Tile 0: Grass top
  drawStringTex(data, 0, 0, TEX_GRASS_TOP);

  // Tile 1: Grass side
  drawStringTex(data, 1, 0, TEX_GRASS_SIDE);

  // Tile 2: Dirt
  drawStringTex(data, 0, 1, TEX_DIRT);

  // Tile 3: Stone
  drawStringTex(data, 1, 1, TEX_STONE);

  // Tile 4: Wood Top
  drawStringTex(data, 2, 0, TEX_WOOD_TOP);

  // Tile 5: Wood Side
  drawStringTex(data, 2, 1, TEX_WOOD_SIDE);

  // Tile 6: Leaves
  drawStringTex(data, 0, 2, TEX_LEAVES);

  // Tile 7: Water
  drawStringTex(data, 1, 2, TEX_WATER);

  const texture = device.createTexture({
    label: 'Voxel Texture Atlas',
    size: { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });

  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: ATLAS_WIDTH * 4 },
    { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, depthOrArrayLayers: 1 }
  );

  const sampler = device.createSampler({
    label: 'Voxel Texture Sampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
    mipmapFilter: 'nearest',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });

  return {
    texture,
    view: texture.createView(),
    sampler,
  };
}
