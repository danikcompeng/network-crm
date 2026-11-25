import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { TimezoneSync } from "@/components/timezone-sync";
import { APP_DESCRIPTION, APP_NAME, iconByFile, iconUrl } from "@/lib/app-identity";
import { PALETTE } from "@/lib/palette";
import "./globals.css";

// The one font for the whole app (plans/crm.md, Design direction).
// Variable, with a width axis: narrower cuts for dense labels on the map.
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

const tabIcon = iconByFile("icon-192.png")!;
const iPhoneIcon = iconByFile("apple-touch-icon.png")!;

export const metadata: Metadata = {
  // A page's own title gets the app name after it ("Log in · Network").
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  icons: {
    icon: { url: iconUrl(tabIcon), type: "image/png", sizes: "192x192" },
    apple: { url: iconUrl(iPhoneIcon), sizes: "180x180" },
  },
  // What iPhone uses for Share → Add to Home Screen. The title stops it
  // suggesting a page title like "Log in · Network". A solid ("default")
  // status bar: the page starts below the clock and the Dynamic Island.
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
