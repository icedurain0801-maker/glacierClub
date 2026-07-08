const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const cwd = process.cwd();
  const htmlPath = path.join(cwd, 'next-work-suggestions.html');
  const outputDir = path.join(cwd, '.codex-temp', 'next-work-suggestions');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 700 },
    deviceScaleFactor: 2,
  });

  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if (document.fonts) {
      await document.fonts.ready;
    }
  });

  const slides = await page.$$('.slide');
  if (slides.length === 0) {
    throw new Error('No .slide elements found');
  }

  const manifest = [];
  for (let i = 0; i < slides.length; i += 1) {
    const fileName = `slide-${String(i + 1).padStart(2, '0')}.png`;
    const filePath = path.join(outputDir, fileName);
    await slides[i].screenshot({ path: filePath, type: 'png' });
    const box = await slides[i].boundingBox();
    manifest.push({
      index: i + 1,
      image: filePath,
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
  }

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
  console.log(JSON.stringify({ outputDir, slides: manifest }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
