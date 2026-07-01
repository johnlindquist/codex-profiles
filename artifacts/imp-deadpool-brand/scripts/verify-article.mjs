import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const receipts = new URL('receipts/verify/', root);
await mkdir(receipts, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

await run('npm', ['run', 'build']);

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4177'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('preview server timed out')), 15000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes('http://127.0.0.1:4177')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('exit', (code) => reject(new Error(`preview server exited ${code}`)));
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('http://127.0.0.1:4177/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: new URL('desktop.png', receipts).pathname, fullPage: true });

  const metrics = await page.evaluate(() => {
    const article = document.querySelector('article');
    const h1 = document.querySelector('h1');
    const grid = article ? getComputedStyle(article).gridTemplateColumns : '';
    const codeCard = document.querySelector('.code-card');
    const fieldRule = document.querySelector('.field-rule');
    const image = document.querySelector('.eggo-cutout');
    return {
      articleClass: article?.className ?? null,
      gridColumnCount: grid.split('px').length - 1,
      h1FontSize: h1 ? getComputedStyle(h1).fontSize : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      codeCardWidth: codeCard?.getBoundingClientRect().width ?? null,
      fieldRuleBackground: fieldRule ? getComputedStyle(fieldRule).backgroundImage : null,
      imageNaturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : null,
      imageNaturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : null
    };
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: new URL('mobile.png', receipts).pathname, fullPage: true });
  const mobile = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    hasOverflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  await browser.close();

  const report = {
    ok: !metrics.hasOverflow && !mobile.hasOverflow && consoleErrors.length === 0,
    consoleErrors,
    desktop: metrics,
    mobile
  };
  await writeFile(new URL('article-metrics.json', receipts), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`article verification failed: ${JSON.stringify(report, null, 2)}`);
  }
} finally {
  server.kill('SIGTERM');
}
