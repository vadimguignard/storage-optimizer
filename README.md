# Storage Optimizer

A personal 3D storage optimiser for **one move**. Describe your items and boxes, define the available space, check that everything fits, and preview a realistic 3D layout.

> This is a **3D bin packing** problem: items are placed with their three dimensions, their allowed rotations, and without collisions — not just by comparing volumes.

The interface opens in **English** by default. Use the language selector in the header to switch to **Français**; the choice is remembered in your browser.

## Features

- **Items**: name, shape (box or cylinder), dimensions, unit (mm/cm/m), allowed rotations, quantity, colour, search, add/edit/delete.
- **Boxes**: internal dimensions, available quantity, declared contents and a “does this item fit?” check.
- **Simulator**:
  - *Items* mode: place items directly in the space;
  - *Boxes* mode: pack items into boxes, then place the boxes in the space;
  - global rotation switch, adjustable number of attempts;
  - metrics (items placed, fill rate, used height, compute time) and a list of unplaced items.
- **3D view** with Three.js: drag to rotate, scroll to zoom, click an item for details, toggle the outline and the boxes.
- **No starter data**: the item and box lists are empty on first launch (`data/objects.json` and `data/containers.json` contain `[]`).
- **Missing dimension** handling: if you enter only two dimensions, the third one is estimated as **the smallest of the two** (e.g. `180 × 80` → `80`). The estimated field is marked with `≈` and reported in a toast. A cylinder with a single known value copies it.
- **Git-based sync** across your PC and phone: data lives in a dedicated `sync` branch while the site itself is served from `main` (GitHub Pages).

## Quick start

Open `index.html` directly, or run the bundled dependency-free server:

```bash
npm start
# then open http://localhost:8080
```

The HTTP server is needed only to load the initial `data/*.json` files. Three.js is vendored in `assets/vendor/`, so the 3D view works offline.

Tests:

```bash
npm test
```

Tests cover geometry (units, estimation, orientations, boundaries, collisions), packing (10 cases) and the data repository (empty defaults, import/export, validation).

## Using the app

1. **Items** → add your belongings with two or three dimensions. If you leave one blank, it is estimated automatically.
2. **Boxes** → declare your available boxes and their quantities.
3. **Simulator** → set the space (e.g. `3 × 2 × 2.5 m`), choose what to include, click **Optimise**, then rotate the 3D scene and click an item to identify it.

The 3D placeholder (“The 3D view will appear here after optimisation.”) disappears as soon as a valid layout is computed.

## Sync across devices

The site is static, but the data is versioned in GitHub:

- `main` holds the code and is published with GitHub Pages.
- `sync` holds `data/store.json`, the live shared dataset.
- The web app reads **and** writes through a small Cloudflare Worker (`worker/`). The Worker holds the GitHub token as a Cloudflare secret and adds the `Authorization` header server-side; the browser never receives the token. The public `raw.githubusercontent.com` URL is deliberately not used because it can serve a cached copy for up to 5 minutes.
- Confirming an item or box form saves locally and **pushes to GitHub immediately** (no delay, no button to click), with a **“GitHub updated — all devices will see this change.”** toast. Deletions follow the same path.
- Other devices check for new data every **2 seconds** (and on load / tab focus) using conditional requests, so the new item appears in their lists and on the Home summary almost instantly — still no manual sync action. They show a **“New data downloaded from GitHub.”** toast when it arrives.
- Sync is **on by default on every device**: no token field, no copy/paste, no setup.

One-time setup (done by the site owner, not by each device):

1. In `worker/`, run `npx wrangler login`, then `npx wrangler secret put GITHUB_TOKEN` (paste the token once — it goes to Cloudflare, not to the repository), then `npx wrangler deploy`.
2. Put the deployed `https://…workers.dev` URL into `PROXY_URL` at the top of `js/sync.js`, then commit and push to `main`.
3. Every device now syncs automatically just by opening the site.

**The token is never in the repository, never in the site, and never in any browser.** It exists only as the Cloudflare secret `GITHUB_TOKEN`. The Worker accepts only requests from the GitHub Pages origin (plus local dev origins), and the token can be revoked at any time from GitHub or Cloudflare.

If the `sync` branch does not exist yet, create it from `main` and add `data/store.json`:

```json
{
  "app": "storage-optimizer",
  "version": 1,
  "updatedAt": 0,
  "objects": [],
  "containers": []
}
```

## Architecture

```
├── index.html            Home, summary and sync panel
├── objects.html          Item management
├── containers.html       Box management
├── simulator.html        Simulator + 3D view
├── css/style.css         Styling
├── js/
│   ├── app.js            Navigation, language selector, modals, toasts, import/export, sync UI
│   ├── i18n.js           English/French dictionaries and helpers
│   ├── data.js           localStorage repository + seeding from data/*.json
│   ├── sync.js           Calls the Worker proxy, applies remote data, polls every 2 s
│   ├── objects.js        Item page logic
│   ├── containers.js     Box page logic
│   ├── geometry.js       Units, dimension estimation, rotations, bounds, collisions
│   ├── packing.js        Placement heuristic + box mode
│   ├── viewer3d.js       Three.js rendering
│   └── simulator.js      Simulator orchestration
├── data/                 Initial JSON datasets (empty by default)
├── worker/               Cloudflare Worker proxy (token stored as a Cloudflare secret)
├── tests/                Node tests (node:test)
├── assets/vendor/        Local Three.js build
└── server.js             Optional static server
```

### Data model

```json
{
  "id": "table-001",
  "name": "Dining table",
  "type": "box",
  "dimensions": { "length": 180, "width": 80, "height": 75 },
  "unit": "cm",
  "rotations": "allowed",
  "quantity": 1,
  "color": "#3b82f6"
}
```

- `type`: `box` (`length`, `width`, `height`) or `cylinder` (`diameter`, `height`). A cylinder is approximated by its bounding box.
- Only two dimensions are required; the missing one is stored in `dimensions` and listed in `estimated`.
- `rotations`: `allowed` (6 orientations), `upright` (2 orientations, height kept vertical), `none` (no rotation).
- `unit`: `mm`, `cm` or `m`. Everything is converted to centimetres internally.
- A container follows the same model, with `quantity` (how many boxes of this type) and `contents` (indicative item ids).

### Algorithm

`packing.js` uses an “extreme points” heuristic:

1. normalise units and expand quantities;
2. sort items by decreasing volume;
3. generate candidate points (origin + corners of already placed boxes);
4. try every allowed orientation at every point;
5. reject overflow or collisions;
6. score placements by height, position and number of touching faces;
7. run several attempts with a slightly shuffled order and keep the best result (fewest unplaced items, then lowest height and footprint).

Box mode applies the same logic twice: fill the boxes, then place the boxes in the space. Items inside a box remain visible in the 3D scene.

This is deliberately a heuristic: an exact solution becomes very expensive as the number of items grows. A very good answer in a few seconds is preferred.

## Known limitations

- Axis-aligned geometry only (no arbitrary rotations).
- Cylinders are approximated by their bounding box.
- No advanced constraints (fragility, access, weight, unpacking priority).
- The number of opened boxes is limited by declared quantities; box filling is greedy (first-fit).
- Sync requires a token per device; without it, data stays local to that browser.

## GitHub Pages

1. Push the repository to GitHub (default branch `main`).
2. **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**.
3. The site is available at `https://vadimguignard.github.io/storage-optimizer/`.
4. Create the separate `sync` branch for the live data as described above. GitHub Pages will not rebuild when `sync` changes, so the app itself keeps working normally.
