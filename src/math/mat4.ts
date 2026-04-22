/**
 * Mat4 — Column-major 4x4 matrix ops on Float32Array(16).
 * WebGPU clip-space: z ∈ [0, 1], right-handed.
 */
import { Vec3, vec3Sub, vec3Cross, vec3Normalize, vec3Dot } from './vec3';

export type Mat4 = Float32Array;

const _tmpVec3A = new Float32Array(3);
const _tmpVec3B = new Float32Array(3);
const _tmpVec3C = new Float32Array(3);

export function mat4(): Mat4 {
  const o = new Float32Array(16);
  o[0] = 1; o[5] = 1; o[10] = 1; o[15] = 1;
  return o;
}

export function mat4Identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

/** Perspective projection — WebGPU z ∈ [0,1] */
export function mat4Perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY * 0.5);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = (near * far) / (near - far);
  return out;
}

/** Right-handed lookAt view matrix */
export function mat4LookAt(out: Mat4, eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = _tmpVec3A; // forward
  const s = _tmpVec3B; // side/right
  const u = _tmpVec3C; // true up

  vec3Sub(f, target, eye);
  vec3Normalize(f, f);
  vec3Cross(s, f, up);
  vec3Normalize(s, s);
  vec3Cross(u, s, f);

  out[0] = s[0];  out[1] = u[0];  out[2]  = -f[0]; out[3]  = 0;
  out[4] = s[1];  out[5] = u[1];  out[6]  = -f[1]; out[7]  = 0;
  out[8] = s[2];  out[9] = u[2];  out[10] = -f[2]; out[11] = 0;
  out[12] = -vec3Dot(s, eye);
  out[13] = -vec3Dot(u, eye);
  out[14] =  vec3Dot(f, eye);
  out[15] = 1;
  return out;
}

/** C = A × B (column-major) */
export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
    out[col * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** Build model matrix from Euler rotation (YXZ order) + translation + scale */
export function mat4FromTRS(out: Mat4, t: Vec3, r: Vec3, s: Vec3): Mat4 {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);

  // Rotation YXZ (common for FPS cameras)
  out[0]  = (cy * cz + sy * sx * sz) * s[0];
  out[1]  = (cx * sz) * s[0];
  out[2]  = (-sy * cz + cy * sx * sz) * s[0];
  out[3]  = 0;
  out[4]  = (cy * -sz + sy * sx * cz) * s[1];
  out[5]  = (cx * cz) * s[1];
  out[6]  = (sy * sz + cy * sx * cz) * s[1];
  out[7]  = 0;
  out[8]  = (sy * cx) * s[2];
  out[9]  = (-sx) * s[2];
  out[10] = (cy * cx) * s[2];
  out[11] = 0;
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
  return out;
}
