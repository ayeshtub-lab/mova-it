// Downloads the ffmpeg binary that ffmpeg-static ships through its own install script.
// npm 11 no longer runs dependencies' install scripts by default, so the project runs
// it explicitly. Only on Vercel builds: locally the montage uses the ffmpeg on PATH.
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

if (!process.env.VERCEL) {
  console.log("fetch-ffmpeg: not a Vercel build, using the local ffmpeg");
  process.exit(0);
}

const dir = path.dirname(require.resolve("ffmpeg-static/package.json"));
const binary = require("ffmpeg-static");
if (binary && existsSync(binary)) {
  console.log("fetch-ffmpeg: already present");
  process.exit(0);
}
execFileSync(process.execPath, [path.join(dir, "install.js")], { cwd: dir, stdio: "inherit" });
if (!existsSync(binary)) throw new Error("fetch-ffmpeg: ffmpeg binary missing after install");
console.log("fetch-ffmpeg: ok");
