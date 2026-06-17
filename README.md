# ARCHICONCEPT Replica

This workspace is a local mirror of `https://new-archiconcept.vercel.app/`.

## Run

```bash
npm install
npm run dev
```

On this Windows machine, PowerShell may block `npm.ps1`; use `npm.cmd` if needed:

```powershell
npm.cmd install
npm.cmd run dev
```

## API Keys

Create `.env` from `.env.example` and fill the keys you want to enable:

- `DEEPSEEK_API_KEY`: required for task parsing and design generation APIs.
- `AMAP_WEB_SERVICE_KEY`: required for place suggestions, geocoding, and surrounding-context analysis.
- `VITE_AMAP_JS_KEY`: reserved for the browser-side AMap JS SDK.
- `TAVILY_API_KEY` or `SERPAPI_API_KEY`: optional for online case search.

The app exposes local routes under `/api/*` through `server/index.js`.

## Structure

- `index.html`: local entry point
- `assets/`: production JavaScript and CSS bundle from the deployed site
- `public/images/`: IP and workflow images served at `/images/...`
- `public/videos/`: hero and loading animations served at `/videos/...`
- `server/`: local API proxy and generation routes
