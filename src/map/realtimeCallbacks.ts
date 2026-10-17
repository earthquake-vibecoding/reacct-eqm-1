import { QuakeDetectService, TopStationItem } from '../QuakeDetectService';
import { BackgroundSyncService } from '../backgroundSyncService';
import { DataSourceType, DetectionAlertInfo } from '../types';
import { getExactJindoColor } from '../colorMap';
import { fitJapanBounds } from '../zoomUtils';
import { dataHealthService } from '../dataHealthService';
import { formatJSTClock } from '../utils';
import { updateLpPointsOnMap } from './stationLayers';
import { refreshUserLocation } from './userLocation';

export interface RealtimeStreamDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any;
  kmoniQuakeService: QuakeDetectService;
  yahooQuakeService: QuakeDetectService;
  getCurrentSource: () => DataSourceType;
  isReplayActive: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setLastGridGeojson: (geojson: any) => void;
  onTopStationsUpdated?: (topStations: TopStationItem[]) => void;
  onKmoniEventDetected?: (center: [number, number]) => void;
  onDetectionAlert?: (alert: DetectionAlertInfo) => void;
  onDetectionFinished?: () => void;
}

export function createDetectionCallbacks(sourceType: DataSourceType, deps: RealtimeStreamDeps) {
  const {
    map, kmoniQuakeService, yahooQuakeService, getCurrentSource, isReplayActive,
    setLastGridGeojson, onTopStationsUpdated, onKmoniEventDetected, onDetectionAlert, onDetectionFinished
  } = deps;

  const isSourceActive = () => {
    const cur = getCurrentSource();
    return cur === sourceType || (cur === 'p2pquake' && sourceType === 'kmoni');
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPointsUpdated: (updatedGeojson: any) => {
      if (getCurrentSource() !== sourceType || isReplayActive()) return;
      const source = map.getSource('intensity-points');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (source) (source as any).setData(updatedGeojson);
      // 내 위치 마커가 켜져 있으면 실시간 관측값 기준 추정 진도 칩도 갱신
      refreshUserLocation(map, updatedGeojson);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDetectedUpdated: (detectedGeojson: any) => {
      if (!isSourceActive()) return;
      setLastGridGeojson(detectedGeojson);
      if (isReplayActive()) return;
      const source = map.getSource('detected-grids');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (source) (source as any).setData(detectedGeojson);
    },
    onNewEventDetected: (center: [number, number]) => {
      if (!isSourceActive() || isReplayActive()) return;
      if (onKmoniEventDetected) onKmoniEventDetected(center);
      map.flyTo({ center, zoom: 6.2, speed: 1.2, curve: 1.4, essential: true });

      const currentService = sourceType === 'kmoni' ? kmoniQuakeService : yahooQuakeService;
      const topStn = currentService.getTopStations(1)[0];
      const curJindo = topStn?.jindo ?? -0.5;
      const curJindoStr = topStn?.jindoStr ?? '0';

      if (onDetectionAlert) {
        onDetectionAlert({
          id: `${sourceType}-${Date.now()}`, source: sourceType, sourceName: sourceType.toUpperCase(),
          jindo: curJindo, jindoStr: curJindoStr,
          jindoFormatted: curJindo >= 0 ? `+${curJindo.toFixed(1)}` : curJindo.toFixed(1),
          color: topStn?.color || getExactJindoColor(curJindo),
          timestamp: Date.now(), timeStr: formatJSTClock(new Date()),
          stationName: topStn?.fullName || topStn?.name, region: topStn?.region,
          center, isNewEvent: true
        });
      }
    },
    onEventsFinished: () => {
      if (!isSourceActive() || isReplayActive()) return;
      if (getCurrentSource() !== 'p2pquake') fitJapanBounds(map, true);

      const emptyGrid = { type: 'FeatureCollection', features: [] };
      setLastGridGeojson(emptyGrid);
      const source = map.getSource('detected-grids');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (source) (source as any).setData(emptyGrid);
      if (onDetectionFinished) onDetectionFinished();
    },
    onSoundTriggered: (jindo: number, jindoStr: string) => {
      console.log(`[${sourceType.toUpperCase()} 지진 감지] 예상 진도: ${jindoStr} (${jindo.toFixed(1)})`);
      if (!isSourceActive() || isReplayActive()) return;

      const currentService = sourceType === 'kmoni' ? kmoniQuakeService : yahooQuakeService;
      const topStn = currentService.getTopStations(1)[0];
      if (onDetectionAlert) {
        onDetectionAlert({
          id: `${sourceType}-${Date.now()}`, source: sourceType, sourceName: sourceType.toUpperCase(),
          jindo, jindoStr, jindoFormatted: jindo >= 0 ? `+${jindo.toFixed(1)}` : jindo.toFixed(1),
          color: getExactJindoColor(jindo),
          timestamp: Date.now(), timeStr: formatJSTClock(new Date()),
          stationName: topStn?.fullName || topStn?.name, region: topStn?.region, center: topStn?.lonlat
        });
      }
    },
    onTopStationsUpdated: (topList: TopStationItem[]) => {
      if (isSourceActive() && onTopStationsUpdated) onTopStationsUpdated(topList);
    }
  };
}

export function connectRealtimeStream(deps: RealtimeStreamDeps) {
  const { map, kmoniQuakeService, yahooQuakeService, getCurrentSource, isReplayActive } = deps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleServerPayload = (payload: any) => {
    if (!payload) return;
    if (payload.source === 'lmoni') {
      if (!isReplayActive()) updateLpPointsOnMap(map, kmoniQuakeService, payload.lp ?? {}, payload.lpColors ?? {});
      return;
    }
    if (!payload.intensities) return;
    const { source, intensities } = payload;

    dataHealthService.report('kmoni', {
      status: 'online', detail: '실시간 진도 수신 (1초 주기)', lastReceivedAt: Date.now(),
    });

    const cur = getCurrentSource();
    if (source === 'kmoni' && (cur === 'kmoni' || cur === 'p2pquake')) {
      kmoniQuakeService.processKmoniParsedData(intensities, createDetectionCallbacks('kmoni', deps));
    } else if (source === 'yahoo' && cur === 'yahoo') {
      yahooQuakeService.processKmoniParsedData(intensities, createDetectionCallbacks('yahoo', deps));
    }
  };

  let eventSource: EventSource | null = null;
  const connectSSE = () => {
    try {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/intensity/stream');
      eventSource.onmessage = (e) => { try { handleServerPayload(JSON.parse(e.data)); } catch {} };
      eventSource.onerror = () => {
        dataHealthService.report('kmoni', { status: 'delayed', detail: 'SSE 재연결 시도 중 (REST 폴백)' });
        if (eventSource) { eventSource.close(); eventSource = null; }
        setTimeout(connectSSE, 3000);
      };
    } catch (err) { console.warn('[SSE Connection Failed, fallback to polling]:', err); }
  };

  connectSSE();

  let isFetching = false;
  const fetchRealTime = async (force = false) => {
    if (!force && eventSource && eventSource.readyState === EventSource.OPEN) return;
    if (isFetching) return;
    isFetching = true;
    try {
      const srcParam = getCurrentSource() === 'yahoo' ? 'yahoo' : 'kmoni';
      const resp = await fetch(`/api/intensity/latest?source=${srcParam}`);
      if (resp.ok) handleServerPayload(await resp.json());
    } catch {} finally { isFetching = false; }
  };

  fetchRealTime(true);
  const bgService = BackgroundSyncService.getInstance();
  bgService.registerWorkerInterval('realtime-station-fetch', () => fetchRealTime(false), 1500);
  const unregisterResume = bgService.onTabResume(() => {
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      fetchRealTime(true);
      connectSSE();
    }
  });

  return {
    fetchRealTime: () => fetchRealTime(true),
    cleanupStream: () => {
      if (eventSource) { eventSource.close(); eventSource = null; }
      bgService.clearWorkerInterval('realtime-station-fetch');
      unregisterResume();
    }
  };
}
