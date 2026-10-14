import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import Link from "next/link";
import { themeCss } from "@/lib/theme-css";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-manrope" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader" });

// Only the glyphs the pages use; names must stay alphabetical for Google Fonts.
const ICONS_URL =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0..1,0&icon_names=grain,scale,thermostat&display=block";

export const metadata: Metadata = {
  title: { default: "PropperBrew — UK specialty coffee, rated & dialled in", template: "%s · PropperBrew" },
  description: "Reviews, brew recipes and one-basket checkout for the UK's independent coffee roasters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${manrope.variable} ${newsreader.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <link rel="stylesheet" href={ICONS_URL} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="logo">
              PropperBrew
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
