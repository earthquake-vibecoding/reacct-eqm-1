export function isPointInRing(pt: [number, number], ring: [number, number][]): boolean {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findAreaFeature(lon: number, lat: number, pref: string, name: string, features: any[]): any | null {
  if (lon !== 0 && lat !== 0 && !isNaN(lon) && !isNaN(lat) && Array.isArray(features)) {
    for (const f of features) {
      const geom = f?.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
        if (isPointInRing([lon, lat], geom.coordinates[0])) return f;
      } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly?.[0]) && isPointInRing([lon, lat], poly[0])) return f;
        }
      }
    }
  }

  const safePref = (pref || '').trim();
  const safeName = (name || '').trim();
  const full = safePref + safeName;

  if (Array.isArray(features)) {
    for (const f of features) {
      const fName = f.properties?.name || '';
      if (fName === full || fName === safeName) return f;
    }
    for (const f of features) {
      const fName = f.properties?.name || '';
      if (safeName && (fName.includes(safeName) || safeName.includes(fName))) return f;
      if (full && (fName.includes(full) || full.includes(fName))) return f;
    }
  }
  return null;
}
