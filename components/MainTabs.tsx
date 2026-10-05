'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import McdaApp from '@/components/McdaApp';
import McdaHome from '@/components/McdaHome';
import SampleGallery from '@/components/SampleGallery';
import { subscribeToMainTab, type MainTab } from '@/lib/main-tab-navigation';

export default function MainTabs() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [analysisMounted, setAnalysisMounted] = useState(false);

  useEffect(() => subscribeToMainTab(window, (nextTab) => {
    setActiveTab(nextTab);
    if (nextTab === 'analysis') setAnalysisMounted(true);
  }), []);

  useEffect(() => {
    document.title = activeTab === 'analysis'
      ? 'MCDA Analysis'
      : activeTab === 'sample'
        ? 'Sample | MCDA Analysis'
        : 'หน้าหลัก | MCDA Analysis';
  }, [activeTab]);

  function selectTab(tab: MainTab) {
    if (tab === 'analysis') setAnalysisMounted(true);
    setActiveTab(tab);
    const hash = tab === 'analysis' ? '#analysis' : tab === 'sample' ? '#sample' : '#home';
    // Preserve Next.js's router state when changing only the fragment.
    window.history.replaceState(window.history.state, '', hash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={styles.tabBarShell}>
        <div style={styles.tabBar} role="tablist" aria-label="MCDA main navigation">
          <button
            id="main-tab-home"
            type="button"
            role="tab"
            aria-controls="home"
            aria-selected={activeTab === 'home'}
            onClick={() => selectTab('home')}
            style={{ ...styles.tabButton, ...(activeTab === 'home' ? styles.activeTab : {}) }}
          >
            หน้าหลัก
          </button>
          <button
            id="main-tab-analysis"
            type="button"
            role="tab"
            aria-controls="analysis"
            aria-selected={activeTab === 'analysis'}
            onClick={() => selectTab('analysis')}
            style={{ ...styles.tabButton, ...(activeTab === 'analysis' ? styles.activeTab : {}) }}
          >
            MCDA Analysis
          </button>
          <button
            id="main-tab-sample"
            type="button"
            role="tab"
            aria-controls="sample"
            aria-selected={activeTab === 'sample'}
            onClick={() => selectTab('sample')}
            style={{ ...styles.tabButton, ...(activeTab === 'sample' ? styles.activeTab : {}) }}
          >
            Sample
          </button>
        </div>
      </div>

      <section
        id="home"
        role="tabpanel"
        aria-label="หน้าหลัก"
        style={{ display: activeTab === 'home' ? 'block' : 'none' }}
      >
        <McdaHome onOpenAnalysis={() => selectTab('analysis')} />
      </section>

      {analysisMounted ? (
        <section
          id="analysis"
          role="tabpanel"
          aria-label="MCDA Analysis"
          style={{ display: activeTab === 'analysis' ? 'block' : 'none' }}
        >
          <McdaApp />
        </section>
      ) : null}

      <section
        id="sample"
        role="tabpanel"
        aria-label="Sample"
        style={{ display: activeTab === 'sample' ? 'block' : 'none' }}
      >
        <SampleGallery />
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  tabBarShell: {
    position: 'sticky',
    top: 0,
    zIndex: 9000,
    padding: '10px 14px 8px',
    background: 'linear-gradient(180deg, rgba(248,250,252,.98), rgba(248,250,252,.90))',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(148,163,184,.22)',
  },
  tabBar: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: 5,
    borderRadius: 12,
    border: '1px solid #d9e1ec',
    background: '#ffffff',
    boxShadow: '0 8px 24px rgba(15,23,42,.06)',
    fontFamily: 'Inter, "Noto Sans Thai", Arial, sans-serif',
  },
  tabButton: {
    border: 0,
    borderRadius: 9,
    background: 'transparent',
    color: '#526074',
    padding: '9px 15px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '.01em',
  },
  activeTab: {
    background: '#183b70',
    color: '#fff',
    boxShadow: '0 5px 14px rgba(24,59,112,.20)',
  },
};
