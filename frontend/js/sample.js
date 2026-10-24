/* ForecastIQ · sample.js — synthetic demo data + Excel template.
 * Loaded on demand by FIQ.loadDemo() / FIQ.downloadTemplate() in data.js. */
(() => {
    'use strict';
    const DAY = 864e5, DAYS = 800; // ~114 weeks: enough history for weekly seasonality

    // [name, category, unit price, average units/day, yearly growth, target days of stock cover]
    const PRODUCTS = [
        ['Laptop Pro 14"', 'Technology', 1150, 3.2, 0.25, 5],
        ['Wireless Headphones', 'Technology', 129, 9, 0.15, 11],
        ['4K Monitor 27"', 'Technology', 349, 4.5, 0.10, 32],
        ['Standing Desk', 'Furniture', 489, 2.6, 0.20, 9],
        ['Ergonomic Chair', 'Furniture', 279, 3.4, 0.05, 24],
        ['Bookcase 5-Shelf', 'Furniture', 159, 2.8, -0.05, 45],
        ['A4 Copy Paper (box)', 'Supplies', 32, 26, 0.02, 6],
        ['Ink Cartridge Black', 'Supplies', 58, 14, 0.00, 18],
        ['Sticky Notes (12-pack)', 'Supplies', 14, 34, -0.04, 60],
        ['Wireless Mouse', 'Accessories', 29, 22, 0.12, 13],
        ['USB-C Hub', 'Accessories', 49, 12, 0.30, 28],
        ['Laptop Sleeve', 'Accessories', 35, 9, 0.08, 38],
    ];
    const REGIONS = [['West', 0.30], ['East', 0.28], ['Midwest', 0.20], ['South', 0.22]];
    const WEEKDAY = [0.9, 0.9, 0.95, 1, 1.05, 1.15, 1.2]; // Sun … Sat
    const HEADERS = ['Date', 'Product', 'Quantity', 'Sales', 'Category', 'Region', 'Current Stock'];

    const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    function buildRows() {
        const rand = mulberry32(20260101); // fixed seed → the same demo every time
        const end = Math.floor(Date.now() / DAY) * DAY - DAY, start = end - (DAYS - 1) * DAY;
        const rows = [], last = new Map(), recent = new Map(PRODUCTS.map((p) => [p[0], []]));
        for (let i = 0; i < DAYS; i++) {
        const t = start + i * DAY, d = new Date(t), dow = d.getUTCDay(), month = d.getUTCMonth();
        const doy = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
        const season = 1 + 0.2 * Math.sin((2 * Math.PI * (doy - 240)) / 365) + (month >= 10 ? 0.1 : 0); // peaks around Nov–Dec
        for (const [name, cat, price, base, growth] of PRODUCTS) {
            const mean = base * WEEKDAY[dow] * season * (1 + growth * (i / 365));
            const q = Math.round(mean * (0.7 + 0.6 * rand()));
            if (q <= 0) continue;
            let r = rand(), region = REGIONS[REGIONS.length - 1][0];
            for (const [n, w] of REGIONS) { if ((r -= w) < 0) { region = n; break; } }
            const row = [t, name, q, Math.round(q * price * (0.97 + 0.06 * rand()) * 100) / 100, cat, region, null];
            rows.push(row); last.set(name, row);
            if (i >= DAYS - 30) recent.get(name).push(q);
        }
        }
        // Current stock only on each product's latest row, set so the demo shows critical / low / healthy items.
        for (const [name, , , , , cover] of PRODUCTS) {
        const qs = recent.get(name), daily = qs.reduce((a, b) => a + b, 0) / 30;
        last.get(name)[6] = Math.round(daily * cover);
        }
        return { rows, start, end };
    }

    async function loadDemo() {
        const { rows, start, end } = buildRows();
        const mapping = { date: 'Date', product: 'Product', quantity: 'Quantity', sales: 'Sales', category: 'Category', region: 'Region', stock: 'Current Stock' };
        const meta = { name: 'Demo dataset (synthetic)', sheet: 'demo', rows: rows.length, skipped: 0, from: start, to: end, mapping, loadedAt: Date.now(), demo: true };
        return FIQ.store(rows, meta);
    }

    async function downloadTemplate() {
        const examples = [
        ['2026-01-05', 'Wireless Mouse', 12, 348, 'Accessories', 'West', 140],
        ['2026-01-05', 'Standing Desk', 2, 978, 'Furniture', 'East', 18],
        ['2026-01-06', 'A4 Copy Paper (box)', 30, 960, 'Supplies', 'Midwest', 210],
        ['2026-01-06', 'Laptop Pro 14"', 1, 1150, 'Technology', 'South', 7],
        ['2026-01-07', 'USB-C Hub', 9, 441, 'Accessories', 'West', 65],
        ];
        const guide = [
        ['Column', 'Required', 'What to put there'],
        ['Date', 'Yes', 'Date of the sale (e.g. 2026-01-05). One row per sale or per product per day.'],
        ['Product', 'Yes', 'Product name or SKU. Keep the spelling identical across rows.'],
        ['Quantity', 'Yes', 'Units sold (number).'],
        ['Sales', 'Yes', 'Revenue for that row (number, no currency text needed).'],
        ['Category', 'No', 'Product category. Enables the category filter and chart.'],
        ['Region', 'No', 'Region, state or city. Enables the region filter and chart.'],
        ['Current Stock', 'No', 'Units on hand. Only the most recent row per product is used. Needed for Inventory Risk.'],
        [],
        ['Tip', '', 'Aim for at least 2 years of daily or weekly history so seasonality can be learned. Delete the example rows before uploading.'],
        ];
        try {
        const X = await FIQ.loadXlsx(), wb = X.utils.book_new();
        const sales = X.utils.aoa_to_sheet([HEADERS, ...examples]); sales['!cols'] = [12, 24, 10, 10, 14, 12, 14].map((wch) => ({ wch }));
        const info = X.utils.aoa_to_sheet(guide); info['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 90 }];
        X.utils.book_append_sheet(wb, sales, 'Sales'); X.utils.book_append_sheet(wb, info, 'How to fill');
        X.writeFile(wb, 'forecastiq-template.xlsx');
        } catch { // spreadsheet library unavailable (offline): fall back to a CSV
        const csv = [HEADERS, ...examples].map((r) => r.map((v) => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\r\n');
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })), download: 'forecastiq-template.csv' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
    }

    FIQ.sample = { loadDemo, downloadTemplate };
})();