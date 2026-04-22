/**
 * Frustum — Extract 6 planes from VP matrix, test AABB intersection.
 * Gribb/Hartmann plane extraction from column-major mat4.
 */
import type { Mat4 } from './mat4';

/** Plane: [a, b, c, d] where ax + by + cz + d ≤ 0 is inside */
export type Plane = Float32Array; // length 4

export interface Frustum {
  planes: Plane[]; // 6 planes: left, right, bottom, top, near, far
}

/** Extract frustum planes from a viewProjection matrix (column-major) */
export function frustumFromVP(vp: Mat4): Frustum {
  const planes: Plane[] = [];

  // Row vectors of the VP matrix (column-major → row i = vp[i], vp[i+4], vp[i+8], vp[i+12])
  // Left:   row3 + row0
  planes.push(normalizePlane(new Float32Array([
    vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8], vp[15] + vp[12]
  ])));
  // Right:  row3 - row0
  planes.push(normalizePlane(new Float32Array([
    vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8], vp[15] - vp[12]
  ])));
  // Bottom: row3 + row1
  planes.push(normalizePlane(new Float32Array([
    vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9], vp[15] + vp[13]
  ])));
  // Top:    row3 - row1
  planes.push(normalizePlane(new Float32Array([
    vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9], vp[15] - vp[13]
  ])));
  // Near:   row3 + row2
  planes.push(normalizePlane(new Float32Array([
    vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]
  ])));
  // Far:    row3 - row2
  planes.push(normalizePlane(new Float32Array([
    vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]
  ])));

  return { planes };
}

function normalizePlane(p: Plane): Plane {
  const len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  if (len > 1e-8) {
    p[0] /= len; p[1] /= len; p[2] /= len; p[3] /= len;
  }
  return p;
}

/**
 * Test AABB against frustum using p-vertex optimization.
 * Returns true if AABB is at least partially inside the frustum.
 */
export function frustumContainsAABB(
  frustum: Frustum,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  for (let i = 0; i < 6; i++) {
    const p = frustum.planes[i];
    // p-vertex: the corner of the AABB most in the direction of the plane normal
    const px = p[0] > 0 ? maxX : minX;
    const py = p[1] > 0 ? maxY : minY;
    const pz = p[2] > 0 ? maxZ : minZ;

    // If the p-vertex is outside the plane, the entire AABB is outside
    if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) {
      return false;
    }
  }
  return true;
}
