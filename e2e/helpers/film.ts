// Records what the page shows, frame by frame, and turns it into video
// (adapted from Bitewise's e2e/helpers/film.ts).
//
// Bitewise takes screenshots back to back, which manages about 20 a second:
// fine for a list, but the 3D map turning at 20 a second judders. So this
// uses Chrome's screencast instead: the browser hands over every frame it
// draws (60 a second on this laptop's GPU), each stamped with the moment
// it was drawn, as a JPEG at quality 92. ffmpeg (a free video tool) then
// lays them on a steady 30 fps clock and writes an H.264 .mp4, the format
// every browser and phone plays.
//
// The screencast sends a frame only when something changed, so each frame
// stays on screen until the next one: a still screen costs nothing.
//
// The catch: under Playwright's device emulation the screencast comes out
// at CSS size (393 px wide). record-demo.ts gets real 2x frames by
// launching Chrome with a 393 x 852 window at a device scale of 2 instead
// (no emulated viewport); see e2e/record.config.ts.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CDPSession, Page } from "@playwright/test";

type Frame = { file: string; t: number };

/** The output's frame rate. */
export const FPS = 30;

/**
 * Where ffmpeg is: $FFMPEG_PATH, then `ffmpeg` on the PATH, then the
 * ffmpeg-static npm package if it's installed (npm install --no-save
 * ffmpeg-static: not in package.json, as its download can break a
 * Vercel build). null if none works.
 */
export async function findFfmpeg(): Promise<string | null> {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"];
  try {
    // A variable, so TypeScript doesn't insist the package is installed.
    const optional = "ffmpeg-static";
    const mod = (await import(optional)) as { default?: string };
    candidates.push(mod.default);
  } catch {
    // Not installed: fine.
  }
  for (const bin of candidates) {
    if (bin && spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0) return bin;
  }
  return null;
}

/** Runs ffmpeg, throwing its error text if it fails. */
export function ffmpegRun(ffmpeg: string, args: string[], cwd?: string) {
  const result = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${args.at(-1)}):\n${result.stderr}`);
}

/** H.264 that plays everywhere: constant quality, no audio, starts playing before it's fully downloaded. */
const H264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-tune", "animation", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];

export class Film {
  private readonly frames: Frame[] = [];
  private readonly marks = new Map<string, number>();
  private readonly startedAt = Date.now();
  /** Arrival time minus the frame's own stamp, per frame: their median lines the stamps up with Date.now(). */
  private readonly offsets: number[] = [];

  private constructor(
    private readonly cdp: CDPSession,
    private readonly dir: string,
  ) {}

  /** Starts recording `page`. Frames go into `dir` (emptied first). */
  static async roll(page: Page, dir: string) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const film = new Film(await page.context().newCDPSession(page), dir);
    film.cdp.on("Page.screencastFrame", (frame) => {
      const arrived = Date.now();
      // Ask for the next frame first: the browser waits for this.
      film.cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      const stamp = frame.metadata.timestamp ? frame.metadata.timestamp * 1000 : arrived;
      film.offsets.push(arrived - stamp);
      const file = path.join(dir, `f${String(film.frames.length).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
      film.frames.push({ file, t: stamp });
    });
    await film.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    return film;
  }

  /** Remembers "now" under a name, to cut the video there later. */
  mark(name: string) {
    this.marks.set(name, Date.now());
  }

  /** The time saved under `name`, in ms since the recording started. */
  at(name: string): number {
    const t = this.marks.get(name);
    if (t === undefined) throw new Error(`Film: no mark called "${name}"`);
    return t - this.startedAt;
  }

  /** Stops recording; the mark "end" is now. */
  async stop() {
    this.mark("end");
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await this.cdp.detach().catch(() => {});
    // Line the frames' stamps up with Date.now() (the marks' clock).
    const sorted = [...this.offsets].sort((a, b) => a - b);
    const shift = sorted[sorted.length >> 1] ?? 0;
    for (const f of this.frames) f.t += shift;
  }

  /** The frame times and marks (ms since the start), saved next to the frames, to study the pacing. */
  saveTimeline() {
    const marks = Object.fromEntries([...this.marks].map(([k, v]) => [k, v - this.startedAt]));
    const frames = this.frames.map((f) => Math.round(f.t - this.startedAt));
    fs.writeFileSync(path.join(this.dir, "timeline.json"), JSON.stringify({ marks, frames }));
    return marks;
  }

  /** How steady the capture was: frames, and the share of gaps over 40 ms while the screen kept changing. */
  report(from: number, to: number) {
    const start = this.startedAt + from;
    const end = this.startedAt + to;
    const inside = this.frames.filter((f) => f.t >= start && f.t < end);
    const gaps = inside.slice(1).map((f, i) => f.t - inside[i].t);
    return { frames: inside.length, perSecond: inside.length / ((to - from) / 1000), over40ms: gaps.filter((g) => g > 40).length };
  }

  /**
   * Writes an ffmpeg "concat" list: each frame and how long it stayed on
   * screen, from `from` to `to` (ms since the start). The frame that was
   * showing at `from` opens the clip, so a quiet stretch isn't skipped.
   */
  private frameList(name: string, from: number, to: number): { list: string; seconds: number } {
    if (this.frames.length === 0) throw new Error("Film: no frames captured");
    const start = this.startedAt + from;
    const end = this.startedAt + to;
    let first = this.frames.findIndex((f) => f.t > start) - 1;
    if (first < 0) first = first === -2 ? this.frames.length - 1 : 0;
    const lines = ["ffconcat version 1.0"];
    let total = 0;
    let lastFile = "";
    for (let i = first; i < this.frames.length && this.frames[i].t < end; i++) {
      const shownFrom = Math.max(this.frames[i].t, start);
      const shownTo = Math.min(this.frames[i + 1]?.t ?? end, end);
      const seconds = (shownTo - shownFrom) / 1000;
      if (seconds <= 0) continue;
      lastFile = `file '${path.basename(this.frames[i].file)}'`;
      lines.push(lastFile, `duration ${seconds.toFixed(4)}`);
      total += seconds;
    }
    // ffmpeg ignores the last entry's duration unless the file is listed once more.
    if (lastFile) lines.push(lastFile);
    const list = path.join(this.dir, `${name}.txt`);
    fs.writeFileSync(list, lines.join("\n") + "\n");
    return { list, seconds: total };
  }

  /** A clip on a steady 30 fps clock, as ffmpeg input + filter. */
  private clipInput(name: string, from: number, to: number, index: number) {
    const { list, seconds } = this.frameList(name, from, to);
    return {
      args: ["-f", "concat", "-safe", "0", "-i", list],
      filter: `[${index}:v]fps=${FPS},settb=AVTB,setpts=PTS-STARTPTS[c${index}]`,
      seconds,
    };
  }

  /** The stretch `from` → `to` as an .mp4, fading in from `fade` (a colour) and out to it. */
  encode(ffmpeg: string, out: string, from: number, to: number, fade: string) {
    const clip = this.clipInput("tour", from, to, 0);
    const outAt = Math.max(0, clip.seconds - 0.4).toFixed(3);
    const filter = `${clip.filter};[c0]fade=t=in:d=0.4:color=${fade},fade=t=out:st=${outAt}:d=0.4:color=${fade},format=yuv420p[v]`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    ffmpegRun(ffmpeg, [...clip.args, "-filter_complex", filter, "-map", "[v]", ...H264, out], this.dir);
    return { seconds: clip.seconds };
  }

  /**
   * The stretch `from` → `to` as a seamless loop: its last `crossfade` ms
   * melt into its first ones, so the last frame is the first frame again.
   * The loop is `crossfade` shorter than the stretch.
   */
  encodeLoop(ffmpeg: string, out: string, from: number, to: number, crossfade = 600) {
    const body = this.clipInput("loop-body", from + crossfade, to, 0);
    const head = this.clipInput("loop-head", from, from + crossfade, 1);
    const seconds = crossfade / 1000;
    const offset = (body.seconds - seconds).toFixed(3);
    const filter = `${body.filter};${head.filter};[c0][c1]xfade=transition=fade:duration=${seconds}:offset=${offset},format=yuv420p[v]`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    ffmpegRun(ffmpeg, [...body.args, ...head.args, "-filter_complex", filter, "-map", "[v]", ...H264, out], this.dir);
    return { seconds: body.seconds };
  }
}

/** A GIF of `mp4`, `width` px wide at `fps`, with one palette tuned to the whole clip. */
export function gifOf(ffmpeg: string, mp4: string, out: string, { width = 360, fps = 20 } = {}) {
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  ffmpegRun(ffmpeg, ["-i", mp4, "-filter_complex", filter, "-loop", "0", out]);
}

/** Pulls single frames out of an .mp4 at `seconds`, as PNGs into `dir`, to look at. */
export function stills(ffmpeg: string, mp4: string, dir: string, seconds: number[]) {
  fs.mkdirSync(dir, { recursive: true });
  return seconds.map((s) => {
    const out = path.join(dir, `${path.basename(mp4, ".mp4")}-${s.toFixed(2)}s.png`);
    ffmpegRun(ffmpeg, ["-ss", s.toFixed(3), "-i", mp4, "-frames:v", "1", out]);
    return out;
  });
}

/** Length of a video in seconds, from ffmpeg's own report. */
export function lengthOf(ffmpeg: string, file: string): number {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(result.stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number.NaN;
}
