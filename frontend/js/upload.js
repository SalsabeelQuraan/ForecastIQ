/* ForecastIQ · upload.js
 * Upload zone + progress + errors + 20-row preview + Column Mapping.
 * Add to data-model.html AFTER data.js:  <script src="js/upload.js" defer></script>
 *
 * Backend upload (optional): nothing is sent anywhere while reading the file or showing the preview.
 * Only after "Confirm mapping & analyze", and only if a valid backend URL is set in Settings,
 * the user is asked once more before the file is sent. Needs FIQ.apiBase() from data.js.
 */
(() => {
    'use strict';
    if (document.body.dataset.page !== 'data-model') return;

    const MAX_MB = 25;
    const EXTS = ['xlsx', 'xls', 'csv'];
    const PREVIEW_ROWS = 20;
    const UPLOAD_TIMEOUT_MS = 120000;

    // Fields the dashboard needs. `type` is used to sanity-check the mapped column.
    const FIELDS = [
        { key: 'date',     label: 'Date',            type: 'date',   required: true,  hints: ['date', 'order date', 'invoice date', 'تاريخ'] },
        { key: 'product',  label: 'Product / SKU',   type: 'text',   required: true,  hints: ['product', 'sku', 'item', 'product name', 'منتج'] },
        { key: 'quantity', label: 'Quantity',        type: 'number', required: true,  hints: ['quantity', 'qty', 'units', 'كمية'] },
        { key: 'sales',    label: 'Sales / Revenue', type: 'number', required: true,  hints: ['sales', 'revenue', 'amount', 'total', 'مبيعات'] },
        { key: 'category', label: 'Category',        type: 'text',   required: false, hints: ['category', 'sub-category', 'فئة'] },
        { key: 'region',   label: 'Region',          type: 'text',   required: false, hints: ['region', 'state', 'city', 'منطقة'] },
        { key: 'stock',    label: 'Current stock',   type: 'number', required: false, hints: ['stock', 'inventory', 'on hand', 'مخزون'] },
    ];

    const state = { file: null, sheets: [], sheet: null, headers: [], rows: [], truncated: false, totalRows: null, mapping: {}, dateOrder: 'auto' };
    let loadId = 0; // guards against two files being handled at once

    /* ---------- helpers ---------- */
    const $ = (id) => document.getElementById(id);
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    // Validated backend URL (see FIQ.apiBase in data.js). '' = local mode. A bad URL is reported, never used.
    let apiError = '';
    const apiBase = () => {
        apiError = '';
        if (!window.FIQ || !FIQ.apiBase) return '';
        try { return FIQ.apiBase(); } catch (e) { apiError = e.message; return ''; }
    };
    const apiToken = () => ((window.FIQ && FIQ.settings().apiToken) || '').trim();

    // The server decides what a dataset id looks like; only accept a plain token before putting it in a URL
    const safeId = (v) => ((typeof v === 'string' || typeof v === 'number') && /^[\w-]{1,64}$/.test(String(v)) ? String(v) : null);

    // FastAPI 422 errors give `detail` as an array of objects, not a string
    const detailText = (d, fallback) => Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join('; ') : (typeof d === 'string' ? d : fallback);

    function validateFile(f) {
        const ext = f.name.split('.').pop().toLowerCase();
        if (ext === 'xlsm') return 'Macro-enabled files (.xlsm) are not supported. Save as .xlsx first.';
        if (!EXTS.includes(ext)) return `Unsupported file type ".${ext}". Use .xlsx, .xls or .csv.`;
        if (f.size === 0) return 'The file is empty.';
        if (f.size > MAX_MB * 1024 * 1024) return `File is too large (max ${MAX_MB} MB).`;
        return null;
    }

    /* ---------- UI shell ---------- */
    function build() {
        const s = el('section', 'mb-space-lg flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm');
        s.id = 'upload-section';
        s.innerHTML = `
        <div>
            <h2 class="text-headline-sm">Upload your data</h2>
            <p class="text-body-sm text-on-surface-variant">Drop an Excel or CSV file (.xlsx, .xls, .csv — up to ${MAX_MB} MB). Each row should be one sale.</p>
            <p class="text-body-sm text-on-surface-variant">Your data is stored only in this browser and deleted automatically (see Settings → Data retention). You can remove it any time in "Current dataset" below.</p>
            <div class="mt-space-sm flex flex-wrap gap-space-sm">
                <button type="button" data-action="download-template" class="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-md py-space-xs text-label-md hover:bg-surface-container-high"><span class="material-symbols-outlined text-[18px] text-primary">download</span>Download Excel template</button>
                <button type="button" data-action="load-demo" class="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-md py-space-xs text-label-md hover:bg-surface-container-high"><span class="material-symbols-outlined text-[18px] text-primary">science</span>Use demo data</button>
            </div>
        </div>
        <div id="up-error" hidden role="alert" class="rounded-lg bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container"></div>
        <label id="up-drop" for="up-input" class="flex cursor-pointer flex-col items-center justify-center gap-space-xs rounded-xl border-2 border-dashed border-outline-variant px-space-lg py-10 text-center transition-colors hover:bg-surface-container-low">
            <span class="material-symbols-outlined text-[36px] text-primary">upload_file</span>
            <span class="text-label-md">Drag &amp; drop a file here, or click to browse</span>
            <span id="up-filename" class="text-body-sm text-on-surface-variant"></span>
            <input id="up-input" type="file" accept=".xlsx,.xls,.csv" class="sr-only" />
        </label>
        <div id="up-progress" hidden>
            <div class="mb-1 flex justify-between text-body-sm"><span id="up-status">Uploading…</span><span id="up-pct">0%</span></div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-surface-container-low"><div id="up-bar" class="h-full w-0 bg-primary transition-all"></div></div>
        </div>
        <div id="up-preview" hidden class="flex flex-col gap-space-sm"></div>
        <div id="up-mapping" hidden class="flex flex-col gap-space-sm"></div>`;
        return s;
    }

    function showError(msg) { const e = $('up-error'); e.textContent = msg; e.hidden = !msg; }
    function setProgress(pct, label) {
        $('up-progress').hidden = pct == null;
        if (pct == null) return;
        $('up-bar').style.width = pct + '%';
        $('up-pct').textContent = Math.round(pct) + '%';
        if (label) $('up-status').textContent = label;
    }

    /* ---------- parsing (local preview) ---------- */
    async function parseLocal(file, sheetName) {
        if (!window.FIQ || !FIQ.xlsx) throw new Error('js/xlsx-client.js did not load.');
        if (!sheetName || !FIQ.xlsx.isOpen()) state.sheets = (await FIQ.xlsx.open(file)).sheets;
        state.sheet = sheetName && state.sheets.includes(sheetName) ? sheetName : state.sheets[0];
        const p = await FIQ.xlsx.preview(state.sheet); // switching sheets reuses the parsed workbook
        const headers = p.headers.map((h, i) => String(h).trim() || `Column ${i + 1}`);
        if (new Set(headers).size !== headers.length) throw new Error('Duplicate column names found in the header row.');
        state.headers = headers;
        state.rows = p.rows;
        state.totalRows = p.totalRows;
        state.truncated = false;
    }

    /* ---------- upload to backend (only after the user confirmed the mapping and agreed) ---------- */
    function sendToBackend(file, sheet, base) {
        return new Promise((resolve) => {
            const fd = new FormData();
            fd.append('file', file);
            if (sheet) fd.append('sheet', sheet);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', base + '/upload');
            xhr.withCredentials = false; // never send cookies to the backend
            xhr.timeout = UPLOAD_TIMEOUT_MS;
            // A custom header also forces a CORS preflight, so other websites cannot post files here "blindly"
            const token = apiToken();
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.upload.onprogress = (e) => e.lengthComputable && setProgress((e.loaded / e.total) * 100, 'Uploading…');
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve({ ok: true, data: JSON.parse(xhr.responseText) }); }
                    catch { resolve({ ok: false, msg: 'Server returned an invalid response.' }); }
                } else {
                    let msg = xhr.status === 401 || xhr.status === 403
                        ? `The backend rejected the upload (${xhr.status}). Check the API token in Settings.`
                        : `Upload failed (${xhr.status}).`;
                    try { msg = detailText(JSON.parse(xhr.responseText).detail, msg); } catch (_) { /* ignore */ }
                    resolve({ ok: false, msg });
                }
            };
            xhr.onerror = () => resolve({ ok: false, msg: `Cannot reach the backend at ${base}.` });
            xhr.ontimeout = () => resolve({ ok: false, msg: 'The backend did not answer in time.' });
            xhr.send(fd);
        });
    }

    // Returns a warning text if something went wrong, or '' (also when nothing was uploaded). Never throws.
    async function uploadToBackend(file, sheet, mapping) {
        const base = apiBase();
        if (!base) return apiError ? `Analyzed locally. The file was not uploaded: ${apiError}` : ''; // no URL = local mode
        if (!confirm(`Also send "${file.name}" to ${new URL(base).host}?\n\nThe analysis already works in your browser without this.`)) return '';

        setProgress(0, 'Uploading…');
        const res = await sendToBackend(file, sheet, base);
        if (!res.ok) { setProgress(null); return `Analyzed locally, but the upload failed: ${res.msg}`; }
        setProgress(100, 'Uploaded');
        setTimeout(() => setProgress(null), 800);

        const id = safeId(res.data && res.data.dataset_id);
        if (!id) return '';
        const headers = { 'Content-Type': 'application/json' };
        const token = apiToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        try {
            const r = await fetch(`${base}/mapping/${encodeURIComponent(id)}`, { method: 'POST', headers, credentials: 'omit', body: JSON.stringify(mapping) });
            if (!r.ok) return `File uploaded, but saving the column mapping on the server failed (${r.status}).`;
        } catch { return 'File uploaded, but saving the column mapping on the server failed.'; }
        return '';
    }

    /* ---------- flow ---------- */
    async function handleFile(file, sheetName) {
        const id = ++loadId;
        showError('');
        $('up-preview').hidden = true;
        $('up-mapping').hidden = true;
        const err = validateFile(file);
        if (err) return showError(err);
        state.file = file;
        state.mapping = {}; // a new file or sheet must be guessed again
        $('up-filename').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
        try {
            setProgress(5, 'Reading file…');
            await parseLocal(file, sheetName);
        } catch (e) { if (id !== loadId) return; setProgress(null); return showError(e.message || 'Could not read this file.'); }
        if (id !== loadId) return; // a newer file replaced this one

        setProgress(null);
        renderPreview();
        renderMapping();
        // Nothing is uploaded here: the file only leaves the browser after "Confirm mapping & analyze" + an explicit OK.
    }

    function renderPreview() {
        const box = $('up-preview');
        box.hidden = false;
        box.replaceChildren();
        const head = el('div', 'flex flex-wrap items-center justify-between gap-space-sm');
        head.append(el('h3', 'text-headline-sm', `Preview (first ${state.rows.length} rows)`));
        const meta = el('div', 'flex items-center gap-space-sm text-body-sm text-on-surface-variant');
        meta.append(el('span', '', `${state.headers.length} columns · ${state.truncated ? '1000+' : state.totalRows} rows`));
        if (state.sheets.length > 1) {
            const sel = el('select', 'rounded-lg bg-surface-container-low px-2 py-1 text-label-md');
            state.sheets.forEach((n) => { const o = el('option', '', n); o.value = n; o.selected = n === state.sheet; sel.append(o); });
            sel.onchange = () => handleFile(state.file, sel.value);
            meta.prepend(sel);
        }
        head.append(meta);
        box.append(head);

        const wrap = el('div', 'overflow-x-auto rounded-lg border border-surface-container-low');
        const t = el('table', 'w-full min-w-[600px] border-collapse text-left text-body-sm');
        const thead = el('thead', 'bg-surface-container-low text-label-sm uppercase tracking-wider text-outline');
        const hr = el('tr');
        state.headers.forEach((h) => hr.append(el('th', 'px-3 py-2 whitespace-nowrap', h)));
        thead.append(hr);
        const tbody = el('tbody', 'divide-y divide-surface-container-low');
        state.rows.forEach((r) => {
            const tr = el('tr');
            state.headers.forEach((_, i) => tr.append(el('td', 'px-3 py-2 whitespace-nowrap', r[i] ?? '')));
            tbody.append(tr);
        });
        t.append(thead, tbody);
        wrap.append(t);
        box.append(wrap);
    }

    /* ---------- column mapping ---------- */
    function guess(field) {
        const norm = (s) => s.toLowerCase().replace(/[_\-]/g, ' ').trim();
        const hs = state.headers.map(norm);
        for (const hint of field.hints) { const i = hs.indexOf(hint); if (i > -1) return state.headers[i]; }
        for (const hint of field.hints) { const i = hs.findIndex((h) => h.includes(hint)); if (i > -1) return state.headers[i]; }
        return '';
    }

    // Uses the same parsers as the import (FIQ.num / FIQ.toDay) and tolerates a few bad cells
    function checkColumn(field, header) {
        if (!window.FIQ) return null;
        const i = state.headers.indexOf(header);
        const vals = state.rows.map((r) => r[i]).filter((v) => v !== '' && v != null);
        if (!vals.length) return `"${header}" has no values in the preview.`;
        if (field.type !== 'number' && field.type !== 'date') return null;
        const valid = vals.filter((v) => field.type === 'number'
            ? !isNaN(FIQ.num(v))
            : !isNaN(FIQ.toDay(v, 'mdy')) || !isNaN(FIQ.toDay(v, 'dmy'))).length;
        if (valid / vals.length < 0.8) {
            return field.type === 'number'
                ? `"${header}" does not look numeric (${valid} of ${vals.length} preview values are valid).`
                : `"${header}" does not look like dates (${valid} of ${vals.length} preview values are valid).`;
        }
        return null;
    }

    // True when every slash date could be read as both D/M and M/D
    function dateIsAmbiguous(header) {
        const i = state.headers.indexOf(header);
        let slash = false, dmy = false, mdy = false;
        for (const r of state.rows) {
            const m = String(r[i] ?? '').trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/);
            if (!m) continue;
            slash = true;
            if (+m[1] > 12) dmy = true;
            if (+m[2] > 12) mdy = true;
        }
        return slash && !dmy && !mdy;
    }

    function renderMapping() {
        const box = $('up-mapping');
        box.hidden = false;
        box.replaceChildren();
        box.append(el('h3', 'text-headline-sm', 'Map your columns'));
        box.append(el('p', 'text-body-sm text-on-surface-variant', 'Tell ForecastIQ which column is which. Required fields are marked *. Matches were guessed from the column names — please check them.'));
        const grid = el('div', 'grid gap-space-md sm:grid-cols-2');
        const selects = {};
        FIELDS.forEach((f) => {
            const lab = el('label', 'flex flex-col gap-1 text-label-md', f.label + (f.required ? ' *' : ''));
            const sel = el('select', 'rounded-lg bg-surface-container-low px-3 py-2 text-body-md');
            const none = el('option', '', f.required ? '— choose a column —' : '— not available —');
            none.value = '';
            sel.append(none);
            state.headers.forEach((h) => { const o = el('option', '', h); o.value = h; sel.append(o); });
            sel.value = state.mapping[f.key] ?? guess(f);
            sel.onchange = () => { state.mapping[f.key] = sel.value; };
            selects[f.key] = sel;
            lab.append(sel);
            grid.append(lab);
        });

        const dfLab = el('label', 'flex flex-col gap-1 text-label-md', 'Date format (for text dates like 05/01/2026)');
        const dfSel = el('select', 'rounded-lg bg-surface-container-low px-3 py-2 text-body-md');
        [['auto', 'Auto-detect'], ['dmy', 'Day / Month / Year'], ['mdy', 'Month / Day / Year']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; dfSel.append(o); });
        dfSel.value = state.dateOrder;
        dfSel.onchange = () => { state.dateOrder = dfSel.value; };
        dfLab.append(dfSel);
        grid.append(dfLab);
        box.append(grid);

        const ERR = 'rounded-lg bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container';
        const WARN = 'rounded-lg bg-secondary-container px-space-md py-space-sm text-body-sm text-on-secondary-container';
        const msg = el('div', 'hidden ' + ERR);
        msg.setAttribute('role', 'alert');
        const setMsg = (text, warn) => { msg.className = text ? (warn ? WARN : ERR) : 'hidden ' + ERR; msg.textContent = text || ''; };

        const btn = el('button', 'self-end rounded-lg bg-primary px-space-lg py-space-sm text-label-md text-on-primary shadow-sm hover:bg-primary-container', 'Confirm mapping & analyze');
        btn.type = 'button';
        btn.onclick = async () => {
            const mapping = {}, errors = [];
            FIELDS.forEach((f) => {
                const v = selects[f.key].value;
                if (!v) { if (f.required) errors.push(`${f.label} is required.`); return; }
                mapping[f.key] = v;
                const bad = checkColumn(f, v);
                if (bad) errors.push(bad);
            });
            const used = Object.values(mapping);
            if (new Set(used).size !== used.length) errors.push('The same column is mapped to more than one field.');
            if (dfSel.value === 'auto' && mapping.date && dateIsAmbiguous(mapping.date)) {
                errors.push('Dates like 05/01/2026 can be read two ways. Choose "Day / Month / Year" or "Month / Day / Year" in "Date format", then confirm again.');
            }
            setMsg(errors.join(' '));
            if (errors.length) return;
            if (window.FIQ && FIQ.meta() && !confirm('This replaces the dataset currently stored in this browser. Continue?')) return;

            const file = state.file, sheet = state.sheet; // keep these even if another file is picked while we work
            Object.assign(state.mapping, mapping);
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                if (!window.FIQ) throw new Error('js/data.js did not load.');
                btn.textContent = 'Analyzing…';
                if (!FIQ.xlsx.isOpen()) await FIQ.xlsx.open(file);
                const meta = await FIQ.ingest({ file, sheet, mapping, dateOrder: dfSel.value });
                FIQ.xlsx.close();
                const done = `Analyzed ${meta.rows.toLocaleString('en-US')} rows ✓` + (meta.skipped ? ` (${meta.skipped} invalid rows skipped)` : '');
                btn.textContent = done;
                if (!box.querySelector('a')) { const go = el('a', 'self-end text-label-md text-primary underline', 'Open Overview →'); go.href = 'overview.html'; btn.after(go); }

                const notes = [];
                if (meta.skippedRows?.length) notes.push('Skipped rows (first 20): ' + meta.skippedRows.map((x) => `#${x.row} (${x.why})`).join(', ') + '.');
                if (meta.dateAmbiguous) notes.push('Some dates like 05/01/2026 can be read two ways, and were read as Month/Day. If your file uses Day/Month, choose it in "Date format" and analyze again.');

                btn.disabled = false;
                if (notes.length) setMsg(notes.join(' '), true);
            } catch (e) {
                setMsg(e.message);
                btn.disabled = false;
                btn.textContent = 'Confirm mapping & analyze';
            }
        };
        box.append(msg, btn);
    }

    /* ---------- mount ---------- */
    let windowGuard = false;
    function wire(section) {
        const drop = section.querySelector('#up-drop'), input = section.querySelector('#up-input');
        input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) handleFile(f); }; // reset so the same file can be picked again
        ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('bg-surface-container-low'); }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('bg-surface-container-low'); }));
        drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
        if (!windowGuard) { // a file dropped outside the zone must not make the browser open it
            windowGuard = true;
            ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));
        }
    }

    function mount() {
        const app = $('app');
        if (!app || $('upload-section')) return;
        const s = build();
        app.prepend(s);
        wire(s);
        if (state.file) { $('up-filename').textContent = state.file.name; if (state.headers.length) { renderPreview(); renderMapping(); } }
    }

    document.addEventListener('DOMContentLoaded', () => {
        mount();
        const app = $('app');
        if (app) new MutationObserver(mount).observe(app, { childList: true }); // re-mount if pages.js re-renders
    });
})();