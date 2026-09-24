import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

// On Vercel the binary comes from ffmpeg-static (fetched at build time); locally the
// ffmpeg on PATH is used. Routes that call this must trace the binary (next.config.ts).
const FFMPEG = process.env.FFMPEG_PATH || (ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : "ffmpeg");

export function ffmpeg(args: string[], timeoutMs = 120_000) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(FFMPEG, ["-hide_banner", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-4000)));
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}
