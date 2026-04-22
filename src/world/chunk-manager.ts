/**
 * ChunkManager — Manages chunk map, async terrain generation via workers, and cross-chunk block access.
 */
import { Chunk, CHUNK_SIZE, BlockType, chunkKey, ChunkState } from './chunk';
import { WorkerPool } from './worker-pool';

const RENDER_DISTANCE = 8; // Radius of chunks to load (reduced from 10 to 8 to improve FPS)
const PADDED_SIZE = CHUNK_SIZE + 2;
const PADDED_AREA = PADDED_SIZE * PADDED_SIZE;
const WATER_FLOW_DISTANCE = 7;
const NEIGHBOR_DIRECTIONS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

export class ChunkManager {
  readonly chunks = new Map<string, Chunk>();
  private pendingChunks = new Set<string>();
  private requestQueue: { cx: number, cy: number, cz: number, key: string, distSq: number }[] = [];
  private rebuildQueue: string[] = [];
  private waterFlowQueue: { x: number, y: number, z: number }[] = [];
  private waterFlowQueued = new Set<string>();
  private requiredChunkKeys = new Set<string>();
  private workerPool = new WorkerPool();
  private seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  /** Update active chunks around camera */
  update(cameraPosition: Float32Array | number[]): void {
    const camCx = Math.floor(cameraPosition[0] / CHUNK_SIZE);
    const camCy = Math.floor(cameraPosition[1] / CHUNK_SIZE); // Or ignore Y for vertical chunks? Let's just do a flat ground at Y=0 for now. We will only load Y=0 and Y=-1
    const camCz = Math.floor(cameraPosition[2] / CHUNK_SIZE);

    const requiredChunks = new Set<string>();
    
    // Request missing chunks in radius
    for (let cx = camCx - RENDER_DISTANCE; cx <= camCx + RENDER_DISTANCE; cx++) {
      for (let cz = camCz - RENDER_DISTANCE; cz <= camCz + RENDER_DISTANCE; cz++) {
        const distSq = (cx - camCx)**2 + (cz - camCz)**2;
        if (distSq <= RENDER_DISTANCE * RENDER_DISTANCE) {
          for (let cy = -1; cy <= 1; cy++) {
            const key = chunkKey(cx, cy, cz);
            requiredChunks.add(key);
            
            if (!this.chunks.has(key) && !this.pendingChunks.has(key) && !this.requestQueue.some(r => r.key === key)) {
              this.requestQueue.push({ cx, cy, cz, key, distSq });
            }
          }
        }
      }
    }

    this.requiredChunkKeys = requiredChunks;
    this.processQueue();
    this.processRebuildQueue();
    this.processWaterFlowQueue();

    // Unload chunks outside of radius
    for (const [key, chunk] of this.chunks.entries()) {
      if (!requiredChunks.has(key)) {
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    // Clean up queue for chunks no longer needed
    this.requestQueue = this.requestQueue.filter(r => requiredChunks.has(r.key));
  }

  private processQueue(): void {
    if (this.requestQueue.length === 0) return;

    // Sort by distance (closest first)
    this.requestQueue.sort((a, b) => a.distSq - b.distSq);

    // Limit to 2 requests per frame to smooth CPU load
    const count = Math.min(this.requestQueue.length, 2);
    for (let i = 0; i < count; i++) {
      const req = this.requestQueue.shift()!;
      this.requestChunk(req.cx, req.cy, req.cz, req.key);
    }
  }

  private async requestChunk(cx: number, cy: number, cz: number, key: string) {
    this.pendingChunks.add(key);
    
    try {
      const result = await this.workerPool.generateChunk(cx, cy, cz, this.seed);
      
      // We might have moved away before it finished!
      this.pendingChunks.delete(key);

      // 0-copy transfer: we take ownership of the buffer from the worker
      const chunk = new Chunk(cx, cy, cz);
      chunk.voxels = result.voxelData;
      
      // Main thread allocates the WebGPU buffer when processing dirty chunks.
      // We queue the raw mesh data and upload it asynchronously.
      chunk.pendingMesh = {
         vertices: result.vertices,
         indices: result.indices,
         vertexCount: result.vertexCount,
         indexCount: result.indexCount
      };
      
      chunk.state = ChunkState.READY;
      chunk.spawnTime = performance.now() / 1000.0; // Seconds
      chunk.dirty = true; 

      // If it hasn't been out-of-ranged already (e.g., very fast flying)
      // wait, `update` will prune it next frame if it is.
      this.chunks.set(key, chunk);
      this.scheduleRestitchForNewChunk(chunk);
      this.scheduleWaterFlowForChunk(chunk);
      
    } catch (err) {
      console.error("Worker failed to generate chunk:", err);
      this.pendingChunks.delete(key);
    }
  }

  /** Get voxel at world coordinates. Missing required neighbors report null while loading. */
  getVoxel(wx: number, wy: number, wz: number): number | null {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk || !chunk.voxels || chunk.voxels.length === 0) {
      return this.isChunkPendingOrRequired(cx, cy, cz) ? null : BlockType.Air;
    }
    
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, ly, lz);
  }

  /** Backward-compatible block lookup for gameplay systems. */
  getBlock(wx: number, wy: number, wz: number): number {
    return this.getVoxel(wx, wy, wz) ?? BlockType.Air;
  }

  /** Get a voxel relative to a chunk, walking into neighbors when coordinates overflow. */
  getChunkVoxel(chunk: Chunk, x: number, y: number, z: number): number | null {
    if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return chunk.getBlock(x, y, z);
    }

    return this.getVoxel(chunk.worldX + x, chunk.worldY + y, chunk.worldZ + z);
  }

  /** 
   * Set block at world coordinates.
   * If the block changes, we dispatch a REBUILD to the worker and update the chunk state.
   */
  async setBlockWorld(wx: number, wy: number, wz: number, type: number): Promise<void> {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const key = chunkKey(cx, cy, cz);
    
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (chunk.getBlock(lx, ly, lz) === type) return; // No change

    chunk.setBlock(lx, ly, lz, type); // Updates voxels locally
    this.scheduleChunkRemesh(chunk);
    this.scheduleWaterFlowAroundWorld(wx, wy, wz);

    // Boundary edits can reveal or hide faces in adjacent chunks.
    if (lx === 0) this.scheduleChunkRemeshByCoords(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx + 1, cy, cz);
    if (ly === 0) this.scheduleChunkRemeshByCoords(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx, cy + 1, cz);
    if (lz === 0) this.scheduleChunkRemeshByCoords(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx, cy, cz + 1);
  }

  *dirtyChunks(): IterableIterator<Chunk> {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) yield chunk;
    }
  }

  *allChunks(): IterableIterator<Chunk> {
    yield* this.chunks.values();
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.workerPool.dispose();
  }

  private processRebuildQueue(): void {
    if (this.rebuildQueue.length === 0) return;

    const count = Math.min(this.rebuildQueue.length, 1);
    for (let i = 0; i < count; i++) {
      const key = this.rebuildQueue.shift()!;
      const chunk = this.chunks.get(key);
      if (!chunk || chunk.disposed) continue;

      chunk.remeshQueued = false;
      if (chunk.remeshInFlight || !chunk.needsRemesh) continue;

      const paddedVoxelData = this.buildPaddedVoxelData(chunk);
      if (!paddedVoxelData) {
        chunk.waitingForNeighborData = true;
        chunk.needsRemesh = true;
        continue;
      }

      chunk.waitingForNeighborData = false;
      chunk.needsRemesh = false;
      chunk.remeshInFlight = true;
      const rebuildVersion = ++chunk.rebuildVersion;
      const voxelCopy = new Uint8Array(chunk.voxels);

      this.workerPool.rebuildChunk(chunk.cx, chunk.cy, chunk.cz, voxelCopy, paddedVoxelData)
        .then((result) => {
          const current = this.chunks.get(key);
          if (!current || current !== chunk || current.disposed) return;
          if (current.rebuildVersion !== rebuildVersion) return;

          current.waitingForNeighborData = false;
          current.pendingMesh = {
            vertices: result.vertices,
            indices: result.indices,
            vertexCount: result.vertexCount,
            indexCount: result.indexCount,
          };
          current.dirty = true;
        })
        .catch((err) => {
          console.error("Worker failed to rebuild meshing:", err);
        })
        .finally(() => {
          const current = this.chunks.get(key);
          if (!current || current !== chunk || current.disposed) return;

          current.remeshInFlight = false;
          if (current.needsRemesh && !current.remeshQueued) {
            current.remeshQueued = true;
            this.rebuildQueue.push(key);
          }
        });
    }
  }

  private processWaterFlowQueue(): void {
    const iterations = Math.min(2, this.waterFlowQueue.length);
    for (let i = 0; i < iterations; i++) {
      const source = this.waterFlowQueue.shift()!;
      this.waterFlowQueued.delete(this.waterKey(source.x, source.y, source.z));
      this.simulateWaterFlow(source.x, source.y, source.z);
    }
  }

  private scheduleChunkRemesh(chunk: Chunk): void {
    if (chunk.state !== ChunkState.READY || chunk.disposed) return;

    chunk.needsRemesh = true;
    chunk.waitingForNeighborData = false;
    if (!chunk.remeshQueued && !chunk.remeshInFlight) {
      chunk.remeshQueued = true;
      this.rebuildQueue.push(chunkKey(chunk.cx, chunk.cy, chunk.cz));
    }
  }

  private scheduleChunkRemeshByCoords(cx: number, cy: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return;
    this.scheduleChunkRemesh(chunk);
  }

  private scheduleRestitchForNewChunk(chunk: Chunk): void {
    let shouldRemeshNewChunk = false;

    for (const [dx, dy, dz] of NEIGHBOR_DIRECTIONS) {
      const neighbor = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cy + dy, chunk.cz + dz));
      if (!neighbor || neighbor === chunk || neighbor.disposed) continue;

      if (neighbor.hasLocalModifications || neighbor.waitingForNeighborData || neighbor.needsRemesh) {
        shouldRemeshNewChunk = true;
        this.scheduleChunkRemesh(neighbor);
      }
    }

    if (shouldRemeshNewChunk) {
      this.scheduleChunkRemesh(chunk);
    }
  }

  private buildPaddedVoxelData(chunk: Chunk): Uint8Array | null {
    const padded = new Uint8Array(PADDED_SIZE ** 3);

    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let y = -1; y <= CHUNK_SIZE; y++) {
        for (let x = -1; x <= CHUNK_SIZE; x++) {
          const voxel = this.getChunkVoxel(chunk, x, y, z);
          if (voxel === null) {
            return null;
          }

          padded[this.paddedIndex(x, y, z)] = voxel;
        }
      }
    }

    return padded;
  }

  private paddedIndex(x: number, y: number, z: number): number {
    const px = x + 1;
    const py = y + 1;
    const pz = z + 1;
    return px + py * PADDED_SIZE + pz * PADDED_AREA;
  }

  private isChunkPendingOrRequired(cx: number, cy: number, cz: number): boolean {
    const key = chunkKey(cx, cy, cz);
    if (this.pendingChunks.has(key) || this.requiredChunkKeys.has(key)) {
      return true;
    }

    return this.requestQueue.some((req) => req.key === key);
  }

  private scheduleWaterFlowForChunk(chunk: Chunk): void {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.getBlock(x, y, z) !== BlockType.Water) continue;
          const wx = chunk.worldX + x;
          const wy = chunk.worldY + y;
          const wz = chunk.worldZ + z;
          if (!this.hasAirNeighbor(wx, wy, wz)) continue;
          this.enqueueWaterFlow(wx, wy, wz);
        }
      }
    }
  }

  private scheduleWaterFlowAroundWorld(wx: number, wy: number, wz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = wx + dx;
          const y = wy + dy;
          const z = wz + dz;
          if (this.getBlock(x, y, z) === BlockType.Water) {
            this.enqueueWaterFlow(x, y, z);
          }
        }
      }
    }
  }

  private enqueueWaterFlow(x: number, y: number, z: number): void {
    const key = this.waterKey(x, y, z);
    if (this.waterFlowQueued.has(key)) return;
    this.waterFlowQueued.add(key);
    this.waterFlowQueue.push({ x, y, z });
  }

  private waterKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private hasAirNeighbor(wx: number, wy: number, wz: number): boolean {
    const neighbors = [
      [1, 0, 0], [-1, 0, 0],
      [0, 0, 1], [0, 0, -1],
      [0, -1, 0],
    ] as const;

    for (const [dx, dy, dz] of neighbors) {
      if (this.getBlock(wx + dx, wy + dy, wz + dz) === BlockType.Air) return true;
    }
    return false;
  }

  private simulateWaterFlow(sourceX: number, sourceY: number, sourceZ: number): void {
    if (this.getBlock(sourceX, sourceY, sourceZ) !== BlockType.Water) return;

    const queue: { x: number, y: number, z: number, horizontal: number }[] = [
      { x: sourceX, y: sourceY, z: sourceZ, horizontal: 0 },
    ];
    const visited = new Set<string>([this.waterKey(sourceX, sourceY, sourceZ)]);
    let steps = 0;

    while (queue.length > 0 && steps < 192) {
      steps++;
      const current = queue.shift()!;

      const below = { x: current.x, y: current.y - 1, z: current.z, horizontal: current.horizontal };
      if (this.getBlock(below.x, below.y, below.z) === BlockType.Air && this.setBlockDirect(below.x, below.y, below.z, BlockType.Water)) {
        const key = this.waterKey(below.x, below.y, below.z);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(below);
        }
        continue;
      }

      if (current.horizontal >= WATER_FLOW_DISTANCE) continue;

      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const;

      for (const [dx, dz] of dirs) {
        const nx = current.x + dx;
        const ny = current.y;
        const nz = current.z + dz;
        const key = this.waterKey(nx, ny, nz);
        if (visited.has(key)) continue;
        visited.add(key);

        const target = this.getBlock(nx, ny, nz);
        if (target !== BlockType.Air) continue;

        const support = this.getBlock(nx, ny - 1, nz);
        const canSpread = support !== BlockType.Air || this.getBlock(nx, ny - 1, nz) === BlockType.Water;
        if (!canSpread) continue;

        if (this.setBlockDirect(nx, ny, nz, BlockType.Water)) {
          queue.push({ x: nx, y: ny, z: nz, horizontal: current.horizontal + 1 });
        }
      }
    }
  }

  private setBlockDirect(wx: number, wy: number, wz: number, type: number): boolean {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk || !chunk.voxels || chunk.voxels.length === 0) return false;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (chunk.getBlock(lx, ly, lz) === type) return false;
    chunk.setBlock(lx, ly, lz, type);
    this.scheduleChunkRemesh(chunk);
    if (lx === 0) this.scheduleChunkRemeshByCoords(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx + 1, cy, cz);
    if (ly === 0) this.scheduleChunkRemeshByCoords(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx, cy + 1, cz);
    if (lz === 0) this.scheduleChunkRemeshByCoords(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.scheduleChunkRemeshByCoords(cx, cy, cz + 1);
    return true;
  }
}
