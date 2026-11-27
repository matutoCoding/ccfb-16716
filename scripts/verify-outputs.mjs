import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:4173/?outputs=1');
await page.waitForSelector('.order-card');
await page.evaluate(() => { window.print = () => { window.__printCalled = true; }; });
await page.click('[data-route="preview"]');
await page.waitForSelector('.viewport canvas');
await page.waitForTimeout(1800);

let downloadOk = false;
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /导出客户看的 PNG/ }).click()
  ]);
  downloadOk = download.suggestedFilename().endsWith('.png');
} catch (e) {
  errors.push(`download: ${e.message}`);
}

await page.getByRole('button', { name: /打印 \/ 导出制作单/ }).click();
await page.waitForSelector('#print-root .sheet', { state: 'attached', timeout: 5000 });
const sheetText = await page.locator('#print-root .sheet').innerText();
await page.waitForTimeout(250);
const printCalled = await page.evaluate(() => Boolean(window.__printCalled));
const checks = {
  downloadOk,
  printCalled,
  sheetHasTitle: sheetText.includes('裱花蛋糕制作单'),
  sheetHasNozzle: sheetText.includes('花嘴准备'),
  sheetHasSequence: sheetText.includes('裱花顺序'),
  sheetHasVolume: /\d+\.\d+\s*ml/.test(sheetText),
  errors: errors.filter(e => !e.includes('favicon'))
};
console.log(JSON.stringify(checks, null, 2));
await browser.close();
if (!checks.sheetHasTitle || !checks.sheetHasSequence || checks.errors.length) process.exit(1);
