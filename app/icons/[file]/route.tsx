// Serves the icon PNGs listed in lib/app-identity.ts (APP_ICONS):
// /icons/icon-192.png, icon-512.png, icon-maskable-512.png and
// apple-touch-icon.png. Any other name is a 404, returned here: exporting
// dynamicParams would fail the build under Cache Components.
//
// generateStaticParams draws each one once, at build time.
// No login needed: proxy.ts skips /icons/, because phones fetch icons
// without your login cookie.
import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/app-icon";
import { APP_ICONS, iconByFile } from "@/lib/app-identity";

export function generateStaticParams() {
  return APP_ICONS.map((icon) => ({ file: icon.file }));
}

export async function GET(_request: Request, { params }: RouteContext<"/icons/[file]">) {
  const icon = iconByFile((await params).file);
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIcon size={icon.size} shape={icon.shape} />, {
    width: icon.size,
    height: icon.size,
  });
}
