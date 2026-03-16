import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsent";
import { Footer7 } from "@/components/ui/footer";
import { SimpleHeader } from "@/components/ui/simple-header";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'Mon Site',
    template: '%s | Mon Site',
  },
  description: "Description par défaut si une page n'en a pas.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${urbanist.variable} antialiased`}>
      <body className="relative"
        
      >
        <SimpleHeader />
        {children}
        <CookieConsentBanner />
        <Footer7 />
      </body>
    </html>
  );
}
