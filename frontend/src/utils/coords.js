// Coordinate helpers. Latitude/longitude in degrees, planetocentric, east-positive.

export const MOON_RADIUS_KM = 1737.4;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Globe-mesh position matching SphereGeometry UVs (u = 0 at 180°W), before the mesh's rotation.y = -π/2. */
export function latLonToMeshLocal(lat, lon, r = 1) {
  const p = lat * D2R;
  const l = lon * D2R;
  return [r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l)];
}

/** Moon-fixed Cartesian unit vector (X → 0°E on equator, Z → north pole). */
export function latLonToVec(lat, lon) {
  const p = lat * D2R;
  const l = lon * D2R;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

/** Local East/North/Up basis at a site, in moon-fixed coordinates. */
export function enuBasis(lat, lon) {
  const p = lat * D2R;
  const l = lon * D2R;
  return {
    east: [-Math.sin(l), Math.cos(l), 0],
    north: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    up: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
  };
}

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Elevation/azimuth (deg, azimuth clockwise from north) of a direction seen from a site. */
export function elevAz(dir, basis) {
  const elev = Math.asin(Math.max(-1, Math.min(1, dot(dir, basis.up)))) * R2D;
  let az = Math.atan2(dot(dir, basis.east), dot(dir, basis.north)) * R2D;
  if (az < 0) az += 360;
  return { elev, az };
}

/** Destination from a start, bearing (deg clockwise from north) and surface distance (km). */
export function destination(lat, lon, bearingDeg, distKm) {
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const b = bearingDeg * D2R;
  const c = distKm / MOON_RADIUS_KM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(c) + Math.cos(p1) * Math.sin(c) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(c) * Math.cos(p1), Math.cos(c) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, ((((l2 * R2D + 180) % 360) + 360) % 360) - 180];
}

/** Keep sites off the exact pole, where local north is undefined. */
export const clampLat = (lat) => Math.max(-89.99, Math.min(89.99, lat));
