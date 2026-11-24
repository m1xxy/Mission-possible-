# NetFilla + DISCOVER (GitHub & Vercel Ready)

A global movie & TV streaming web app featuring the **DISCOVER — Global Entertainment Hub** (Release Calendar, 21 Film Industries with parent/subcategories, Country-Accurate Streaming Platforms, Content Types & Genres, Personalized Preferences, and Global Search) with a sharp 90-degree rectangular UI, iOS-style layered shadows, and poster hover overlays.

## Deploy to Vercel via GitHub

1. Create a new repository on GitHub and upload **all files in this folder** (`index.html`, `vercel.json`, `package.json`, `css/`, `js/`, `api/`, `netfilla-standalone.html`).
2. Go to [Vercel](https://vercel.com), click **Add New Project**, and import your GitHub repository.
3. Keep the Framework Preset as **Other** (no build command needed).
4. Optional Environment Variables in Vercel Project Settings:
   - `TMDB_API_KEY`: Your TMDB v3 API key
   - `DEFAULT_REGION`: Default region code (e.g. `US`, `IN`, `PK`, `GB`)
5. Click **Deploy** — Vercel serves the frontend and automatically routes `/api/tmdb/*`, `/api/tvmaze/*`, `/api/anilist`, and `/api/health` through the serverless functions in `/api/`.

## Run Locally (Full Node.js + SQLite Mode)

```bash
node server.js
```

Opens at `http://localhost:3010` with local SQLite persistence (`data/netfilla.db`).

## Standalone Single-File HTML

You can also open `netfilla-standalone.html` directly in any browser without a server. Rebuild it after editing source files with:

```bash
node build-standalone.js
```
