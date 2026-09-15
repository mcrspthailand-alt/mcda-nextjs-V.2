'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import McdaApp from '@/components/McdaApp';
import McdaHome from '@/components/McdaHome';

type MainTab = 'home' | 'analysis';

function tabFromHash(): MainTab {
  if (typeof window === 'undefined') return 'home';
  return window.location.hash === '#analysis' ? 'analysis' : 'home';
}

export default function MainTabs() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [analysisMounted, setAnalysisMounted] = useState(false);

  useEffect(() => {
    const syncFromHash = () => {
      const nextTab = tabFromHash();
      setActiveTab(nextTab);
      if (nextTab === 'analysis') setAnalysisMounted(true);
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    document.title = activeTab === 'analysis' ? 'MCDA Analysis' : 'หน้าหลัก | MCDA Analysis';
  }, [activeTab]);

  function selectTab(tab: MainTab) {
    if (tab === 'analysis') setAnalysisMounted(true);
    setActiveTab(tab);
    const hash = tab === 'analysis' ? '#analysis' : '#home';
    window.history.replaceState(null, '', hash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={styles.tabBarShell}>
        <div style={styles.tabBar} role="tablist" aria-label="MCDA main navigation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'home'}
            onClick={() => selectTab('home')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'home' ? styles.activeTab : {}),
            }}
          >
            หน้าหลัก
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analysis'}
            onClick={() => selectTab('analysis')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'analysis' ? styles.activeTab : {}),
            }}
          >
            MCDA Analysis
          </button>
        </div>
      </div>

      <section
        role="tabpanel"
        aria-label="หน้าหลัก"
        style={{ display: activeTab === 'home' ? 'block' : 'none' }}
      >
        <McdaHome onOpenAnalysis={() => selectTab('analysis')} />
      </section>

      {analysisMounted ? (
        <section
          role="tabpanel"
          aria-label="MCDA Analysis"
          style={{ display: activeTab === 'analysis' ? 'block' : 'none' }}
        >
          <McdaApp />
        </section>
      ) : null}
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
