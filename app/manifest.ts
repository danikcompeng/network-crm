// The web app manifest (/manifest.webmanifest): what Android, and iPhone
// partly, read when the app is added to the home screen. Built in
// lib/app-identity.ts, where it's tested.
import type { MetadataRoute } from "next";
import { appManifest } from "@/lib/app-identity";

export default function manifest(): MetadataRoute.Manifest {
  return appManifest();
}
