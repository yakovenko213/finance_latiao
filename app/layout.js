import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata = {
  title: 'Latiao Finance Enterprise',
  description: 'Internal System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body className={`${inter.className} bg-[#F8FAFC] text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
