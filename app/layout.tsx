import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TailorCV — Evidence-led resume tailoring',
  description:
    'Create truthful, ATS-friendly resumes tailored to each role, with every AI suggestion linked to source evidence.',
  openGraph: {
    title: 'TailorCV — Evidence-led resume tailoring',
    description: 'Create truthful, ATS-friendly resumes tailored to each role.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TailorCV — Evidence-led resume tailoring',
    description: 'Create truthful, ATS-friendly resumes tailored to each role.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
