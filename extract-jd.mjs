import { chromium } from 'playwright';

async function extractJD() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node extract-jd.mjs <url>');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for a bit for any dynamic content
    await page.waitForTimeout(5000);
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
  } finally {
    await browser.close();
  }
}

extractJD().catch(err => {
  console.error(err);
  process.exit(1);
});
