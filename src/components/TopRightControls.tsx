import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../types';
import styles from '../App.module.css';
import { Volume2, VolumeX, LocateFixed, Sun, Moon, Eye, EyeOff, PaintBucket } from 'lucide-react';
import { audioService } from '../AudioService';

interface TopRightControlsProps {
  dataSource: DataSourceType;
  handleToggleDataSource: (s: DataSourceType) => void;
  handleResetCamera: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  showStations: boolean;
  onToggleStations: () => void;
  estimateFill: boolean;
  onToggleEstimateFill: () => void;
  // 아카이브 이벤트 등 추정 채우기가 의미 있는 컨텍스트에서만 툴팁 버튼 노출
  showEstimateControl: boolean;
}

export const TopRightControls: React.FC<TopRightControlsProps> = ({
  dataSource,
  handleToggleDataSource,
  handleResetCamera,
  isDarkMode,
  setIsDarkMode,
  showStations,
  onToggleStations,
  estimateFill,
  onToggleEstimateFill,
  showEstimateControl,
}) => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: 'ko' | 'en' | 'ja') => {
    i18n.changeLanguage(lng);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app_language', lng);
    }
  };

  const currentLng = i18n.language.startsWith('ja')
    ? 'ja'
    : i18n.language.startsWith('en')
    ? 'en'
    : 'ko';

  const [isMuted, setIsMuted] = useState(audioService.isMuted);

  useEffect(() => {
    setIsMuted(audioService.isMuted);
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    audioService.setMuted(next);
    setIsMuted(next);
    if (!next) {
       audioService.playUpdateBeep(1.0);
    }
  };

  return (
    <div className={styles.topRightControls}>
      {/* 데이터 소스 선택 */}
      <div className={styles.sourceToggleGroup}>
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'kmoni' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('kmoni')}
          title={t('sources.niedDesc')}
        >
          <span className={styles.sourceDot} />
          {t('sources.nied')}
        </button>
        {/* [미사용] Yahoo! 지진 데이터 소스 비활성화
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'yahoo' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('yahoo')}
          title={t('sources.yahooDesc')}
        >
          <span className={styles.sourceDotYahoo} />
          {t('sources.yahoo')}
        </button>
        */}
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'p2pquake' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('p2pquake')}
          title={t('sources.p2pDesc')}
        >
          <span className={styles.sourceDotP2P} />
          {t('sources.p2p')}
        </button>
      </div>

      {/* 언어 선택기 */}
      <div className={styles.langToggleGroup}>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'ko' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('ko')}
          title="한국어"
        >
          KO
        </button>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'en' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('en')}
          title="English"
        >
          EN
        </button>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'ja' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('ja')}
          title="日本語"
        >
          JA
        </button>
      </div>

      {/* 도구 모음 */}
      <div className={styles.iconControlsGroup}>
        <button type="button" className={styles.iconBtn} onClick={toggleMute} data-tip={isMuted ? t('controls.soundOn') : t('controls.soundOff')} aria-label={isMuted ? t('controls.soundOn') : t('controls.soundOff')}>
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onToggleStations}
          data-tip={showStations ? t('controls.hideP2pPoints') : t('controls.showP2pPoints')}
          aria-label={showStations ? t('controls.hideP2pPoints') : t('controls.showP2pPoints')}
          style={{ opacity: showStations ? 1 : 0.45 }}
        >
          {showStations ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        {showEstimateControl && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onToggleEstimateFill}
            data-tip={t('controls.estimateFill')}
            aria-label={t('controls.estimateFill')}
            style={{ opacity: estimateFill ? 1 : 0.45 }}
          >
            <PaintBucket size={16} />
          </button>
        )}
        <button type="button" className={styles.iconBtn} onClick={handleResetCamera} data-tip={t('controls.resetCamera')} aria-label={t('controls.resetCamera')}>
          <LocateFixed size={16} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => setIsDarkMode(!isDarkMode)} data-tip={isDarkMode ? t('controls.lightMode') : t('controls.darkMode')} aria-label={isDarkMode ? t('controls.lightMode') : t('controls.darkMode')}>
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};
