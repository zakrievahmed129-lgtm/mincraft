import type { ChunkWorkerMessage, ChunkGenerateResult, ChunkRebuildMessage, ChunkGenerateMessage } from './chunk.worker';

// Vite worker import syntax
// @ts-ignore
import ChunkWorker from './chunk.worker?worker';

export class WorkerPool {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private messageIdCounter = 0;
  private callbacks = new Map<number, (res: ChunkGenerateResult) => void>();

  constructor(poolSize: number = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new ChunkWorker();
      worker.onmessage = (e: MessageEvent<ChunkGenerateResult>) => {
        const id = e.data.id;
        const cb = this.callbacks.get(id);
        if (cb) {
          cb(e.data);
          this.callbacks.delete(id);
        }
      };
      this.workers.push(worker);
    }
  }

  generateChunk(cx: number, cy: number, cz: number, seed: number): Promise<ChunkGenerateResult> {
    return new Promise((resolve) => {
      const id = this.messageIdCounter++;
      this.callbacks.set(id, resolve);

      const msg: ChunkGenerateMessage = { type: 'GENERATE', id, cx, cy, cz, seed };
      
      const worker = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
      
      worker.postMessage(msg);
    });
  }

  rebuildChunk(
    cx: number,
    cy: number,
    cz: number,
    voxelData: Uint8Array,
    paddedVoxelData: Uint8Array
  ): Promise<ChunkGenerateResult> {
    return new Promise((resolve) => {
      const id = this.messageIdCounter++;
      this.callbacks.set(id, resolve);

      const msg: ChunkRebuildMessage = { type: 'REBUILD', id, cx, cy, cz, voxelData, paddedVoxelData };
      
      const worker = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
      
      // We explicitly transfer the voxelData buffer so the main thread yields ownership.
      // This ensures 0-copy transfer! But the main thread shouldn't use `voxelData` until it completes.
      worker.postMessage(msg, [voxelData.buffer, paddedVoxelData.buffer]);
    });
  }

  dispose() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
}
