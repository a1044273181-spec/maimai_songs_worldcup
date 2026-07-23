import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const repository = process.env.GITHUB_REPOSITORY ?? "a1044273181-spec/maimai_songs_worldcup";
const [owner, repositoryName] = repository.split("/");

if (!owner || !repositoryName) {
  throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
}

const basePath = `/${repositoryName}`;
const siteUrl = `https://${owner.toLowerCase()}.github.io`;
const pageUrl = `${siteUrl}${basePath}/`;
const outputPath = new URL("../public/site-qr-pages.png", import.meta.url);

await QRCode.toFile(fileURLToPath(outputPath), pageUrl, {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 512,
  color: {
    dark: "#090b11",
    light: "#ffffff",
  },
});

const vinextCli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(vinextCli), "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    GITHUB_PAGES: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_PUBLIC_SITE_QR_IMAGE: "/site-qr-pages.png",
  },
});

child.on("error", (error) => {
  throw error;
});

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  if (process.platform !== "win32") {
    process.exit(exitCode);
  }

  const indexPath = new URL("../dist/client/index.html", import.meta.url);
  const manifestPath = new URL(
    "../dist/server/vinext-prerender.json",
    import.meta.url,
  );
  try {
    await access(indexPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      !Array.isArray(manifest.routes) ||
      manifest.routes.some((route) => route.status !== "rendered")
    ) {
      process.exit(exitCode);
    }
    console.warn(
      "vinext completed the static export before a Windows shutdown assertion; validated generated files and continuing.",
    );
  } catch {
    process.exit(exitCode);
  }
}

console.log(`GitHub Pages static site generated for ${pageUrl}`);
