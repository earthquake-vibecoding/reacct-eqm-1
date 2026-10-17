import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../types';
import { SystemStatusCard } from './SystemStatusCard';
import styles from '../App.module.css';
import { Info } from 'lucide-react';

interface LegendProps {
  dataSource: DataSourceType;
}

export const Legend: React.FC<LegendProps> = ({ dataSource }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [isExpanded, setIsExpanded] = useState(false);

  const getScaleLabel = (scaleKey: string): string => {
    if (lang.startsWith('en')) {
      if (scaleKey === '6강') return '6+';
      if (scaleKey === '6약') return '6-';
      if (scaleKey === '5강') return '5+';
      if (scaleKey === '5약') return '5-';
    } else if (lang.startsWith('ja') || lang.startsWith('jp')) {
      if (scaleKey === '6강') return '6強';
      if (scaleKey === '6약') return '6弱';
      if (scaleKey === '5강') return '5強';
      if (scaleKey === '5약') return '5弱';
    }
    return scaleKey;
  };

  return (
    <div 
      className={styles.legendWrapper}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <button
        type="button"
        className={styles.legendToggleBtn}
        aria-label={t('legend.title') || "Legend"}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Info size={18} />
      </button>
      
      {isExpanded && (
        <div className={styles.legendContent}>
          {dataSource === 'p2pquake' ? (
            <>
              <div className={styles.legendTitle}>{t('legend.jmaScale')}</div>
              <div className={styles.legendScaleGrid}>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#B40068' }}>7</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#A50021' }}>{getScaleLabel('6강')}</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#FF2800' }}>{getScaleLabel('6약')}</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#FF9900', color: '#000' }}>{getScaleLabel('5강')}</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#FFE600', color: '#000' }}>{getScaleLabel('5약')}</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#FAE696', color: '#000' }}>4</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#0041FF' }}>3</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#00AAFF', color: '#000' }}>2</span>
                <span className={styles.scaleBadgeLegend} style={{ backgroundColor: '#F2F2FF', color: '#000' }}>1</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorEpicenter}>✕</span> {t('legend.epicenter')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorPointP2P} /> {t('legend.obsPoint')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorEstimated} /> {t('legend.estimatedFill')}
              </div>
            </>
          ) : (
            <>
              <div className={styles.legendItem}>
                <span className={styles.colorPWave} /> {t('legend.pWave')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorSWave} /> {t('legend.sWave')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorEpicenter}>✕</span> {t('legend.hypocenterAlt')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.colorPoint} /> {t('legend.realtimeStation')} ({dataSource === 'kmoni' ? t('legend.niedGif') : t('legend.yahooJson')})
              </div>
            </>
          )}
          <div className={styles.legendItem}>
            <span className={styles.colorJapan} /> {t('legend.japanIslands')}
          </div>

          {dataSource !== 'p2pquake' && (
            <div className={styles.legendItem}>
              <span className={styles.colorLpPoint} /> {t('legend.lpPoint')}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <SystemStatusCard defaultExpanded={false} />
          </div>
        </div>
      )}
    </div>
  );
};
