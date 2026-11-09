import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/ConfirmDialog";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "GrocerySplit",
  description: "Split grocery receipts with your household, down to each item and its tax.",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "GrocerySplit", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f3f5f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
