function formatJstStamp(now: Date): { folder: string; file: string; timeStr: string } {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const yyyy = jst.getUTCFullYear();
  const MM = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const HH = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');

  const folder = `${yyyy}${MM}${dd}`;
  const file = `${folder}${HH}${mm}${ss}`;
  return {
    folder,
    file,
    timeStr: `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`,
  };
}

export function getKmoniShindoUrl(now: Date): { url: string; timeStr: string } {
  const { folder, file, timeStr } = formatJstStamp(now);
  return {
    url: `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/jma_s/${folder}/${file}.jma_s.gif`,
    timeStr,
  };
}

export function getLmoniUrl(now: Date): { url: string; timeStr: string } {
  const { folder, file, timeStr } = formatJstStamp(now);
  return {
    url: `https://www.lmoni.bosai.go.jp/monitor/data/data/map_img/RealTimeImg/abrspmx_s/${folder}/${file}.abrspmx_s.gif`,
    timeStr,
  };
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchKmoniGifWithDelay(
  baseDelay: number
): Promise<{ buffer: Buffer; timeStr: string; delay: number } | null> {
  const candidates = [baseDelay, baseDelay + 1000, baseDelay - 1000, 2000, 3000, 4000, 1000, 5000];
  const delays = Array.from(new Set(candidates)).filter((d) => d >= 1000 && d <= 6000);

  for (const delay of delays) {
    const { url, timeStr } = getKmoniShindoUrl(new Date(Date.now() - delay));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_UA,
          Referer: 'http://www.kmoni.bosai.go.jp/',
        },
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        return { buffer, timeStr, delay };
      }
    } catch {}
  }
  return null;
}

export async function fetchLmoniGifWithDelay(
  baseDelay: number
): Promise<{ buffer: Buffer; timeStr: string; delay: number } | null> {
  const candidates = [baseDelay, baseDelay + 1000, baseDelay - 1000, 2000, 3000, 4000, 1000, 5000];
  const delays = Array.from(new Set(candidates)).filter((d) => d >= 1000 && d <= 6000);

  for (const delay of delays) {
    const { url, timeStr } = getLmoniUrl(new Date(Date.now() - delay));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_UA,
          Referer: 'https://www.lmoni.bosai.go.jp/monitor/',
        },
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        return { buffer, timeStr, delay };
      }
    } catch {}
  }
  return null;
}

export async function fetchYahooIntensitiesWithDelay(
  baseDelay: number
): Promise<{ intensities: Record<string, number | null>; dataTime: string; delay: number } | null> {
  const candidates = [baseDelay, baseDelay + 1000, baseDelay - 1000, 1000, 2000, 3000, 4000];
  const delays = Array.from(new Set(candidates)).filter((d) => d >= 1000 && d <= 5000);

  for (const delay of delays) {
    const { folder, file, timeStr } = formatJstStamp(new Date(Date.now() - delay));
    const yahooUrl = `https://weather-kyoshin.west.edge.storage-yahoo.jp/RealTimeData/${folder}/${file}.json`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      const resp = await fetch(yahooUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': DEFAULT_UA },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        const intensityStr = data?.realTimeData?.intensity;
        if (intensityStr) {
          const intensities: Record<string, number | null> = {};
          for (let i = 0; i < intensityStr.length; i++) {
            const charCode = intensityStr.charCodeAt(i);
            intensities[i.toString()] = charCode > 0 ? (charCode - 100) * 0.5 - 3.0 : null;
          }
          return { intensities, dataTime: timeStr, delay };
        }
      }
    } catch {}
  }
  return null;
}
