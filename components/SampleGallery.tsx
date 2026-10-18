'use client';

import { useLanguage } from '@/components/LanguageProvider';
import styles from './SampleGallery.module.css';

type SampleVideo = {
  id: number;
  slot: number;
  titleTh: string;
  titleEn: string;
  youtubeId?: string;
  startSeconds?: number;
};

type SampleSection = {
  key: 'introduction' | 'theory' | 'sample';
  title: string;
  subtitleTh: string;
  subtitleEn: string;
  videos: SampleVideo[];
};

const SECTIONS: SampleSection[] = [
  {
    key: 'introduction',
    title: 'Introduction',
    subtitleTh: 'บทนำและภาพรวมการใช้งานระบบ MCDA',
    subtitleEn: 'An introduction to MCDA and the analysis workflow.',
    videos: [
      {
        id: 1,
        slot: 1,
        titleTh: 'ตัวอย่างการใช้งาน MCDA',
        titleEn: 'MCDA Analysis Sample',
        youtubeId: 'pEq6mEfLHXc',
        startSeconds: 6,
      },
      {
        id: 2,
        slot: 2,
        titleTh: 'ตัวอย่างการใช้งาน MCDA 02',
        titleEn: 'MCDA Analysis Sample 02',
        youtubeId: 'TcaE9SusHCA',
      },
      {
        id: 3,
        slot: 3,
        titleTh: 'Data Structure for MCDA',
        titleEn: 'Data Structure for MCDA',
        youtubeId: 'cO8I79khnUg',
      },
      {
        id: 4,
        slot: 4,
        titleTh: 'Introduction 04',
        titleEn: 'Introduction 04',
      },
    ],
  },
  {
    key: 'theory',
    title: 'Theory and MCDA techniques',
    subtitleTh: 'ทฤษฎี หลักการ และเทคนิคการวิเคราะห์การตัดสินใจหลายเกณฑ์',
    subtitleEn: 'Theory, principles, and major multi-criteria decision-analysis techniques.',
    videos: Array.from({ length: 8 }, (_, index) => ({
      id: index + 5,
      slot: index + 1,
      titleTh: `Theory and MCDA techniques ${String(index + 1).padStart(2, '0')}`,
      titleEn: `Theory and MCDA techniques ${String(index + 1).padStart(2, '0')}`,
    })),
  },
  {
    key: 'sample',
    title: 'Sample',
    subtitleTh: 'ตัวอย่างการประยุกต์ใช้ การคำนวณ และกรณีศึกษา',
    subtitleEn: 'Worked examples, applications, and case-based demonstrations.',
    videos: [
      {
        id: 13,
        slot: 1,
        titleTh: 'AHP via google form',
        titleEn: 'AHP via google form',
        youtubeId: 'qw44F1vpL5I',
        startSeconds: 13,
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: index + 14,
        slot: index + 2,
        titleTh: `Sample ${String(index + 2).padStart(2, '0')}`,
        titleEn: `Sample ${String(index + 2).padStart(2, '0')}`,
      })),
    ],
  },
];

const TOTAL_SLOTS = SECTIONS.reduce((total, section) => total + section.videos.length, 0);

export default function SampleGallery() {
  const { language } = useLanguage();
  const english = language === 'en';

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>MCDA VIDEO LEARNING</div>
          <h1>{english ? 'Sample' : 'ตัวอย่างและบทเรียน MCDA'}</h1>
          <p>
            {english
              ? 'A structured video library covering introduction, MCDA theory and techniques, and worked examples.'
              : 'คลังวิดีโอแบบเป็นหมวดหมู่ ครอบคลุมบทนำ ทฤษฎีและเทคนิค MCDA ตลอดจนตัวอย่างการประยุกต์ใช้งาน'}
          </p>
        </div>
        <div className={styles.counter}>
          <strong>{TOTAL_SLOTS}</strong>
          <span>{english ? 'video slots' : 'ช่องวิดีโอ'}</span>
        </div>
      </section>

      <div className={styles.sections}>
        {SECTIONS.map((section, sectionIndex) => (
          <section
            key={section.key}
            className={`${styles.section} ${styles[section.key]}`}
            aria-labelledby={`sample-section-${section.key}`}
          >
            <header className={styles.sectionHeader}>
              <div className={styles.sectionIndex}>{String(sectionIndex + 1).padStart(2, '0')}</div>
              <div>
                <h2 id={`sample-section-${section.key}`}>{section.title}</h2>
                <p>{english ? section.subtitleEn : section.subtitleTh}</p>
              </div>
              <div className={styles.sectionCount}>
                {section.videos.length} {english ? 'videos' : 'ช่อง'}
              </div>
            </header>

            <div className={styles.grid}>
              {section.videos.map((video) => {
                const title = english ? video.titleEn : video.titleTh;

                return (
                  <article key={video.id} className={styles.card}>
                    <div className={styles.videoFrame}>
                      {video.youtubeId ? (
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?start=${video.startSeconds ?? 0}&rel=0`}
                          title={title}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      ) : (
                        <div
                          className={styles.placeholder}
                          aria-label={english ? 'Video coming soon' : 'เตรียมเพิ่มวิดีโอ'}
                        >
                          <span className={styles.playIcon} aria-hidden="true">▶</span>
                          <strong>{english ? 'Coming soon' : 'เตรียมเพิ่มวิดีโอ'}</strong>
                          <small>{english ? 'Reserved video slot' : 'ช่องสำหรับวิดีโอถัดไป'}</small>
                        </div>
                      )}
                    </div>
                    <div className={styles.cardMeta}>
                      <span>{String(video.slot).padStart(2, '0')}</span>
                      <h3>{title}</h3>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
