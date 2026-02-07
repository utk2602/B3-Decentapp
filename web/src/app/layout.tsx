import type { Metadata } from "next";
import { EB_Garamond, Space_Mono, Cinzel } from "next/font/google";
import "./globals.css";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Key Foundation | The Sovereign Whisper",
  description: "Unstoppable, encrypted communication. Powered by Solana. Free forever.",
  icons: {
    icon: '/key.png',
    shortcut: '/key.png',
    apple: '/key.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${ebGaramond.variable} ${cinzel.variable} ${spaceMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
