# ForecastIQ
# ForecastIQ

Retail demand-forecast dashboard. Static site: HTML + Tailwind (CDN) + vanilla JS. Data lives in the browser (IndexedDB).

## Run locally
Serve the folder over HTTP (opening files with `file://` blocks some features):

    python3 -m http.server 8080      # then open http://localhost:8080

## Structure
| File | Purpose |
|---|---|
| `index.html` | Landing page, demo data, Excel template |
| `overview.html`, `settings.html` | Pages with their own content |
| `sales-forecast.html`, `inventory-risk.html`, `products.html`, `data-model.html` | Render into `<main id="app">` via `js/pages.js` |
| `js/shell.js` | Sidebar, header, mobile menu, global search, alert bell (all pages) |
| `js/data.js` | Storage, Excel ingestion, forecasting, inventory maths → `window.FIQ` |
| `js/sample.js` | Demo dataset + Excel template (loaded on demand) |
| `js/tailwind.config.js` | Design tokens (keep your existing file) |

## Adding a page
1. Copy `products.html`, change `<title>` and `data-page`.
2. Add the page to `NAV` in `js/shell.js`.
3. Add a renderer under `PAGES` in `js/pages.js`.

## Buttons that work on any page
`data-action="load-demo"` (optional `data-then="overview.html"`) and `data-action="download-template"`.

## Before going live
Tailwind via CDN is for prototyping. Build the CSS with the Tailwind CLI for production.
