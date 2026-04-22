import { fbm2D, noiseSeed } from './noise';
import { greedyMesh } from './greedy-mesher';
import { CHUNK_SIZE, BlockType } from './chunk';

// Represents an isolated chunk for generation in the worker, with 1-block padding for neighbor meshing
class WorkerChunk {
  data: Uint8Array;
  worldX: number = 0;
  worldY: number = 0;
  worldZ: number = 0;
  static readonly P_SIZE = CHUNK_SIZE + 2; // 34

  constructor() {
    this.data = new Uint8Array(WorkerChunk.P_SIZE ** 3);
  }

  // Set block using "world-relative" local coordinates (-1 to 32)
  setBlock(lx: number, ly: number, lz: number, type: number): void {
    const px = lx + 1;
    const py = ly + 1;
    const pz = lz + 1;
    this.data[px + py * 34 + pz * 34 * 34] = type;
  }

  // Get block using 0-31 local coordinates (for the mesher)
  getBlock(lx: number, ly: number, lz: number): number {
    const px = lx + 1;
    const py = ly + 1;
    const pz = lz + 1;
    return this.data[px + py * 34 + pz * 34 * 34];
  }

  // Get block using -1 to 32 local coordinates (for neighbor checks)
  getPaddedBlock(lx: number, ly: number, lz: number): number {
    const px = lx + 1;
    const py = ly + 1;
    const pz = lz + 1;
    return this.data[px + py * 34 + pz * 34 * 34];
  }

  // Extracts the inner 32x32x32 voxel data for the main thread
  extractVoxelData(): Uint8Array {
    const voxels = new Uint8Array(CHUNK_SIZE ** 3);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          voxels[lx + ly * 32 + lz * 32 * 32] = this.getBlock(lx, ly, lz);
        }
      }
    }
    return voxels;
  }
}

// Request and Response types
export interface ChunkGenerateMessage {
  type: 'GENERATE';
  id: number;
  cx: number;
  cy: number;
  cz: number;
  seed: number;
}

export interface ChunkRebuildMessage {
  type: 'REBUILD';
  id: number;
  cx: number;
  cy: number;
  cz: number;
  voxelData: Uint8Array;
  paddedVoxelData: Uint8Array;
}

export type ChunkWorkerMessage = ChunkGenerateMessage | ChunkRebuildMessage;

export interface ChunkGenerateResult {
  id: number;
  cx: number;
  cy: number;
  cz: number;
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
  voxelData: Uint8Array;
}

self.onmessage = (e: MessageEvent<ChunkWorkerMessage>) => {
  const msg = e.data;
  
  if (msg.type === 'GENERATE') {
    handleGenerate(msg);
  } else if (msg.type === 'REBUILD') {
    handleRebuild(msg);
  }
};

function handleGenerate(msg: ChunkGenerateMessage) {
  const { id, cx, cy, cz, seed } = msg;
  
  noiseSeed(seed);
  
  const chunk = new WorkerChunk();
  const worldX = cx * CHUNK_SIZE;
  const worldY = cy * CHUNK_SIZE;
  const worldZ = cz * CHUNK_SIZE;

  chunk.worldX = worldX;
  chunk.worldY = worldY;
  chunk.worldZ = worldZ;

  // Generate terrain heightmap including the 1-block padding ring (-1 to 32)
  // We first compute the heightmap so we can place trees afterwards.
  const heights = new Int32Array(34 * 34); // padded heightmap
  const WATER_LEVEL = 14;

  for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
    for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const wx = worldX + lx;
      const wz = worldZ + lz;

      const noiseVal = fbm2D(wx * 0.015, wz * 0.015, 5, 2.0, 0.45);
      // Augmenter la hauteur de base pour avoir des terres émergées
      const height = Math.floor(16 + noiseVal * 18); 
      heights[(lx + 1) + (lz + 1) * 34] = height;

      for (let ly = -1; ly <= CHUNK_SIZE; ly++) {
        const wy = worldY + ly;

        if (wy > height) {
          if (wy <= WATER_LEVEL) {
            chunk.setBlock(lx, ly, lz, BlockType.Water);
          } else {
            chunk.setBlock(lx, ly, lz, BlockType.Air);
          }
          continue;
        }

        let blockType: number;
        if (wy === height) {
          blockType = (wy <= WATER_LEVEL + 1) ? BlockType.Dirt : BlockType.Grass;
        } else if (wy >= height - 3) {
          blockType = BlockType.Dirt;
        } else {
          blockType = BlockType.Stone;
        }

        chunk.setBlock(lx, ly, lz, blockType);
      }
    }
  }

  // Generate trees (simple deterministic pseudo-random based on world pos)
  function hash(x: number, z: number): number {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
    for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const wx = worldX + lx;
      const wz = worldZ + lz;

      // 1% chance for a tree (only if above water level)
      const heightAtPos = heights[(lx + 1) + (lz + 1) * 34];
      if (hash(wx, wz) > 0.99 && heightAtPos > WATER_LEVEL) {
        const height = heightAtPos;
        
        // Tree trunk
        const trunkHeight = 4 + Math.floor(hash(wx, wz + 1) * 3);
        for (let i = 1; i <= trunkHeight; i++) {
          const tly = (height + i) - worldY;
          if (tly >= -1 && tly <= CHUNK_SIZE) {
            chunk.setBlock(lx, tly, lz, BlockType.Wood);
          }
        }

        // Tree leaves
        for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
          const radius = dy >= trunkHeight ? 1 : 2;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
              if (dx === 0 && dz === 0 && dy < trunkHeight) continue; // skip trunk
              // rounded corners
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy === trunkHeight + 1) continue;
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && hash(wx + dx, wz + dz) > 0.5) continue;

              const nlx = lx + dx;
              const nlz = lz + dz;
              const nly = (height + dy) - worldY;
              if (nlx >= -1 && nlx <= CHUNK_SIZE && nlz >= -1 && nlz <= CHUNK_SIZE && nly >= -1 && nly <= CHUNK_SIZE) {
                if (chunk.getPaddedBlock(nlx, nly, nlz) === BlockType.Air) {
                  chunk.setBlock(nlx, nly, nlz, BlockType.Leaves);
                }
              }
            }
          }
        }
      }
    }
  }

  // Neighbor block getter now simply reads from the padded array (No Noise Recalc!)
  const getNeighborBlock = (wx: number, wy: number, wz: number) => {
    const lx = wx - worldX;
    const ly = wy - worldY;
    const lz = wz - worldZ;
    return chunk.getPaddedBlock(lx, ly, lz);
  };

  const { vertices, indices, vertexCount, indexCount } = greedyMesh(chunk as any, getNeighborBlock);

  const voxelData = chunk.extractVoxelData();

  const result: ChunkGenerateResult = {
    id, cx, cy, cz,
    vertices, indices, vertexCount, indexCount,
    voxelData
  };

  self.postMessage(result, {
    transfer: [vertices.buffer, indices.buffer, voxelData.buffer]
  });
}

function handleRebuild(msg: ChunkRebuildMessage) {
  const { id, cx, cy, cz, voxelData, paddedVoxelData } = msg;

  const chunk = new WorkerChunk();
  chunk.worldX = cx * CHUNK_SIZE;
  chunk.worldY = cy * CHUNK_SIZE;
  chunk.worldZ = cz * CHUNK_SIZE;
  chunk.data.set(paddedVoxelData);

  const getNeighborBlock = (wx: number, wy: number, wz: number) => {
    const worldX = cx * CHUNK_SIZE;
    const worldY = cy * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const lx = wx - worldX;
    const ly = wy - worldY;
    const lz = wz - worldZ;
    return chunk.getPaddedBlock(lx, ly, lz);
  };

  const { vertices, indices, vertexCount, indexCount } = greedyMesh(chunk as any, getNeighborBlock);

  const result: ChunkGenerateResult = {
    id, cx, cy, cz,
    vertices, indices, vertexCount, indexCount,
    voxelData
  };

  self.postMessage(result, {
    transfer: [vertices.buffer, indices.buffer, voxelData.buffer]
  });
}
