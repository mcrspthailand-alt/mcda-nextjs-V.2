import type { Metadata } from 'next';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCDA Analysis',
  description:
    'MCDA Analysis platform with a brief history of multi-criteria decision analysis and an interactive dashboard for ranking, sensitivity analysis and multiple MCDA methods.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}<AnalyticsTracker /></body>
    </html>
  );
}
