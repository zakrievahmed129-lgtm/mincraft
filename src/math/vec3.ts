/**
 * Vec3 — Cache-friendly vector operations on Float32Array.
 * All functions follow the out-parameter pattern for zero allocation.
 */
export type Vec3 = Float32Array;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return new Float32Array([x, y, z]);
}

export function vec3Set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export function vec3Copy(out: Vec3, a: Vec3): Vec3 {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
  return out;
}

export function vec3Add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
  return out;
}

export function vec3Sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
  return out;
}

export function vec3Scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s;
  return out;
}

export function vec3ScaleAndAdd(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out[0] = a[0] + b[0] * s; out[1] = a[1] + b[1] * s; out[2] = a[2] + b[2] * s;
  return out;
}

export function vec3Cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = a[0], ay = a[1], az = a[2];
  const bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Length(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function vec3Normalize(out: Vec3, a: Vec3): Vec3 {
  const len = vec3Length(a);
  if (len > 1e-6) {
    const inv = 1 / len;
    out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv;
  }
  return out;
}

export function vec3Negate(out: Vec3, a: Vec3): Vec3 {
  out[0] = -a[0]; out[1] = -a[1]; out[2] = -a[2];
  return out;
}
