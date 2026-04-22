/**
 * Chunk — 32³ voxel data container + GPU mesh ownership.
 * Pure data structure. Meshing and rendering are handled by systems.
 */
export const CHUNK_SIZE = 32;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** Block types */
export const enum BlockType {
  Air   = 0,
  Grass = 1,
  Dirt  = 2,
  Stone = 3,
  Wood  = 4,
  Leaves= 5,
  Water = 6,
}

export function getBlockLabel(blockType: number): string {
  switch (blockType) {
    case BlockType.Grass: return 'Herbe';
    case BlockType.Dirt: return 'Terre';
    case BlockType.Stone: return 'Pierre';
    case BlockType.Wood: return 'Bois';
    case BlockType.Leaves: return 'Feuilles';
    case BlockType.Water: return 'Eau';
    default: return 'Vide';
  }
}

export function getBlockHardness(blockType: number): number {
  switch (blockType) {
    case BlockType.Grass: return 0.55;
    case BlockType.Dirt: return 0.45;
    case BlockType.Stone: return 1.6;
    case BlockType.Wood: return 1.1;
    case BlockType.Leaves: return 0.2;
    case BlockType.Water: return 0;
    default: return 0;
  }
}

export function getBlockDropCount(blockType: number): number {
  switch (blockType) {
    case BlockType.Wood:
      return 1;
    case BlockType.Grass:
    case BlockType.Dirt:
    case BlockType.Stone:
    case BlockType.Leaves:
    case BlockType.Water:
      return 1;
    default:
      return 0;
  }
}

export const enum ChunkState {
  LOADING = 0,
  READY = 1,
}

export interface PendingMeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

export class Chunk {
  /** Flat voxel array — index = x + y*SIZE + z*SIZE*SIZE */
  voxels: Uint8Array;

  /** Chunk coordinates (in chunk-space, not world-space) */
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;

  /** World-space origin (cx * CHUNK_SIZE, etc.) */
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;

  /** Dirty flag — true when voxels changed and mesh needs rebuild */
  dirty = true;

  /** GPU mesh buffers — owned by this chunk, destroyed on re-mesh or dispose */
  vertexBuffer: GPUBuffer | null = null;
  indexBuffer: GPUBuffer | null = null;
  indexCount = 0;
  vertexCount = 0;
  pendingMesh: PendingMeshData | null = null;
  uploadQueued = false;
  uploadInProgress = false;
  remeshQueued = false;
  remeshInFlight = false;
  needsRemesh = false;
  waitingForNeighborData = false;
  rebuildVersion = 0;
  disposed = false;
  hasLocalModifications = false;

  /** Lifecycle */
  state: ChunkState = ChunkState.LOADING;
  spawnTime = 0;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.worldX = cx * CHUNK_SIZE;
    this.worldY = cy * CHUNK_SIZE;
    this.worldZ = cz * CHUNK_SIZE;
    this.voxels = new Uint8Array(CHUNK_VOLUME);
  }

  /** Get block at local coordinates */
  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.Air;
    }
    return this.voxels[x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE];
  }

  /** Set block at local coordinates */
  setBlock(x: number, y: number, z: number, type: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.voxels[x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE] = type;
    this.dirty = true;
    this.hasLocalModifications = true;
  }

  /** Check if chunk has any non-air blocks */
  get isEmpty(): boolean {
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      if (this.voxels[i] !== BlockType.Air) return false;
    }
    return true;
  }

  /** Destroy GPU resources */
  dispose(): void {
    this.disposed = true;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.indexCount = 0;
    this.vertexCount = 0;
    this.pendingMesh = null;
    this.uploadQueued = false;
    this.uploadInProgress = false;
    this.remeshQueued = false;
    this.remeshInFlight = false;
    this.needsRemesh = false;
    this.waitingForNeighborData = false;
  }
}

/** Chunk map key from chunk coordinates */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}
