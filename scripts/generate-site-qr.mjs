import QRCode from "qrcode";
import { fileURLToPath } from "node:url";

const siteUrl = "https://mai-cup-cn-2026.xzso3.chatgpt.site";
const outputPath = new URL("../public/site-qr.png", import.meta.url);

await QRCode.toFile(fileURLToPath(outputPath), siteUrl, {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 512,
  color: {
    dark: "#090b11",
    light: "#ffffff",
  },
});

console.log(`Generated ${outputPath.pathname}`);
