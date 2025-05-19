const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/scrape-new-games', async (req, res) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/95.0.0.0 Mobile Safari/537.36'
    );
    await page.setViewport({ width: 400, height: 800 });

    await page.goto('https://play.google.com/store/games?device=phone', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(res => setTimeout(res, 1000));

    const maxScrolls = 30;
    let lastClickTime = 0;

    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await new Promise(res => setTimeout(res, 300));

      const currentTime = Date.now();
      if (currentTime - lastClickTime > 2000) {
        const wasClicked = await page.evaluate(() => {
          const possibleButtons = [
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('[role="button"]'),
            ...document.querySelectorAll('.VfPpkd-LhBDec')
          ];
          
          const showMoreButton = possibleButtons.find(button => {
            const text = button.textContent.toLowerCase();
            return text.includes('show more') || text.includes('see more');
          });
          
          if (showMoreButton) {
            showMoreButton.click();
            return true;
          }
          return false;
        });

        if (wasClicked) {
          lastClickTime = currentTime;
          await new Promise(res => setTimeout(res, 1000));
        }
      }
    }

    const data = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('section')];
      let newlyLaunchedSection = null;

      for (const section of sections) {
        const heading = section.querySelector('div.kcen6d span')?.textContent?.toLowerCase() || '';
        if (heading.includes('newly') && heading.includes('launch')) {
          newlyLaunchedSection = section;
          break;
        }
      }

      if (!newlyLaunchedSection) {
        return [];
      }

      const gameCards = newlyLaunchedSection.querySelectorAll('a[href^="/store/apps/details"]');
      const games = [];

      for (const card of gameCards) {
        const name = card.querySelector('div.Epkrse')?.textContent || 
                    card.querySelector('div.sT93pb.DdYX5')?.textContent || 
                    card.querySelector('div.ubGTjb span.sT93pb.DdYX5')?.textContent;
        const url = 'https://play.google.com' + card.getAttribute('href');
        const type = card.querySelector('div.ubGTjb span.sT93pb.w2kbF')?.textContent || 
                    card.querySelector('div.vlGucd span.w2kbF')?.textContent || 
                    'Unknown';
        const thumbnailUrl = card.querySelector('img')?.src || '';

        if (name && url) {
          games.push({
            name: name.trim(),
            url,
            type: type.trim(),
            thumbnailUrl
          });
        }
      }

      return games;
    });

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Newly-launched section not found or empty' });
    }

    res.json({ count: data.length, games: data });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/', (req, res) => res.send('🎮 Google Play Scraper API Running'));

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
