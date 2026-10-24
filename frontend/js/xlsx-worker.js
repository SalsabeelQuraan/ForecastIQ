/* ForecastIQ · xlsx-worker.js — reads spreadsheets off the main thread.
 * The workbook is parsed ONCE per file and kept here until the file is closed. */
'use strict';
importScripts('vendor/xlsx.full.min.js');

const MAX_ROWS = 500000, MAX_COLS = 100, PREVIEW_ROWS = 20, CHUNK = 50000;
let wb = null;

const sheetOf = (name) => {
    const ws = wb && wb.Sheets[name || wb.SheetNames[0]];
    if (!ws) throw new Error('Sheet not found. Choose the file again.');
    return ws;
};

// Returns the used range, or throws if the sheet is empty or too big
const checked = (ws) => {
    if (!ws['!ref']) throw new Error('No data rows found in this sheet.');
    const r = XLSX.utils.decode_range(ws['!ref']);
    if (ws['!fullref'] || r.e.r - r.s.r + 1 > MAX_ROWS + 1)
        throw new Error(`This sheet has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Keep only the rows you need, or split the file.`);
    if (r.e.c - r.s.c + 1 > MAX_COLS) throw new Error(`This sheet has more than ${MAX_COLS} columns.`);
    return r;
};

const handlers = {
    open({ buffer, csv }) {
        const opts = { type: 'array', cellDates: false, dense: true, sheetRows: MAX_ROWS + 2 };
        if (csv) { opts.raw = true; opts.codepage = 65001; }
        wb = XLSX.read(new Uint8Array(buffer), opts);
        return { sheets: wb.SheetNames };
    },

    // First rows as display text (raw:false), for the preview table
    preview({ sheet }) {
        const ws = sheetOf(sheet), r = checked(ws);
        const top = XLSX.utils.sheet_to_json(ws, {
            header: 1, defval: '', raw: false, blankrows: false,
            range: { s: r.s, e: { r: Math.min(r.e.r, r.s.r + PREVIEW_ROWS), c: r.e.c } },
        });
        if (top.length < 2) throw new Error('No data rows found in this sheet.');
        return { headers: top[0], rows: top.slice(1), totalRows: r.e.r - r.s.r };
    },

    // Header row with raw values (used to find the mapped columns)
    header({ sheet }) {
        const ws = sheetOf(sheet), r = checked(ws);
        const top = XLSX.utils.sheet_to_json(ws, {
            header: 1, defval: null, raw: true, blankrows: false,
            range: { s: r.s, e: { r: r.s.r, c: r.e.c } },
        });
        return { name: sheet || wb.SheetNames[0], header: top[0] || [] };
    },

    // Data rows, ONLY the requested columns (cols = indexes, -1 = not mapped), read in chunks to keep memory low
    rows({ sheet, cols }) {
        const ws = sheetOf(sheet), r = checked(ws), out = [];
        for (let r0 = r.s.r + 1; r0 <= r.e.r; r0 += CHUNK) {
            const part = XLSX.utils.sheet_to_json(ws, {
                header: 1, defval: null, raw: true, blankrows: false,
                range: { s: { r: r0, c: r.s.c }, e: { r: Math.min(r0 + CHUNK - 1, r.e.r), c: r.e.c } },
            });
            for (const row of part) out.push(cols.map((c) => (c < 0 ? null : row[c] ?? null)));
        }
        return out;
    },
};

self.onmessage = (e) => {
    const { id, type, ...args } = e.data;
    try {
        if (!Object.prototype.hasOwnProperty.call(handlers, type)) throw new Error('Unknown task.');
        self.postMessage({ id, ok: true, data: handlers[type](args) });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};