import React, { useState } from 'react';
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
const MIN_INT_OPTIONS: { code: string; label: string }[] = [
  { code: '7', label: '진도 7' },
  { code: 'D', label: '6강' },
  { code: 'C', label: '6약' },
  { code: 'B', label: '5강' },
  { code: 'A', label: '5약' },
  { code: '4', label: '4' },
  { code: '3', label: '3' },
  { code: '2', label: '2' },
  { code: '1', label: '1' },
];

const MAX_RESULTS = 200;

export const JmaHistoryPanel: React.FC<JmaHistoryPanelProps> = ({ open, onClose, onSelect }) => {
  const [from, setFrom] = useState('2011-03-11');
  const [to, setTo] = useState('2011-03-12');
  const [minInt, setMinInt] = useState('A');
  const [items, setItems] = useState<JmaHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSearch = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const list = await searchJmaHistory(from, to, minInt);
      setItems(list);
      if (list.length === 0) setError('해당 기간·진도 조건의 지진이 없습니다.');
    } catch {
      setError('조회 실패. 잠시 후 다시 시도하세요.');
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
      setError('상세 정보 조회 실패.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className={styles.jmaHistoryOverlay} onClick={onClose}>
      <div className={styles.jmaHistoryPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.jmaHistoryHeader}>
          <span>JMA 진도 DB 아카이브 (1919년~)</span>
          <button type="button" className={styles.jmaHistoryCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
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
            {MIN_INT_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.label} 이상</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.jmaHistorySearchBtn}
            onClick={handleSearch}
            disabled={loading}
          >
            <Search size={14} />
          </button>
        </div>

        {error && <div className={styles.jmaHistoryError}>{error}</div>}

        <div className={styles.jmaHistoryList}>
          {loading && <div className={styles.jmaHistoryEmpty}>검색 중…</div>}
          {!loading && items && items.length === 0 && (
            <div className={styles.jmaHistoryEmpty}>결과 없음</div>
          )}
          {!loading && items && items.slice(0, MAX_RESULTS).map((it) => {
            const si = formatScaleJMA(it.maxScale);
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
                {loadingId === it.id && <span className={styles.jmaHistoryItemLoading}>…</span>}
              </button>
            );
          })}
          {!loading && items && items.length > MAX_RESULTS && (
            <div className={styles.jmaHistoryEmpty}>
              총 {items.length}건 중 {MAX_RESULTS}건만 표시. 기간을 좁혀보세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
