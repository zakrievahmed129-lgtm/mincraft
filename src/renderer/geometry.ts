/**
 * Cube Geometry — 24 vertices (flat normals), 36 indices.
 * Vertex layout: position(3f) + normal(3f) = 24 bytes stride.
 */
export interface CubeGeometry {
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
}

export function createCubeGeometry(): CubeGeometry {
  // prettier-ignore
  const vertices = new Float32Array([
    // Front  (z = +0.5)  normal (0, 0, 1)
    -0.5, -0.5,  0.5,   0,  0,  1,
     0.5, -0.5,  0.5,   0,  0,  1,
     0.5,  0.5,  0.5,   0,  0,  1,
    -0.5,  0.5,  0.5,   0,  0,  1,
    // Back   (z = -0.5)  normal (0, 0, -1)
     0.5, -0.5, -0.5,   0,  0, -1,
    -0.5, -0.5, -0.5,   0,  0, -1,
    -0.5,  0.5, -0.5,   0,  0, -1,
     0.5,  0.5, -0.5,   0,  0, -1,
    // Top    (y = +0.5)  normal (0, 1, 0)
    -0.5,  0.5,  0.5,   0,  1,  0,
     0.5,  0.5,  0.5,   0,  1,  0,
     0.5,  0.5, -0.5,   0,  1,  0,
    -0.5,  0.5, -0.5,   0,  1,  0,
    // Bottom (y = -0.5)  normal (0, -1, 0)
    -0.5, -0.5, -0.5,   0, -1,  0,
     0.5, -0.5, -0.5,   0, -1,  0,
     0.5, -0.5,  0.5,   0, -1,  0,
    -0.5, -0.5,  0.5,   0, -1,  0,
    // Right  (x = +0.5)  normal (1, 0, 0)
     0.5, -0.5,  0.5,   1,  0,  0,
     0.5, -0.5, -0.5,   1,  0,  0,
     0.5,  0.5, -0.5,   1,  0,  0,
     0.5,  0.5,  0.5,   1,  0,  0,
    // Left   (x = -0.5)  normal (-1, 0, 0)
    -0.5, -0.5, -0.5,  -1,  0,  0,
    -0.5, -0.5,  0.5,  -1,  0,  0,
    -0.5,  0.5,  0.5,  -1,  0,  0,
    -0.5,  0.5, -0.5,  -1,  0,  0,
  ]);

  // prettier-ignore
  const indices = new Uint16Array([
     0, 1, 2,   0, 2, 3,    // front
     4, 5, 6,   4, 6, 7,    // back
     8, 9,10,   8,10,11,    // top
    12,13,14,  12,14,15,    // bottom
    16,17,18,  16,18,19,    // right
    20,21,22,  20,22,23,    // left
  ]);

  return { vertices, indices, indexCount: 36 };
}
