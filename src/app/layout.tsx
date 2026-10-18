import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, EB_Garamond } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const marketDisplay = Bricolage_Grotesque({ variable: '--font-market-display', subsets: ['latin'], display: 'swap' });
const instrumentText = EB_Garamond({ variable: '--font-instrument', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: "GrocerySplit",
  description: "Split grocery receipts with your household, down to each item and its tax.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${marketDisplay.variable} ${instrumentText.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
