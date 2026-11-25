import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { TimezoneSync } from "@/components/timezone-sync";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-identity";
import { PALETTE } from "@/lib/palette";
import "./globals.css";

// The one font for the whole app (plans/crm.md, Design direction).
// Variable, with a width axis: narrower cuts for dense labels on the map.
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  // A page's own title gets the app name after it ("Log in · Network").
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Lets the page reach the screen edges and switches on the iPhone safe
  // areas (env(safe-area-inset-*)), which the layout pads for.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PALETTE.light.background },
    { media: "(prefers-color-scheme: dark)", color: PALETTE.dark.background },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TimezoneSync />
        {children}
      </body>
    </html>
  );
}
