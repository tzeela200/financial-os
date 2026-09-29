import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./tokens.css";
import "./globals.css";

// Heebo is the only typeface (chapter 20 §23); Hebrew + Latin for mixed-direction data.
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "מערכת פיננסית",
  description: "מערכת פיננסית אישית",
};

// RTL native from the root (23A §71): lang="he" dir="rtl".
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
