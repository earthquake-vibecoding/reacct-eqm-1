import { useEffect, useState, MutableRefObject } from 'react';
import { WolfxEEWService, EEWContext, EEWState } from '../WolfxEEWService';
import { getWaveSurfaceRadius, getJmaTravelTime } from '../travelTime';
import { haversineDistance } from '../utils';
import { buildWaveGeoJSON, buildEpicenterGeoJSON } from '../geoUtils';
import { WaveStats } from '../types';

interface UseEEWWavesProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  eewContext: EEWContext;
  eewServiceRef: MutableRefObject<WolfxEEWService | null>;
}

export function useEEWWaves({ mapRef, mapLoaded, eewContext, eewServiceRef }: UseEEWWavesProps) {
  const [waveStats, setWaveStats] = useState<WaveStats>({
    elapsedSec: 0,
    pRadius: 0,
    sRadius: 0,
    pArrivalSec: null,
    sArrivalSec: null
  });

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    let animFrameId: number;

    const clearWaves = () => {
      const waveSource = map.getSource('eew-waves');
      if (waveSource) {
        waveSource.setData({ type: 'FeatureCollection', features: [] });
      }
      const epiSource = map.getSource('eew-epicenter');
      if (epiSource) {
        epiSource.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    const updateWaves = () => {
      const { state, data: activeEEW } = eewContext;

      if (state === EEWState.IDLE || state === EEWState.CANCELLED || !activeEEW || activeEEW.Latitude === undefined || activeEEW.Longitude === undefined) {
        clearWaves();
        return;
      }

      const now = Date.now();
      const originTs = activeEEW.originTimestamp ?? now;
      const elapsedSec = Math.max(0, (now - originTs) / 1000);
      const rawDepth = typeof activeEEW.Depth === 'number' ? activeEEW.Depth : parseFloat(String(activeEEW.Depth ?? ''));
      const depthKm = Math.max(0, Number.isFinite(rawDepth) ? rawDepth : 10);

      if (elapsedSec > 180) {
        clearWaves();
        if (eewServiceRef.current) {
          eewServiceRef.current.clearEEW();
        }
        return;
      }

      const pRadius = getWaveSurfaceRadius(elapsedSec, depthKm, 'P');
      const sRadius = getWaveSurfaceRadius(elapsedSec, depthKm, 'S');

      const center: [number, number] = [activeEEW.Longitude, activeEEW.Latitude];
      const waveGeoJSON = buildWaveGeoJSON(center, pRadius, sRadius);
      const epiGeoJSON = buildEpicenterGeoJSON(center, {
        hypocenter: activeEEW.Hypocenter,
        magnitude: activeEEW.Magunitude
      });

      const waveSource = map.getSource('eew-waves');
      if (waveSource) {
        waveSource.setData(waveGeoJSON);
      }

      const epiSource = map.getSource('eew-epicenter');
      if (epiSource) {
        epiSource.setData(epiGeoJSON);
      }

      setWaveStats({
        elapsedSec: Math.floor(elapsedSec),
        pRadius: Math.round(pRadius),
        sRadius: Math.round(sRadius),
        // 지도 화면 중심이 파동의 어느 위치에 있는지 → 도달 잔여 시간
        ...(() => {
          try {
            const mapCenter = map.getCenter();
            const distKm = haversineDistance(
              activeEEW.Longitude!, activeEEW.Latitude!,
              mapCenter.lng, mapCenter.lat
            );
            const travel = getJmaTravelTime(distKm, depthKm);
            const fmt = (t: number) => {
              const remain = Math.round(t - elapsedSec);
              return remain > 0 ? remain : null;
            };
            return { pArrivalSec: fmt(travel.pTime), sArrivalSec: fmt(travel.sTime) };
          } catch {
            return { pArrivalSec: null, sArrivalSec: null };
          }
        })()
      });

      animFrameId = requestAnimationFrame(updateWaves);
    };

    updateWaves();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [eewContext, mapLoaded, eewServiceRef, mapRef]);

  return { waveStats };
}
