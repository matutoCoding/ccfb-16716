import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4173/?scenarios=1');
await page.waitForSelector('.order-card');

for (const [name, file] of [['② 镜面淋面慕斯', 'mousse'], ['③ 数字生日蛋糕', 'birthday']]) {
  await page.click('[data-route="settings"]');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: new RegExp(name.replace(/[①②③]/, m => m)) }).click();
  await page.waitForSelector('.preview-page .viewport canvas');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `reports/scenario-${file}-preview.png` });
  await page.click('[data-route="cake"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `reports/scenario-${file}-cake.png` });
}
console.log(JSON.stringify({ errors: errors.filter(e => !e.includes('favicon')) }, null, 2));
await browser.close();
