# ForecastIQ

Demand forecasting and inventory planning for retail. Upload your sales history from Excel or CSV and ForecastIQ projects demand, flags products running low, and suggests how much to reorder.

Everything runs in the browser. There is no server: your file is processed and stored on your own device.

## Features

- **Overview**: revenue, units, forecast, forecast accuracy, top products and urgent stock alerts, with category and region filters and scenario switches (baseline, promotion +15%, supply shock -20%).
- **Sales Forecast**: daily, weekly or monthly projections with a confidence range (80%, 95%, 99%).
- **Inventory Risk**: days of cover, reorder points, suggested order sizes and approval limits.
- **Products**: search and sort every product by revenue, recent sales, growth or stock health.
- **Data & Model**: upload files, map columns, and see how the model performed on past data.
- **Settings**: safety stock, lead time, currency, alerts and data retention.
- Export the report as CSV.
- Demo data and an Excel template are built in.

## Quick start

The app is plain HTML, CSS and JavaScript. Because it uses a Web Worker, it must be served over http, not opened with `file://`.

```bash
git clone https://github.com/SalsabeelQuraan/ForecastIQ.git
cd ForecastIQ/frontend
npm install
npm run build
npx serve .
```

Then open the address shown in the terminal and click **Try demo data**.

Any static server works, for example `python -m http.server 8080` from the `frontend` folder.

## Development

Styles use Tailwind CSS. After changing classes in any `.html` or `.js` file, rebuild the CSS:

```bash
npm run build     # one-time build
npm run watch     # rebuild on every save
```

## Your data

Upload an `.xlsx`, `.xls` or `.csv` file (up to 25 MB). Four columns are required:

| Column | Required | Used for |
|---|---|---|
| Date | Yes | Trends, seasonality and every forecast |
| Product | Yes | Product list, top sellers, reorder suggestions |
| Quantity | Yes | Units per day and days of cover |
| Sales | Yes | Revenue totals and revenue forecast |
| Category | No | Category filter and breakdown |
| Region | No | Region filter and breakdown |
| Current Stock | No | Inventory Risk page and stock alerts |

Two years of history gives the best seasonal forecasts. You can download a ready-made template from the app.

## How it works

- **Forecast**: damped additive Holt-Winters, with parameters tuned automatically on your data.
- **Accuracy**: a backtest holds out the last periods, forecasts them, and reports WAPE.
- **Inventory**: reorder point = daily demand x (lead time + buffer + safety days). A product is critical when it would run out before a new order could arrive.

## Privacy

Files are read in a Web Worker and stored in your browser (IndexedDB and localStorage). Nothing is sent anywhere. You can delete your data at any time in **Data & Model**, or choose an automatic deletion period in **Settings**. Demo data is synthetic.

## Project structure

```
frontend/
├── css/            built Tailwind CSS
├── js/
│   ├── data.js         storage, ingestion, forecasting, helpers
│   ├── shell.js        shared sidebar and header
│   ├── overview.js     Overview page
│   ├── pages.js        Sales Forecast, Inventory Risk, Products, Data & Model
│   ├── upload.js       upload, preview and column mapping
│   ├── settings.js     Settings page
│   ├── sample.js       demo data and Excel template
│   ├── xlsx-client.js  safe spreadsheet reading
│   └── xlsx-worker.js  spreadsheet parsing in a Web Worker
├── src/input.css   Tailwind entry file
├── tailwind.config.js
└── *.html          pages
```

## Tech

HTML, Tailwind CSS, vanilla JavaScript, [SheetJS](https://sheetjs.com/) for spreadsheets.
