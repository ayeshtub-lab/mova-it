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

// A video's real length in seconds, read by ffmpeg from the file itself (over HTTP range
// requests: only the header is fetched). null when it can't be read. ffmpeg with no output
// exits with an error on purpose; the length is in what it prints before that.
export function probeDuration(input: string, timeoutMs = 20_000) {
  return new Promise<number | null>((resolve) => {
    let stderr = "";
    let proc;
    try {
      proc = spawn(FFMPEG, ["-hide_banner", "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      return resolve(null);
    }
    proc.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-8000)));
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    const done = () => {
      clearTimeout(timer);
      const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    };
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", done);
  });
}
