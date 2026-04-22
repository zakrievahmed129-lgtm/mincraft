import { Vec3, vec3 } from './vec3';

export interface RaycastResult {
  hitWorldPos: Vec3;       // XYZ coordinates of the intersected voxel
  placeWorldPos: Vec3;     // XYZ of the empty voxel just before the hit (for placing blocks)
  normal: Vec3;            // Surface normal at intersection point
  distance: number;        // Distance traversed from origin
}

/**
 * Fast Voxel Raycast (DDA Algorithm - Amanatides & Woo 1987)
 * Intersects a ray against a voxel grid, queried via the getBlock function.
 * @param origin Start position of the ray
 * @param direction Normalized direction vector
 * @param maxDistance Maximum ray distance
 * @param getBlock Function to check if a block is solid (returns true if solid)
 */
export function fastVoxelRaycast(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => boolean
): RaycastResult | null {
  // Current voxel coordinate we are examining
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  // Which way the voxel coordinate steps on each axis
  const stepX = Math.sign(direction[0]);
  const stepY = Math.sign(direction[1]);
  const stepZ = Math.sign(direction[2]);

  // How far we must move along the ray to traverse one voxel on each axis
  // If direction is 0, tDelta is theoretically infinity
  const tDeltaX = stepX !== 0 ? Math.abs(1.0 / direction[0]) : Number.MAX_VALUE;
  const tDeltaY = stepY !== 0 ? Math.abs(1.0 / direction[1]) : Number.MAX_VALUE;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1.0 / direction[2]) : Number.MAX_VALUE;

  // Track the distance along the ray to the *next* voxel boundary
  // e.g. x + (stepX > 0 ? 1 : 0) gives the border x coordinate we are approaching
  const getInitialMax = (originValue: number, currentBlockValue: number, step: number, delta: number) => {
    if (step === 0) return Number.MAX_VALUE;
    const border = currentBlockValue + (step > 0 ? 1 : 0);
    return Math.abs((border - originValue) * delta);
  };

  let tMaxX = getInitialMax(origin[0], x, stepX, tDeltaX);
  let tMaxY = getInitialMax(origin[1], y, stepY, tDeltaY);
  let tMaxZ = getInitialMax(origin[2], z, stepZ, tDeltaZ);

  // Keep track of the *previous* voxel coordinate (useful for placing blocks)
  let prevX = x;
  let prevY = y;
  let prevZ = z;

  // Normal of the intersected face
  let steppedAxis = -1; // 0=X, 1=Y, 2=Z

  // We are already *inside* a block. If a solid block is at the camera origin, we hit immediately.
  // But usually we don't start inside a wall in FPS, unless we glitch.
  if (getBlock(x, y, z)) {
    return {
      hitWorldPos: vec3(x, y, z),
      placeWorldPos: vec3(prevX, prevY, prevZ),
      normal: vec3(0, 1, 0), // arbitrarily upwards if jammed
      distance: 0,
    };
  }

  // Traverse the grid
  while (true) {
    prevX = x;
    prevY = y;
    prevZ = z;

    // Advance to the next voxel boundary via the shortest path
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        tMaxX += tDeltaX;
        steppedAxis = 0;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
        steppedAxis = 2;
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY;
        tMaxY += tDeltaY;
        steppedAxis = 1;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
        steppedAxis = 2;
      }
    }

    // Determine traveled distance 
    const distanceTraversed = steppedAxis === 0 ? tMaxX - tDeltaX
                            : steppedAxis === 1 ? tMaxY - tDeltaY : tMaxZ - tDeltaZ;

    if (distanceTraversed > maxDistance) {
      return null;
    }

    // Check hit
    if (getBlock(x, y, z)) {
      const normal = vec3();
      if (steppedAxis === 0) normal[0] = -stepX;
      if (steppedAxis === 1) normal[1] = -stepY;
      if (steppedAxis === 2) normal[2] = -stepZ;

      return {
        hitWorldPos: vec3(x, y, z),
        placeWorldPos: vec3(prevX, prevY, prevZ),
        normal,
        distance: distanceTraversed,
      };
    }
  }
}
