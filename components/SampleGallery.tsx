'use client';

import { useLanguage } from '@/components/LanguageProvider';
import styles from './SampleGallery.module.css';

type SampleVideo = {
  id: number;
  titleTh: string;
  titleEn: string;
  youtubeId?: string;
  startSeconds?: number;
};

const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: 1,
    titleTh: 'ตัวอย่างการใช้งาน MCDA',
    titleEn: 'MCDA Analysis Sample',
    youtubeId: 'pEq6mEfLHXc',
    startSeconds: 6,
  },
  ...Array.from({ length: 15 }, (_, index) => ({
    id: index + 2,
    titleTh: `ตัวอย่างที่ ${String(index + 2).padStart(2, '0')}`,
    titleEn: `Sample ${String(index + 2).padStart(2, '0')}`,
  })),
];

export default function SampleGallery() {
  const { language } = useLanguage();
  const english = language === 'en';

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>MCDA VIDEO SAMPLES</div>
          <h1>{english ? 'Sample' : 'ตัวอย่างการใช้งาน'}</h1>
          <p>
            {english
              ? 'A video library for worked examples, demonstrations, and practical MCDA workflows.'
              : 'คลังวิดีโอสำหรับตัวอย่างการคำนวณ การสาธิต และแนวทางการใช้งาน MCDA ในทางปฏิบัติ'}
          </p>
        </div>
        <div className={styles.counter}>
          <strong>16</strong>
          <span>{english ? 'video slots' : 'ช่องวิดีโอ'}</span>
        </div>
      </section>

      <section
        className={styles.grid}
        aria-label={english ? 'MCDA sample video gallery' : 'แกลเลอรีวิดีโอตัวอย่าง MCDA'}
      >
        {SAMPLE_VIDEOS.map((video) => {
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
                  <div className={styles.placeholder} aria-label={english ? 'Video coming soon' : 'เตรียมเพิ่มวิดีโอ'}>
                    <span className={styles.playIcon} aria-hidden="true">▶</span>
                    <strong>{english ? 'Coming soon' : 'เตรียมเพิ่มวิดีโอ'}</strong>
                    <small>{english ? 'Reserved video slot' : 'ช่องสำหรับวิดีโอถัดไป'}</small>
                  </div>
                )}
              </div>
              <div className={styles.cardMeta}>
                <span>{String(video.id).padStart(2, '0')}</span>
                <h2>{title}</h2>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
