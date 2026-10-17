/**
 * 지리학적 연산 및 GeoJSON Circle 생성 유틸리티
 */

/**
 * Web Mercator 평면 상에서 왜곡(달걀형 찌그러짐) 없이 완벽한 정원을 유지하는 원 좌표 배열 생성
 * - 진앙 위도(centerLat) 기준 실제 거리(radiusKm) 스케일을 유지하면서 화면상으로는 정확한 원으로 표시
 * @param center [longitude, latitude]
 * @param radiusKm 반경 (km)
 * @param points 다각형 버텍스 수 (기본 96)
 */
export function createGeodesicCircle(
  center: [number, number],
  radiusKm: number,
  points = 96
): [number, number][] {
  if (radiusKm <= 0) return [];
  const [centerLon, centerLat] = center;
  const coords: [number, number][] = [];
  const rad = Math.PI / 180;
  const R = 6371.0088; // 지구 평균 반경 (km)

  // 진앙 위도에서의 Web Mercator 투영 반경 (라디안 단위)
  const cosLat = Math.max(0.1, Math.cos(centerLat * rad));
  const mercRadius = radiusKm / (R * cosLat);
  const centerMercY = Math.log(Math.tan(Math.PI / 4 + (centerLat * rad) / 2));
  const centerMercX = centerLon * rad;

  for (let i = 0; i <= points; i++) {
    const theta = (i * 2 * Math.PI) / points;
    const mx = centerMercX + mercRadius * Math.cos(theta);
    const my = centerMercY + mercRadius * Math.sin(theta);
    const lon = mx / rad;
    const lat = (2 * Math.atan(Math.exp(my)) - Math.PI / 2) / rad;
    coords.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  return coords;
}

/**
 * P파 및 S파 파면 Polygon/Line GeoJSON 생성
 */
export function buildWaveGeoJSON(
  epicenter: [number, number] | null,
  pRadiusKm: number,
  sRadiusKm: number
) {
  const features: any[] = [];

  if (!epicenter) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  // P파 원 (청록색 / 블루)
  if (pRadiusKm > 0) {
    const pCoords = createGeodesicCircle(epicenter, pRadiusKm, 96);
    if (pCoords.length > 0) {
      features.push({
        type: 'Feature',
        properties: {
          waveType: 'P',
          radiusKm: pRadiusKm
        },
        geometry: {
          type: 'Polygon',
          coordinates: [pCoords]
        }
      });
    }
  }

  // S파 원 (주황색 / 빨간색)
  if (sRadiusKm > 0) {
    const sCoords = createGeodesicCircle(epicenter, sRadiusKm, 96);
    if (sCoords.length > 0) {
      features.push({
        type: 'Feature',
        properties: {
          waveType: 'S',
          radiusKm: sRadiusKm
        },
        geometry: {
          type: 'Polygon',
          coordinates: [sCoords]
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * 진앙지 마커(X) GeoJSON 생성
 */
export function buildEpicenterGeoJSON(epicenter: [number, number] | null, info?: any) {
  if (!epicenter) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          ...info
        },
        geometry: {
          type: 'Point',
          coordinates: epicenter
        }
      }
    ]
  };
}
