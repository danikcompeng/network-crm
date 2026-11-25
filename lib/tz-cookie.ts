// The cookie that carries your timezone to the server (set by
// components/timezone-sync.tsx, read by lib/server-helpers.ts).
// A plain module, so both the browser and the server get the real string:
// a constant imported from a "use client" file is only a reference on the server.
export const TZ_COOKIE = "tz";
