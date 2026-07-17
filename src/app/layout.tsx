import type { Metadata } from "next";
import { Be_Vietnam_Pro, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Font UI chính — hỗ trợ tiếng Việt, hiện đại, tối giản
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Font số — dùng cho điểm số lớn, đồng hồ, mã kỹ thuật
const barlowCondensed = Barlow_Condensed({
  variable: "--font-score",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Taekwondo Scoring",
    template: "%s | Taekwondo Scoring",
  },
  description: "Taekwondo scoreboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Judge",
  },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${beVietnamPro.variable} ${barlowCondensed.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}