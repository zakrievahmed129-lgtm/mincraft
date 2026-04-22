/**
 * Greedy Mesher — Generates optimized meshes from chunk voxel data.
 * 
 * Algorithm (Mikola Lysenko / 0fps):
 * For each axis (X, Y, Z) and direction (+/-):
 *   1. Sweep slice planes through the chunk
 *   2. Build a 2D mask of visible faces (solid block + air/OOB neighbor)
 *   3. Greedily merge adjacent same-type mask entries into maximal rectangles
 *   4. Emit one quad per merged rectangle
 *
 * Vertex layout: position(3f) + normal(3f) + blockType(1f) + uv(2f) + ao(1f) = 10 floats = 40 bytes
 */
import { Chunk, CHUNK_SIZE, BlockType } from './chunk';

export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

// 6 face directions: [axis, sign, normal]
const FACES = [
  { axis: 0, sign:  1, normal: [ 1, 0, 0] }, // +X right
  { axis: 0, sign: -1, normal: [-1, 0, 0] }, // -X left
  { axis: 1, sign:  1, normal: [ 0, 1, 0] }, // +Y top
  { axis: 1, sign: -1, normal: [0, -1, 0] }, // -Y bottom
  { axis: 2, sign:  1, normal: [ 0, 0, 1] }, // +Z front
  { axis: 2, sign: -1, normal: [0, 0, -1] }, // -Z back
];

const S = CHUNK_SIZE;
const AO_LEVELS = [1.0, 0.8, 0.6, 0.42];

function getVoxel(
  chunk: Chunk,
  x: number,
  y: number,
  z: number,
  getNeighborBlock: (wx: number, wy: number, wz: number) => number
): number {
  if (x >= 0 && x < S && y >= 0 && y < S && z >= 0 && z < S) {
    return chunk.getBlock(x, y, z);
  }

  return getNeighborBlock(chunk.worldX + x, chunk.worldY + y, chunk.worldZ + z);
}

function isSolid(
  chunk: Chunk,
  x: number,
  y: number,
  z: number,
  getNeighborBlock: (wx: number, wy: number, wz: number) => number
): boolean {
  return getVoxel(chunk, x, y, z, getNeighborBlock) !== BlockType.Air;
}

function sampleVertexAO(
  chunk: Chunk,
  pos: number[],
  axis: number,
  sign: number,
  u: number,
  v: number,
  uSign: number,
  vSign: number,
  getNeighborBlock: (wx: number, wy: number, wz: number) => number
): number {
  const side1 = [...pos];
  side1[axis] += sign;
  side1[u] += uSign;

  const side2 = [...pos];
  side2[axis] += sign;
  side2[v] += vSign;

  const corner = [...pos];
  corner[axis] += sign;
  corner[u] += uSign;
  corner[v] += vSign;

  const side1Solid = isSolid(chunk, side1[0], side1[1], side1[2], getNeighborBlock);
  const side2Solid = isSolid(chunk, side2[0], side2[1], side2[2], getNeighborBlock);
  const cornerSolid = isSolid(chunk, corner[0], corner[1], corner[2], getNeighborBlock);

  if (side1Solid && side2Solid) return AO_LEVELS[3];
  const occlusion = Number(side1Solid) + Number(side2Solid) + Number(cornerSolid);
  return AO_LEVELS[occlusion];
}

/**
 * Generates a greedy-meshed mesh for one chunk.
 * Uses getNeighborBlock for cross-chunk neighbor lookups at boundaries.
 */
export function greedyMesh(chunk: Chunk, getNeighborBlock: (wx: number, wy: number, wz: number) => number): MeshData {
  // Dynamic arrays — we don't know final size
  const verts: number[] = [];
  const idxs: number[] = [];
  let vertIdx = 0;

  // Reusable mask
  const mask = new Int32Array(S * S); // 0 = no face, >0 = blockType

  for (const face of FACES) {
    const { axis, sign, normal } = face;

    // u, v are the two axes perpendicular to 'axis'
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;

    // Sweep along the main axis
    for (let d = 0; d < S; d++) {
      // Build the mask for this slice
      mask.fill(0);

      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          // Map (d, i, j) back to (x, y, z) based on axis
          const pos = [0, 0, 0];
          pos[axis] = d;
          pos[u] = i;
          pos[v] = j;

          const blockType = getVoxel(chunk, pos[0], pos[1], pos[2], getNeighborBlock);
          if (blockType === BlockType.Air) continue;

          // Check neighbor in the face direction
          const nPos = [pos[0], pos[1], pos[2]];
          nPos[axis] += sign;

          const neighborType = getVoxel(chunk, nPos[0], nPos[1], nPos[2], getNeighborBlock);

          // Face is visible if neighbor is air
          if (neighborType === BlockType.Air) {
            mask[i + j * S] = blockType;
          }
        }
      }

      // Greedy merge the mask into maximal rectangles
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S;) {
          const type = mask[i + j * S];
          if (type === 0) { i++; continue; }

          // Find width (extend along u-axis)
          let w = 1;
          while (i + w < S && mask[(i + w) + j * S] === type) w++;

          // Find height (extend along v-axis)
          let h = 1;
          let canExtend = true;
          while (j + h < S && canExtend) {
            for (let k = 0; k < w; k++) {
              if (mask[(i + k) + (j + h) * S] !== type) {
                canExtend = false;
                break;
              }
            }
            if (canExtend) h++;
          }

          // Clear the merged region from mask
          for (let jj = 0; jj < h; jj++) {
            for (let ii = 0; ii < w; ii++) {
              mask[(i + ii) + (j + jj) * S] = 0;
            }
          }

          // Emit quad
          // Corner position in local chunk space
          const corner = [0, 0, 0];
          corner[axis] = sign > 0 ? d + 1 : d; // offset face in direction
          corner[u] = i;
          corner[v] = j;

          // du and dv vectors
          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;

          const faceBase = [0, 0, 0];
          faceBase[axis] = d;
          faceBase[u] = i;
          faceBase[v] = j;

          const base0 = [faceBase[0], faceBase[1], faceBase[2]];
          const base1 = [faceBase[0], faceBase[1], faceBase[2]];
          base1[u] += w - 1;
          const base2 = [faceBase[0], faceBase[1], faceBase[2]];
          base2[u] += w - 1;
          base2[v] += h - 1;
          const base3 = [faceBase[0], faceBase[1], faceBase[2]];
          base3[v] += h - 1;

          const ao0 = sampleVertexAO(chunk, base0, axis, sign, u, v, -1, -1, getNeighborBlock);
          const ao1 = sampleVertexAO(chunk, base1, axis, sign, u, v, 1, -1, getNeighborBlock);
          const ao2 = sampleVertexAO(chunk, base2, axis, sign, u, v, 1, 1, getNeighborBlock);
          const ao3 = sampleVertexAO(chunk, base3, axis, sign, u, v, -1, 1, getNeighborBlock);

          // 4 vertices of the quad
          const nx = normal[0], ny = normal[1], nz = normal[2];

          // Compute absolute world positions for UV mapping
          const getUV = (cx: number, cy: number, cz: number) => {
            let u = 0, v = 0;
            if (axis === 0) { // X
              u = sign > 0 ? -cz : cz;
              v = -cy;
            } else if (axis === 1) { // Y
              u = cx;
              v = sign > 0 ? cz : -cz;
            } else { // Z
              u = sign > 0 ? cx : -cx;
              v = -cy;
            }
            return [u, v];
          };

          const c0 = [corner[0], corner[1], corner[2]];
          const c1 = [corner[0] + du[0], corner[1] + du[1], corner[2] + du[2]];
          const c2 = [corner[0] + du[0] + dv[0], corner[1] + du[1] + dv[1], corner[2] + du[2] + dv[2]];
          const c3 = [corner[0] + dv[0], corner[1] + dv[1], corner[2] + dv[2]];

          const uv0 = getUV(c0[0], c0[1], c0[2]);
          const uv1 = getUV(c1[0], c1[1], c1[2]);
          const uv2 = getUV(c2[0], c2[1], c2[2]);
          const uv3 = getUV(c3[0], c3[1], c3[2]);

          // v0 = corner
          verts.push(c0[0], c0[1], c0[2], nx, ny, nz, type, uv0[0], uv0[1], ao0);
          // v1 = corner + du
          verts.push(c1[0], c1[1], c1[2], nx, ny, nz, type, uv1[0], uv1[1], ao1);
          // v2 = corner + du + dv
          verts.push(c2[0], c2[1], c2[2], nx, ny, nz, type, uv2[0], uv2[1], ao2);
          // v3 = corner + dv
          verts.push(c3[0], c3[1], c3[2], nx, ny, nz, type, uv3[0], uv3[1], ao3);

          // Pick the diagonal that best preserves AO gradients.
          const flipDiagonal = ao0 + ao2 > ao1 + ao3;

          // 2 triangles — winding order depends on face direction
          if (sign > 0) {
            if (flipDiagonal) {
              idxs.push(vertIdx, vertIdx + 1, vertIdx + 3);
              idxs.push(vertIdx + 1, vertIdx + 2, vertIdx + 3);
            } else {
              idxs.push(vertIdx, vertIdx + 1, vertIdx + 2);
              idxs.push(vertIdx, vertIdx + 2, vertIdx + 3);
            }
          } else {
            if (flipDiagonal) {
              idxs.push(vertIdx, vertIdx + 3, vertIdx + 1);
              idxs.push(vertIdx + 1, vertIdx + 3, vertIdx + 2);
            } else {
              idxs.push(vertIdx, vertIdx + 2, vertIdx + 1);
              idxs.push(vertIdx, vertIdx + 3, vertIdx + 2);
            }
          }
          vertIdx += 4;

          i += w;
        }
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idxs),
    vertexCount: vertIdx,
    indexCount: idxs.length,
  };
}
