import { QuakeDetectService, TopStationItem } from './QuakeDetectService';
import { BackgroundSyncService } from './backgroundSyncService';
import { DataSourceType, HoverInfo, IGeoProvider, MapRendererController, DetectionAlertInfo } from './types';
import { P2PEarthquakeEvent } from './P2PQuakeService';
import { setupBaseAndEewLayers } from './map/baseAndEewLayers';
import { setupP2PAndKmaLayers } from './map/p2pAndKmaLayers';
import { applyDataSourceVisibility, updateKMAEventOnMap, updateP2PEventOnMap } from './map/p2pAndKmaUpdaters';
import { loadAndSetupStationLayers } from './map/stationLayers';
import { connectRealtimeStream } from './map/realtimeCallbacks';

export class StaticGeoProvider implements IGeoProvider {
  getWorldGeoUrl(): string {
    return '/world.json';
  }
  getJapanTopoUrl(): string {
    return '/AreaForecastLocalE_GIS_20240520_1.json';
  }
  getIntensityPointsUrl(): string {
    return '/proxy?url=https://weather-kyoshin.west.edge.storage-yahoo.jp/SiteList/sitelist.json';
  }
}

export class CleanVectorMapRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map: any,
    worldUrl: string,
    japanTopoUrl: string,
    intensityPointsUrl: string,
    onHover: (info: HoverInfo | null) => void,
    onTopStationsUpdated?: (topStations: TopStationItem[]) => void,
    onKmoniEventDetected?: (center: [number, number]) => void,
    onDetectionAlert?: (alert: DetectionAlertInfo) => void,
    onDetectionFinished?: () => void
  ): Promise<MapRendererController> {
    const japanGeojson = await setupBaseAndEewLayers(map, worldUrl, japanTopoUrl, onHover);
    setupP2PAndKmaLayers(map, onHover);

    let currentDataSource: DataSourceType = 'kmoni';
    const kmoniQuakeService = new QuakeDetectService();
    const yahooQuakeService = new QuakeDetectService();

    try {
      await loadAndSetupStationLayers(
        map,
        intensityPointsUrl,
        kmoniQuakeService,
        yahooQuakeService,
        () => currentDataSource,
        onHover
      );

      let replayActive = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lastGridGeojson: any = null;

      const { fetchRealTime, cleanupStream } = connectRealtimeStream({
        map,
        kmoniQuakeService,
        yahooQuakeService,
        getCurrentSource: () => currentDataSource,
        isReplayActive: () => replayActive,
        setLastGridGeojson: (g) => { lastGridGeojson = g; },
        onTopStationsUpdated,
        onKmoniEventDetected,
        onDetectionAlert,
        onDetectionFinished,
      });

      return {
        setDataSource: (newSource: DataSourceType) => {
          if (currentDataSource === newSource) return;
          currentDataSource = newSource;
          applyDataSourceVisibility(
            map,
            newSource,
            kmoniQuakeService.geojson,
            yahooQuakeService.geojson,
            fetchRealTime
          );
        },
        getDataSource: () => currentDataSource,
        setP2PEvent: (event: P2PEarthquakeEvent | null, estimateFill = false) => {
          updateP2PEventOnMap(map, event, japanGeojson, currentDataSource, estimateFill);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setKMAEvent: (event: any | null) => {
          updateKMAEventOnMap(map, event);
        },
        setReplayMode: (on: boolean) => {
          replayActive = on;
          if (!on) {
            const activeGeojson = currentDataSource === 'kmoni' ? kmoniQuakeService.geojson : yahooQuakeService.geojson;
            const pts = map.getSource('intensity-points');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (pts && activeGeojson) (pts as any).setData(activeGeojson);
            const grid = map.getSource('detected-grids');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (grid) (grid as any).setData(lastGridGeojson ?? { type: 'FeatureCollection', features: [] });
          }
        },
        cleanup: () => {
          cleanupStream();
        },
      };
    } catch (err) {
      console.error('Failed to initialize stations:', err);
      return {
        setDataSource: () => {},
        getDataSource: () => currentDataSource,
        setP2PEvent: () => {},
        setKMAEvent: () => {},
        setReplayMode: () => {},
        cleanup: () => {
          BackgroundSyncService.getInstance().clearWorkerInterval('realtime-station-fetch');
        },
      };
    }
  }
}
