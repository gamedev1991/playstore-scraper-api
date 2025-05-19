# Google Play Store New Games Scraper API

A Node.js API that scrapes newly launched games from the Google Play Store. This API uses Puppeteer to automate browser interactions and extract game information.

## Features

- Scrapes newly launched games from Google Play Store
- Extracts game details including:
  - Game name
  - Game URL
  - Game type
  - Thumbnail image URL
- Handles dynamic content loading with "Show more" button clicks
- Returns data in a clean JSON format

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/playstore-scraper-api.git
cd playstore-scraper-api
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. The API will be available at `http://localhost:3000`

3. Make a GET request to `/scrape-new-games` endpoint to get the list of newly launched games:
```bash
curl http://localhost:3000/scrape-new-games
```

## API Response Format

```json
{
  "count": number,
  "games": [
    {
      "name": "Game Name",
      "url": "https://play.google.com/store/apps/details?id=...",
      "type": "Game Type",
      "thumbnailUrl": "https://..."
    }
  ]
}
```

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Successful response
- 404: Newly-launched section not found or empty
- 500: Server error

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 