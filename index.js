const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Error codes
const ERROR_CODES = {
  SUCCESS: 200,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
  TIMEOUT: 408,
  INVALID_RESPONSE: 422
};

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use(cors());

// Health check endpoint - Move this before the scraping endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/scrape-new-games', async (req, res) => {
  console.log('Starting scraping process...');
  let browser;

  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ],
      timeout: 30000
    });

    console.log('Creating new page...');
    const page = await browser.newPage();
    
    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(60000);
    
    // Set viewport to a larger size
    await page.setViewport({ width: 1920, height: 1080 });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Enable request interception to block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });

    console.log('Navigating to Play Store...');
    await page.goto('https://play.google.com/store/games?device=phone', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    console.log('Waiting for initial load...');
    await new Promise(res => setTimeout(res, 2000));

    const maxScrolls = 30;
    let lastClickTime = 0;
    let allHeadings = new Set();

    console.log('Starting scroll process...');
    for (let i = 0; i < maxScrolls; i++) {
      console.log(`Scroll ${i + 1}/${maxScrolls}`);
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await new Promise(res => setTimeout(res, 500));

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
          console.log('Clicked "Show more" button');
          lastClickTime = currentTime;
          await new Promise(res => setTimeout(res, 2000));
        }
      }

      // Collect all section headings
      const headings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('section')).map(section => {
          const heading = section.querySelector('div.kcen6d span')?.textContent?.trim() || 'No heading';
          return heading;
        });
      });

      headings.forEach(heading => allHeadings.add(heading));
    }

    console.log('Extracting game data...');
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
        return null;
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

    if (!data) {
      console.log('Newly-launched section not found');
      return res.status(ERROR_CODES.NOT_FOUND).json({
        code: ERROR_CODES.NOT_FOUND,
        error: 'Newly-launched section not found',
        message: 'Could not locate the newly-launched games section',
        sections: Array.from(allHeadings)
      });
    }

    if (data.length === 0) {
      console.log('No games found in newly-launched section');
      return res.status(ERROR_CODES.NOT_FOUND).json({
        code: ERROR_CODES.NOT_FOUND,
        error: 'No games found',
        message: 'The newly-launched section was found but no games were extracted',
        sections: Array.from(allHeadings)
      });
    }

    console.log(`Successfully extracted ${data.length} games`);
    res.status(ERROR_CODES.SUCCESS).json({
      code: ERROR_CODES.SUCCESS,
      count: data.length,
      games: data,
      sections: Array.from(allHeadings)
    });

  } catch (err) {
    console.error('Error during scraping:', err);
    const errorCode = err.name === 'TimeoutError' ? ERROR_CODES.TIMEOUT : ERROR_CODES.SERVER_ERROR;
    res.status(errorCode).json({
      code: errorCode,
      error: err.name,
      message: err.message,
      sections: Array.from(allHeadings || [])
    });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
});

app.get('/', (req, res) => res.send('🎮 Google Play Scraper API Running'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    code: ERROR_CODES.SERVER_ERROR,
    error: 'Internal Server Error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
