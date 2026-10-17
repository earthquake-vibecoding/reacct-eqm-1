import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search } from 'lucide-react';
import {
  JmaHistoryItem,
  searchJmaHistory,
  fetchJmaHistoryEvent,
} from '../JmaHistoryService';
import { formatScaleJMA } from '../P2PQuakeService';
import { getScaleTextColor } from '../utils';
import styles from '../App.module.css';

interface JmaHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (event: import('../P2PQuakeService').P2PEarthquakeEvent) => void;
}

// JMA 관측진도 코드: 1~4 숫자, A=5약, B=5강, C=6약, D=6강, 7=7
const MIN_INT_OPTIONS: { code: string; ko: string; en: string; ja: string }[] = [
  { code: '7', ko: '진도 7', en: '7', ja: '震度7' },
  { code: 'D', ko: '6강', en: '6+', ja: '6強' },
  { code: 'C', ko: '6약', en: '6-', ja: '6弱' },
  { code: 'B', ko: '5강', en: '5+', ja: '5強' },
  { code: 'A', ko: '5약', en: '5-', ja: '5弱' },
  { code: '4', ko: '4', en: '4', ja: '4' },
  { code: '3', ko: '3', en: '3', ja: '3' },
  { code: '2', ko: '2', en: '2', ja: '2' },
  { code: '1', ko: '1', en: '1', ja: '1' },
];

// 주요 큰 지진 프리셋 (JMA 진도 DB 검색 기간 + 최소진도)
const PRESETS: { key: string; from: string; to: string; minInt: string }[] = [
  { key: 'preset1923Kanto', from: '1923-09-01', to: '1923-09-01', minInt: 'C' },
  { key: 'preset1933Sanriku', from: '1933-03-03', to: '1933-03-03', minInt: 'C' },
  { key: 'preset1995Kobe', from: '1995-01-17', to: '1995-01-17', minInt: 'C' },
  { key: 'preset2011Tohoku', from: '2011-03-11', to: '2011-03-12', minInt: 'B' },
  { key: 'preset2016Kumamoto', from: '2016-04-14', to: '2016-04-16', minInt: 'B' },
  { key: 'preset2018Iburi', from: '2018-09-06', to: '2018-09-06', minInt: 'C' },
  { key: 'preset2024Noto', from: '2024-01-01', to: '2024-01-01', minInt: 'C' },
  { key: 'preset2024Hyuga', from: '2024-08-08', to: '2024-08-08', minInt: 'C' },
  { key: 'preset2026Kumamoto', from: '2026-07-28', to: '2026-07-28', minInt: 'B' },
];

const MAX_RESULTS = 200;

// NOAA 관측 최대 월고(m) -> JMA 쓰나미 경보 등급 색 (JMA 예상높이 기준표 차용)
function tsunamiGrade(height: number): { color: string; width: number; key: string } {
  if (height > 3) return { color: '#6b21a8', width: 6, key: 'gradeMajorWarning' };
  if (height > 1) return { color: '#dc2626', width: 4, key: 'gradeWarning' };
  if (height >= 0.2) return { color: '#eab308', width: 4, key: 'gradeAdvisory' };
  return { color: '#38bdf8', width: 3, key: 'gradeForecast' };
}

export const JmaHistoryPanel: React.FC<JmaHistoryPanelProps> = ({ open, onClose, onSelect }) => {
  const { t, i18n } = useTranslation();
  const lng = i18n.language.startsWith('ja') ? 'ja' : i18n.language.startsWith('en') ? 'en' : 'ko';
  const [from, setFrom] = useState('2011-03-11');
  const [to, setTo] = useState('2011-03-12');
  const [minInt, setMinInt] = useState('A');
  const [items, setItems] = useState<JmaHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  const runSearch = async (f: string, tt: string, mi: string) => {
    setFrom(f);
    setTo(tt);
    setMinInt(mi);
    setLoading(true);
    setError('');
    try {
      const list = await searchJmaHistory(f, tt, mi);
      setItems(list);
      if (list.length === 0) setError(t('jmaArchive.empty'));
    } catch {
      setError(t('jmaArchive.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item: JmaHistoryItem) => {
    setLoadingId(item.id);
    setError('');
    try {
      const ev = await fetchJmaHistoryEvent(item.id);
      onSelect(ev);
      onClose();
    } catch {
      setError(t('jmaArchive.detailFailed'));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className={styles.jmaHistoryOverlay} onClick={onClose}>
      <div className={styles.jmaHistoryPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.jmaHistoryHeader}>
          <span>{t('jmaArchive.title')}</span>
          <button type="button" className={styles.jmaHistoryCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.jmaHistoryPresets}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={styles.jmaHistoryPresetChip}
              onClick={() => runSearch(p.from, p.to, p.minInt)}
              disabled={loading}
            >
              {t(`jmaArchive.${p.key}`)}
            </button>
          ))}
        </div>

        <div className={styles.jmaHistoryForm}>
          <input
            type="date"
            className={styles.jmaHistoryDateInput}
            value={from}
            min="1919-01-01"
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className={styles.jmaHistoryTilde}>~</span>
          <input
            type="date"
            className={styles.jmaHistoryDateInput}
            value={to}
            min={from}
            max="2026-12-31"
            onChange={(e) => setTo(e.target.value)}
          />
          <select
            className={styles.jmaHistorySelect}
            value={minInt}
            onChange={(e) => setMinInt(e.target.value)}
          >
            {MIN_INT_OPTIONS.map((o) => {
              const label = o[lng];
              return (
                <option key={o.code} value={o.code}>{t('jmaArchive.minIntAbove', { scale: label })}</option>
              );
            })}
          </select>
          <button
            type="button"
            className={styles.jmaHistorySearchBtn}
            onClick={() => runSearch(from, to, minInt)}
            disabled={loading}
          >
            <Search size={14} />
          </button>
        </div>

        {error && <div className={styles.jmaHistoryError}>{error}</div>}

        <div className={styles.jmaHistoryList}>
          {loading && <div className={styles.jmaHistoryEmpty}>{t('jmaArchive.searching')}</div>}
          {!loading && items && items.length === 0 && (
            <div className={styles.jmaHistoryEmpty}>{t('jmaArchive.noResults')}</div>
          )}
          {!loading && items && items.slice(0, MAX_RESULTS).map((it) => {
            const si = formatScaleJMA(it.maxScale);
            const grade = it.tsunami?.hasTsunami ? tsunamiGrade(Number(it.tsunami.maxWaterHeight)) : null;
            return (
              <button
                key={it.id}
                type="button"
                className={styles.jmaHistoryItem}
                onClick={() => handleSelect(it)}
                disabled={loadingId !== null}
              >
                <span
                  className={styles.jmaHistoryItemScale}
                  style={{ backgroundColor: si.color, color: getScaleTextColor(si.color) }}
                >
                  {si.text}
                </span>
                <span className={styles.jmaHistoryItemTime}>{it.time.substring(0, 16)}</span>
                <span className={styles.jmaHistoryItemName}>{it.name}</span>
                <span className={styles.jmaHistoryItemMag}>
                  {it.magnitude > 0 ? `M${it.magnitude.toFixed(1)}` : ''}
                </span>
                {grade && (
                  <span
                    className={styles.jmaHistoryItemTsunami}
                    style={{ backgroundColor: grade.color, width: grade.width }}
                    title={t('jmaArchive.tsunamiBarTooltip', {
                      grade: t(`jmaArchive.${grade.key}`),
                      height: it.tsunami?.maxWaterHeight ?? 0,
                    })}
                  />
                )}
                {loadingId === it.id && <span className={styles.jmaHistoryItemLoading}>…</span>}
              </button>
            );
          })}
          {!loading && items && items.length > MAX_RESULTS && (
            <div className={styles.jmaHistoryEmpty}>
              {t('jmaArchive.truncated', { total: items.length, shown: MAX_RESULTS })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
