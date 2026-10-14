/** Exact 2-D Taylor–Green solution of unforced viscous incompressible Navier–Stokes
 * on T². This illustrates one smooth periodic solution, NOT a proof for T³. */
export function taylorGreen(x, y, t, nu = 0.035) {
  if (![x,y,t,nu].every(Number.isFinite) || nu < 0 || t < 0) throw new RangeError('Invalid torus conditions');
  const a = Math.exp(-2 * nu * t);
  return {
    u: -Math.cos(x) * Math.sin(y) * a,
    v: Math.sin(x) * Math.cos(y) * a,
    pressure: -.25 * (Math.cos(2*x) + Math.cos(2*y)) * a*a,
    vorticity: 2 * Math.cos(x) * Math.cos(y) * a,
    kineticEnergyFraction: a*a,
  };
}
export function periodic(x, length = 2 * Math.PI) {
  if (!(length > 0)) throw new RangeError('Invalid period');
  return ((x % length) + length) % length;
}
export function cavityIndex(x, y, z, n) { return x*n*n + y*n + z; }
export function decodeCavity(data) {
  const n = data?.n;
  if (!Number.isInteger(n) || n < 4 || n > 64) throw new Error('Invalid 3-D dataset resolution');
  const num = n ** 3;
  const bytes = (value) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const temperature = bytes(data.temperature_u8), solid = bytes(data.solid_u8);
  const velocitiesRaw = bytes(data.velocity_i16le);
  if (temperature.length !== num || solid.length !== num || velocitiesRaw.length !== num * 3 * 2) {
    throw new Error('3-D field payload is incomplete');
  }
  const view = new DataView(velocitiesRaw.buffer, velocitiesRaw.byteOffset, velocitiesRaw.byteLength);
  const velocities = new Float32Array(num*3);
  for(let i=0;i<velocities.length;i++) velocities[i] = view.getInt16(i*2,true) / data.velocity_scale;
  if (!Number.isFinite(data.velocity_scale) || data.velocity_scale <= 0) throw new Error('Invalid velocity scale');
  return { n, temperature, solid, velocities, metadata:data.metadata, rank:data.rank, baseline:data.baseline };
}
export function cubeCell(field, x, y, z) {
  const n = field.n, i=cavityIndex(Math.max(0,Math.min(n-1,x|0)),Math.max(0,Math.min(n-1,y|0)),Math.max(0,Math.min(n-1,z|0)),n);
  const n3=n**3;
  return { temp:field.temperature[i]/255, solid:field.solid[i] !== 0,
    vx:field.velocities[i], vy:field.velocities[n3+i], vz:field.velocities[n3*2+i] };
}
