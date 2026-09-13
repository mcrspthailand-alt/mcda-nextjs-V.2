import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Multi-Criteria Decision Analysis | Professional Ranking Dashboard',
  description:
    'MCDA dashboard for TOPSIS, SAW, PROMETHEE II, VIKOR, MOORA, WASPAS, EDAS, ELECTRE I, COPRAS, ARAS, GRA, WPM, Distance Target, comparative ranking and sensitivity analysis.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
