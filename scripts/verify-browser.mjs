import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = new URL('../reports/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: process.env.USE_SWIFTSHADER === '1'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    : ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));

async function shot(name) {
  await page.screenshot({ path: fileURLToPath(new URL(`./${name}.png`, outDir)), fullPage: false });
}

try {
  await page.goto('http://127.0.0.1:4173/?pw=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.order-card', { timeout: 15000 });
  await page.waitForTimeout(800);
  await shot('01-orders');

  await page.click('[data-route="cake"]');
  await page.waitForSelector('.viewport canvas', { timeout: 10000 });
  await page.waitForTimeout(2500);
  await shot('02-cake');
  const cakeFps = await page.locator('.fps-badge').innerText().catch(() => 'no fps');

  await page.click('[data-route="piping"]');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /120\s*朵压测/ }).click();
  await page.waitForTimeout(3500);
  await shot('03-piping-120');
  const pipingFps = await page.locator('.fps-badge').innerText().catch(() => 'no fps');
  const volume = await page.locator('.volume-total').innerText().catch(() => 'no volume');

  const canvasBox = await page.locator('.piping-page .viewport canvas').boundingBox();
  const orbitSamples = [];
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 72; i++) {
      await page.mouse.move(cx + Math.sin(i / 5) * 220, cy + Math.cos(i / 7) * 70);
      await page.waitForTimeout(34);
      if (i % 8 === 0) orbitSamples.push(await page.locator('.fps-badge').innerText().catch(() => 'no fps'));
    }
    await page.mouse.up();
  }
  const orbitFps = await page.locator('.fps-badge').innerText().catch(() => 'no fps');

  await page.click('[data-route="decorate"]');
  await page.waitForTimeout(1800);
  await shot('04-decorate');

  await page.click('[data-route="preview"]');
  await page.waitForTimeout(2500);
  await shot('05-preview-shop');
  await page.getByRole('button', { name: /婚礼现场暖光/ }).click();
  await page.waitForTimeout(1800);
  await shot('06-preview-wedding');
  const previewFps = await page.locator('.fps-badge').innerText().catch(() => 'no fps');

  await page.click('[data-route="settings"]');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /运行自检/ }).click();
  await page.waitForSelector('.test-summary', { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot('07-settings-selftest');
  const testSummary = await page.locator('.test-summary').innerText();
  const failedTests = await page.locator('.test-result.fail').count();

  console.log(JSON.stringify({ cakeFps, pipingFps, orbitFps, orbitSamples, previewFps, volume, testSummary, failedTests, logs }, null, 2));
} catch (err) {
  await shot('error').catch(() => {});
  console.log(JSON.stringify({ fatal: err.stack || String(err), logs }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
