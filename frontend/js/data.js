/* ForecastIQ · data.js — storage, Excel ingestion, analytics, forecast, UI helpers → window.FIQ */
(() => {
    'use strict';
    const DAY = 864e5, SKEY = 'forecastiq.settings';
    // reorderCheck / retrainSchedule / alertDigest were removed: nothing used them (remove their fields from settings.html too)
    const DEFAULTS = {
        horizon: '30', granularity: 'weekly', confidence: '95', retention: '7', safetyDays: 7, leadDays: 7, leadBuffer: 2, autoApproveLimit: 5000,
        orderCoverDays: 30, stockMaxAgeDays: 30, alertCritical: true, alertLow: true, alertDrift: true, currency: 'USD',
    };
    const FIQ = (window.FIQ = { DEFAULTS, DAY });
    FIQ.MIN_DAY = Date.UTC(1990, 0, 1);
    FIQ.MAX_DAY = Date.UTC(2100, 11, 31);

    FIQ.ENUM = {
        horizon: ['7', '30', '90', '365'],
        granularity: ['daily', 'weekly', 'monthly'],
        confidence: ['80', '95', '99'],
        retention: ['session', '1', '7', '30'],
    };

    FIQ.settings = () => {
        let raw = {};
        try { raw = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch { raw = {}; }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};

        const s = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS)) {
            if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
            const d = DEFAULTS[k], v = raw[k];
            if (typeof d === 'number') {
                const ok = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
                    && Number.isFinite(+v) && +v >= 0;
                if (ok) s[k] = +v; // always a real number
            } else if (typeof d === 'boolean') {
                if (typeof v === 'boolean') s[k] = v;
            } else if (typeof v === 'string' || typeof v === 'number') {
                const str = String(v);
                if (FIQ.ENUM[k]) { if (FIQ.ENUM[k].includes(str)) s[k] = str; }
                else s[k] = str;
            }
        }
        return s;
    };
    FIQ.saveSettings = (s) => localStorage.setItem(SKEY, JSON.stringify(s));
    const validMeta = (m) => !!m && typeof m === 'object' && !Array.isArray(m)
    && typeof m.name === 'string' && Number.isFinite(m.rows) && Number.isFinite(m.loadedAt)
    && Number.isFinite(m.from) && Number.isFinite(m.to);

    FIQ.meta = () => {
        let raw, m;
        try { raw = localStorage.getItem('forecastiq.meta'); } catch { return null; }
        if (raw == null) return null;
        try { m = JSON.parse(raw); } catch { m = null; }
        if (!validMeta(m) || expired(m)) { FIQ.purge(); return null; } // corrupted or expired: delete and behave as "no dataset"
        return m;
    };
    FIQ.GRAIN = { daily: 'day', weekly: 'week', monthly: 'month' };
    FIQ.SCENARIO = { baseline: 1, promo: 1.15, supply_shock: 0.8 };
    FIQ.periods = (h, g) => (g === 'day' ? h : g === 'week' ? Math.ceil(h / 7) : Math.max(1, Math.ceil(h / 30)));

    /* ---------- IndexedDB (rows can be too big for localStorage) ---------- */
    const idb = (mode, fn) => new Promise((res, rej) => {
        const o = indexedDB.open('forecastiq', 1);
        o.onupgradeneeded = () => o.result.createObjectStore('kv');
        o.onerror = () => rej(o.error);
        o.onsuccess = () => {
            const tx = o.result.transaction('kv', mode);
            const r = fn(tx.objectStore('kv'));
            tx.oncomplete = () => { o.result.close(); res(r && r.result); };
            tx.onerror = () => { o.result.close(); rej(tx.error); };
        };
    });
    let cache = null;
    const changed = (detail) => document.dispatchEvent(new CustomEvent('fiq:data-changed', { detail }));

    const SESSION_KEY = 'forecastiq.session';
    const LOCAL_KEYS = ['forecastiq.meta', 'forecastiq.mapping']; // everything we keep about a dataset in localStorage
    const wipeLocal = () => {
        for (const k of LOCAL_KEYS) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    };

    // Uploaded data is deleted automatically (Settings → Data retention). Demo data is synthetic, so it is exempt.
    const expired = (m) => {
        if (!m || m.demo) return false;
        const r = FIQ.settings().retention;
        if (r === 'session') { try { return !sessionStorage.getItem(SESSION_KEY); } catch { return true; } }
        return !(Date.now() - (m.loadedAt || 0) <= (+r || 7) * DAY);
    };

    // Quiet delete (expiry, corrupted data). FIQ.clear below stays loud, so the user knows if "Remove dataset" failed.
    FIQ.purge = async () => {
        wipeLocal();
        cache = [];
        try { await idb('readwrite', (s) => s.delete('rows')); } catch { /* ignore */ }
        changed(null);
    };

    FIQ.retentionText = (m) => {
        if (!m || m.demo) return 'Never (demo data)';
        const r = FIQ.settings().retention;
        return r === 'session' ? 'When you close this tab' : FIQ.fmt.date(m.loadedAt + (+r || 7) * DAY);
    };

    /* ---------- validation of everything read back from the browser's storage ---------- */
    const fin = Number.isFinite; // unlike isNaN, it does NOT convert: '5' and Infinity are rejected
    const validRow = (a) => Array.isArray(a) && a.length >= 7
        && fin(a[0]) && a[0] >= FIQ.MIN_DAY && a[0] <= FIQ.MAX_DAY
        && typeof a[1] === 'string' && fin(a[2]) && fin(a[3])
        && typeof a[4] === 'string' && typeof a[5] === 'string'
        && (a[6] === null || fin(a[6]));

    FIQ.load = async () => {
        if (cache) return cache;
        if (!FIQ.meta()) return (cache = []); // no dataset, or it just expired / was invalid and got deleted
        let raw = null;
        try { raw = await idb('readonly', (s) => s.get('rows')); } catch { return (cache = []); }

        const rows = [];
        if (Array.isArray(raw)) for (const a of raw) if (validRow(a)) rows.push({ d: a[0], p: a[1], q: a[2], s: a[3], c: a[4], r: a[5], st: a[6] });
        if (!rows.length) { FIQ.purge(); return (cache = []); } // metadata without usable rows = corrupted: start clean
        const dropped = raw.length - rows.length;
        if (dropped) console.warn(`ForecastIQ: ignored ${dropped} stored rows with invalid values.`);
        return (cache = rows);
    };

    FIQ.clear = async () => {
        await idb('readwrite', (s) => s.delete('rows')); // if this fails the caller sees the error
        wipeLocal();
        cache = [];
        changed(null);
    };

    FIQ.store = async (out, meta) => { // shared by file upload and demo data
        try {
            await idb('readwrite', (s) => s.put(out, 'rows'));
            localStorage.setItem('forecastiq.meta', JSON.stringify(meta));
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
        } catch {
            FIQ.purge(); // never leave rows behind without their metadata
            throw new Error('Could not store the data in this browser (private mode or storage full).');
        }
        cache = null;
        changed(meta);
        return meta;
    };

    /* ---------- demo data + template (code lives in sample.js, loaded on demand) ---------- */
    const scripts = {};
    FIQ.useScript = (src) => (scripts[src] || (scripts[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => { delete scripts[src]; s.remove(); rej(new Error('Could not load ' + src)); };
        document.head.append(s);
    })));
    FIQ.loadDemo = async () => { await FIQ.useScript('js/sample.js'); return FIQ.sample.loadDemo(); };
    FIQ.downloadTemplate = async () => { await FIQ.useScript('js/sample.js'); return FIQ.sample.downloadTemplate(); };

    // Any element with data-action="load-demo" or "download-template" works on every page.
    // Optional data-then="page.html" says where to go after loading the demo (default: reload).
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b || b.disabled) return;
        const a = b.dataset.action;
        if (a !== 'load-demo' && a !== 'download-template') return;
        e.preventDefault();
        if (a === 'load-demo' && FIQ.meta() && !confirm('Demo data will replace the dataset stored in this browser. Continue?')) return;

        const label = b.innerHTML;
        let leaving = false, failed = false;
        b.disabled = true;
        try {
            if (a === 'load-demo') {
                b.textContent = 'Loading demo…';
                await FIQ.loadDemo();
                leaving = true;
                if (b.dataset.then) location.href = b.dataset.then; else location.reload();
                return;
            }
            await FIQ.downloadTemplate();
        } catch (err) {
            console.error(err);
            failed = true;
            b.textContent = 'Failed. Try again';
            setTimeout(() => (b.innerHTML = label), 2500);
        } finally {
            if (!leaving) { b.disabled = false; if (!failed) b.innerHTML = label; }
        }
    });

    /* ---------- Excel / CSV ingestion ---------- */
    let xl;
    FIQ.loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : (xl || (xl = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/xlsx.full.min.js';
        s.onload = () => res(window.XLSX);
        s.onerror = () => { xl = undefined; s.remove(); rej(new Error('Could not load the spreadsheet reader.')); };
        document.head.append(s);
    })));

    // Parses numbers like 1,234.56 | 1.234,56 | 12,5 | 0,500 | 1.234.567 | (12.50) | -5 | JOD 10
    const num = (v) => {
        if (typeof v === 'number') return v;
        if (v == null || v === '') return NaN;
        let s = String(v).replace(/[\s\u00a0\p{Sc}]|\b(?:JOD|USD|EUR|GBP|SAR|AED|KWD)\b|د\.أ|ر\.س/giu, '');
        let neg = false;
        const p = s.match(/^\((.*)\)$/);
        if (p) { neg = true; s = p[1]; }
        if (s[0] === '-') { neg = true; s = s.slice(1); }
        if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;

        const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
        if (dots && commas) { // the last separator is the decimal one
            const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
            s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
        } else if (commas > 1 || dots > 1) { // 1.234.567 or 1,234,567
            s = s.replace(/[.,]/g, '');
        } else if (commas === 1) {
            const [a, b] = s.split(',');
            s = (b.length === 3 && a !== '0' && a.length <= 3) ? a + b : a + '.' + b; // 1,234 = thousand | 0,500 and 12,5 = decimal
        }
        const n = Number(s);
        return neg ? -n : n;
    };

    const startDay = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
    const validYMD = (y, mo, d) => { // rejects 31/02 and 2026-13-45 instead of rolling over
        const t = Date.UTC(y, mo - 1, d), x = new Date(t);
        return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? t : NaN;
    };
    const toDay = (v, order = 'mdy') => {
        if (v instanceof Date) return isNaN(v) ? NaN : Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
        if (typeof v === 'number') {
            if (v > 20000 && v < 80000) return Math.floor(v - 25569) * DAY; // Excel serial
            if (v >= 19000101 && v <= 21001231) return validYMD(Math.floor(v / 1e4), Math.floor(v / 100) % 100, v % 100); // yyyymmdd
            if (v >= 1e9 && v < 1e11) return startDay(v * 1000); // Unix seconds
            if (v >= 1e12 && v < 1e14) return startDay(v); // Unix milliseconds
            return NaN;
        }
        const s = String(v ?? '').trim();
        let m;
        if (/^\d+$/.test(s)) return toDay(Number(s), order);
        if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return validYMD(+m[1], +m[2], +m[3]);
        if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) {
            const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
            const [d, mo] = order === 'dmy' ? [+m[1], +m[2]] : [+m[2], +m[1]];
            return validYMD(y, mo, d);
        }
        const t = Date.parse(s);
        if (isNaN(t)) return NaN;
        const d = new Date(t);
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    };
    FIQ.num = num;
    FIQ.toDay = toDay;
    FIQ.normHeaders = (arr) => {
        const seen = new Map();
        return arr.map((h, i) => {
            const base = String(h ?? '').trim() || `Column ${i + 1}`, c = (seen.get(base) || 0) + 1;
            seen.set(base, c);
            return c > 1 ? `${base}_${c}` : base;
        });
    };

    FIQ.ingest = async ({ file, sheet, mapping, dateOrder = 'auto' }) => {
        if (!FIQ.xlsx) throw new Error('js/xlsx-client.js did not load.');
        // The file was already parsed (once) in a worker when it was previewed; here we only ask for the mapped columns.
        const { name, header } = await FIQ.xlsx.header(sheet);
        const headers = FIQ.normHeaders(header), ix = (k) => (mapping[k] ? headers.indexOf(mapping[k]) : -1);
        const I = { d: ix('date'), p: ix('product'), q: ix('quantity'), s: ix('sales'), c: ix('category'), r: ix('region'), st: ix('stock') };
        if ([I.d, I.p, I.q, I.s].some((i) => i < 0)) throw new Error('A mapped column was not found in the file. Re-upload and map the columns again.');

        // each row: [date, product, quantity, sales, category, region, stock]
        const data = await FIQ.xlsx.rows(name, [I.d, I.p, I.q, I.s, I.c, I.r, I.st]);
        if (!data.length) throw new Error('No data rows found in this sheet.');

        let order = dateOrder, ambiguous = false;
        if (order === 'auto') { // read DD/MM or MM/DD from the data itself
            let dmy = false, mdy = false, slash = false;
            for (const r of data) {
                const v = r[0];
                if (typeof v !== 'string') continue;
                const m = v.trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/);
                if (!m) continue;
                slash = true;
                if (+m[1] > 12) dmy = true;
                if (+m[2] > 12) mdy = true;
            }
            order = dmy && !mdy ? 'dmy' : 'mdy';
            ambiguous = slash && !dmy && !mdy;
        }

        const out = [], skippedRows = [], t0 = Date.now();
        let skipped = 0, from = Infinity, to = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (i % 20000 === 19999) { // let the page breathe, and stop a job that runs too long
                await new Promise((r) => setTimeout(r));
                if (Date.now() - t0 > 30000) throw new Error('Processing took too long. Try a smaller file.');
            }
            const r = data[i], d = toDay(r[0], order), q = num(r[2]), s = num(r[3]), p = r[1];
            const badDate = !(d >= FIQ.MIN_DAY && d <= FIQ.MAX_DAY); // also true for NaN
            if (badDate || !Number.isFinite(q) || !Number.isFinite(s) || p == null || p === '') {
                skipped++;
                if (skippedRows.length < 20) skippedRows.push({ row: i + 2, why: badDate ? 'date' : !Number.isFinite(q) ? 'quantity' : !Number.isFinite(s) ? 'sales' : 'product' });
                continue;
            }
            const st = I.st > -1 ? num(r[6]) : NaN;
                if (d < from) from = d;
                if (d > to) to = d;
                out.push([d, String(p).trim(), q, s, I.c > -1 ? String(r[4] ?? '').trim() || 'Uncategorized' : 'All products',
                    I.r > -1 ? String(r[5] ?? '').trim() || 'Unknown' : 'All regions', Number.isFinite(st) ? st : null]);
        }
        if (out.length < 10) throw new Error(`Only ${out.length} valid rows found. Check the column mapping (dates must be valid and between 1990 and 2100, numbers must be finite).`);
        return FIQ.store(out, {
            name: file.name, sheet: name, rows: out.length, skipped, skippedRows, from, to, mapping,
            loadedAt: Date.now(), dateOrder: order, dateAmbiguous: ambiguous,
        });
    };

    /* ---------- aggregation ---------- */
    const startOf = (t, g) => {
        const d = new Date(t);
        d.setUTCHours(0, 0, 0, 0);
        if (g === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        else if (g === 'month') d.setUTCDate(1);
        return d.getTime();
    };
    const step = (t, g) => {
        const d = new Date(t);
        if (g === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
        else d.setUTCDate(d.getUTCDate() + (g === 'week' ? 7 : 1));
        return d.getTime();
    };
    FIQ.filter = (rows, f = {}) => rows.filter((x) => (!f.cat || f.cat === 'all' || x.c === f.cat) && (!f.reg || f.reg === 'all' || x.r === f.reg));
    FIQ.end = (rows) => rows.reduce((m, x) => (x.d > m ? x.d : m), 0);
    FIQ.sum = (rows, k = 's') => rows.reduce((a, x) => a + x[k], 0);
    FIQ.group = (rows, key) => {
        const m = new Map();
        for (const x of rows) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); }
        return m;
    };
    FIQ.growth = (rows, end) => { // last 30 days vs the 30 before
        const a = FIQ.sum(rows.filter((x) => x.d > end - 30 * DAY));
        const b = FIQ.sum(rows.filter((x) => x.d > end - 60 * DAY && x.d <= end - 30 * DAY));
        return b > 0 ? (a - b) / b : null;
    };
    // How many days ago the data ends (inventory and "last 30 days" are measured from the data's end, not from today)
    FIQ.dataAge = (rows) => (rows.length ? Math.floor((Date.now() - FIQ.end(rows)) / DAY) : null);

    // key: 's' = revenue, 'q' = units. Periods with no rows are flagged `gap`.
    FIQ.series = (rows, g, key = 's') => {
        if (!rows.length) return [];
        const m = new Map();
        for (const x of rows) { const k = startOf(x.d, g); m.set(k, (m.get(k) || 0) + x[key]); }
        let lo = Infinity, hi = -Infinity;
        for (const k of m.keys()) { if (k < lo) lo = k; if (k > hi) hi = k; }
        const out = [];
        for (let t = lo; t <= hi; t = step(t, g)) out.push({ t, v: m.get(t) || 0, gap: !m.has(t) });
        return out;
    };

    /* ---------- forecasting: damped additive Holt-Winters, tuned per dataset, with backtest ---------- */
    const Z = { 80: 1.2816, 95: 1.96, 99: 2.5758 };
    const PHI = 0.98; // trend damping: long horizons flatten instead of running away
    const GRID = { a: [0.1, 0.2, 0.3, 0.5, 0.7], b: [0.01, 0.05, 0.1], g: [0.05, 0.2, 0.4] };

    function hw(y, m, h, P) {
        const { a, b, g, phi } = P, n = y.length;
        let L, T, t0;
        const S = [];
        if (m) {
            const avg = (i, j) => y.slice(i, j).reduce((x, z) => x + z, 0) / (j - i);
            const base = avg(0, m);
            T = (avg(m, 2 * m) - base) / m;
            L = base + T * (m - 1) / 2; // level at the end of the first season
            for (let i = 0; i < m; i++) S[i] = y[i] - (base + T * (i - (m - 1) / 2));
            t0 = m; // the first season is only used for initialisation, not scored or re-processed
        } else {
            const k = Math.min(3, n - 1);
            L = y[0];
            T = k > 0 ? (y[k] - y[0]) / k : 0;
            t0 = 1;
        }
        const err = [];
        let sse = 0;
        for (let t = t0; t < n; t++) {
            const s = m ? S[t % m] : 0, f = L + phi * T + s, e = y[t] - f;
            err.push(e);
            sse += e * e;
            const L2 = a * (y[t] - s) + (1 - a) * (L + phi * T);
            T = b * (L2 - L) + (1 - b) * phi * T;
            if (m) S[t % m] = g * (y[t] - L2) + (1 - g) * s;
            L = L2;
        }
        const sigma = err.length ? Math.sqrt(sse / err.length) : 0;
        const fc = [], vm = []; // vm[k-1] = variance multiplier at horizon k (ETS(A,Ad,A) formula)
        let damp = 0, pw = 1, ph = 0, cum = 1;
        for (let k = 1; k <= h; k++) {
            pw *= phi;
            damp += pw;
            fc.push(Math.max(0, L + damp * T + (m ? S[(n + k - 1) % m] : 0)));
            if (k > 1) {
                const j = k - 1;
                ph += Math.pow(phi, j);
                const c = a * (1 + b * ph) + (m && j % m === 0 ? g * (1 - a) : 0);
                cum += c * c;
            }
            vm.push(cum);
        }
        return { fc, sigma, vm, sse, scored: err.length };
    }

    function fit(y, m) { // grid search on one-step in-sample error
        let best = null;
        for (const a of GRID.a) for (const b of GRID.b) for (const g of (m ? GRID.g : [0])) {
            const P = { a, b, g, phi: PHI }, r = hw(y, m, 0, P);
            if (r.scored && (!best || r.sse < best.sse)) best = { P, sse: r.sse };
        }
        return best ? best.P : { a: 0.3, b: 0.05, g: m ? 0.2 : 0, phi: PHI };
    }

    // Empty periods are treated as missing data (not as zero sales) and interpolated, except
    // short runs of empty days, which are real zero-sales days.
    const MIN_GAP = { day: 7, week: 1, month: 1 };
    function fillGaps(series, g) {
        const y = series.map((p) => p.v);
        let filled = 0, i = 0;
        while (i < series.length) {
            if (!series[i].gap) { i++; continue; }
            let j = i;
            while (j < series.length && series[j].gap) j++;
            const run = j - i;
            if (run >= MIN_GAP[g] && i > 0 && j < series.length) {
                const a = y[i - 1], b = y[j];
                for (let k = i; k < j; k++) y[k] = a + (b - a) * (k - i + 1) / (run + 1);
                filled += run;
            }
            i = j;
        }
        return { y, filled };
    }

    FIQ.SEASON = { day: 7, week: 52, month: 12 }; // weekly: 52 (a year is really 52.18 weeks; fine for 2-3 years of history)

    // key: 's' revenue (default) or 'q' units.
    // Partial first/last periods are judged against the WHOLE dataset, not the filtered rows.
    FIQ.forecast = (rows, g, h, conf = 95, factor = 1, key = 's') => {
        const base = cache && cache.length ? cache : rows;
        let lo = Infinity, hi = -Infinity;
        for (const x of base) { if (x.d < lo) lo = x.d; if (x.d > hi) hi = x.d; }

        let series = FIQ.series(rows, g, key), partialLast = null;
        if (g !== 'day' && series.length) {
            if (series[series.length - 1].t === startOf(hi, g) && hi < step(startOf(hi, g), g) - DAY) {
                partialLast = series[series.length - 1];
                series = series.slice(0, -1);
            }
            if (series.length && series[0].t === startOf(lo, g) && lo > startOf(lo, g)) series = series.slice(1);
        }
        const { y, filled } = fillGaps(series, g), n = y.length;
        if (n < 4) return null;

        const mFull = FIQ.SEASON[g], m = n >= 2 * mFull ? mFull : 0;
        const P = fit(y, m), full = hw(y, m, h, P);
        const z = Z[conf] ?? Z[95], confUsed = Z[conf] ? +conf : 95;
        let t = series[n - 1].t;
        const fc = full.fc.map((v, i) => {
            t = step(t, g);
            const w = z * full.sigma * Math.sqrt(full.vm[i]);
            return { t, v: v * factor, lo: Math.max(0, v - w) * factor, hi: (v + w) * factor, partial: i === 0 && !!partialLast };
        });

        let wape = null, rmse = null;
        const k = Math.min(Math.max(h, 4), Math.floor(n / 3));
        if (k >= 4 && n - k >= 4 && (m === 0 || n - k >= 2 * m)) { // hold out the last k periods; parameters are re-tuned on the training part only
            const train = y.slice(0, n - k), bt = hw(train, m, k, fit(train, m)), act = y.slice(n - k), e = act.map((a, i) => a - bt.fc[i]);
            rmse = Math.sqrt(e.reduce((a, b) => a + b * b, 0) / k);
            const den = act.reduce((a, b) => a + Math.abs(b), 0);
            wape = den > 0 ? e.reduce((a, b) => a + Math.abs(b), 0) / den : null; // WAPE: stable with zero or intermittent periods
        }
        return {
            series, fc, wape, rmse, m, n, holdout: k,
            filled, params: P, confUsed, partialActual: partialLast ? [{ t: partialLast.t, v: partialLast.v }] : [],
        };
    };

    // Ratio of expected demand (next `days`) to the last 4 complete weeks, from the weekly unit forecast. Clamped to 0.5–2.
    FIQ.demandFactor = (rows, days) => {
        const f = FIQ.forecast(rows, 'week', Math.max(1, Math.ceil(days / 7)), 95, 1, 'q');
        if (!f || f.n < 8) return 1;
        const recent = f.series.slice(-4).reduce((a, p) => a + p.v, 0) / 4;
        if (!(recent > 0)) return 1;
        const next = f.fc.reduce((a, p) => a + p.v, 0) / f.fc.length;
        return Math.min(2, Math.max(0.5, next / recent));
    };

    /* ---------- products & inventory ---------- */
    FIQ.products = (rows, set = FIQ.settings()) => {
        const n0 = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? d : Number(v));
        const end = FIQ.end(rows), res = [];
        const lead = n0(set.leadDays, 7) + n0(set.leadBuffer, 2), safety = n0(set.safetyDays, 7), cover30 = n0(set.orderCoverDays, 30);
        const maxAge = n0(set.stockMaxAgeDays, 30), limit = n0(set.autoApproveLimit, 5000);
        const factor = rows.length ? FIQ.demandFactor(rows, lead + safety + cover30) : 1;
        const critDays = Math.max(7, lead); // critical = stock-out before a new order could arrive

        for (const [p, xs] of FIQ.group(rows, 'p')) {
            const rev = FIQ.sum(xs), units = FIQ.sum(xs, 'q');
            const first = xs.reduce((m, x) => Math.min(m, x.d), Infinity);
            const win = Math.min(30, Math.max(7, Math.floor((end - first) / DAY) + 1)); // new products: shorter window, so demand is not diluted
            const r30 = xs.filter((x) => x.d > end - 30 * DAY), rWin = win === 30 ? r30 : xs.filter((x) => x.d > end - win * DAY);
            const daily = FIQ.sum(rWin, 'q') / win, dailyAdj = daily * factor;

            const r90 = xs.filter((x) => x.d > end - 90 * DAY), u90 = FIQ.sum(r90, 'q');
            const price = u90 > 0 ? FIQ.sum(r90) / u90 : units > 0 ? rev / units : 0; // recent price, not the all-time average

            const latest = new Map();
            for (const x of xs) if (x.st != null) { const l = latest.get(x.r); if (!l || x.d >= l.d) latest.set(x.r, x); }
            let stock = null, stale = false;
            if (latest.size) {
                const fresh = [...latest.values()].filter((x) => end - x.d <= maxAge * DAY);
                if (fresh.length) stock = fresh.reduce((a, x) => a + x.st, 0); else stale = true;
            }

            const cc = new Map();
            for (const x of xs) cc.set(x.c, (cc.get(x.c) || 0) + 1);
            const c = [...cc.entries()].sort((a, b) => b[1] - a[1])[0][0];

            const cover = stock != null && daily > 0 ? stock / daily : null, rop = dailyAdj * (lead + safety);
            const order = stock != null && stock <= rop ? Math.max(0, Math.ceil(dailyAdj * (lead + cover30 + safety) - stock)) : 0, po = order * price;
            const status = stock == null ? (stale ? 'stale' : 'unknown') : daily === 0 ? 'stagnant'
                : cover <= critDays ? 'critical' : (cover <= 14 || stock <= rop) ? 'low' : 'healthy';

            res.push({
                p, c, rev, units, sales30: FIQ.sum(r30), growth: FIQ.growth(xs, end), daily, stock, cover, rop, order, po,
                auto: po <= limit, status, demandFactor: factor, critDays,
            });
        }
        return res.sort((a, b) => b.rev - a.rev);
    };

    /* ---------- UI helpers ---------- */
    FIQ.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    FIQ.fmt = {
        compact: (v) => { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v) + ''; },
        // Fixed 'en-US' locale so digits match in every browser language (Arabic browsers would otherwise print Arabic-Indic digits).
        money: (v) => { const c = FIQ.settings().currency || 'USD'; if (!FIQ._mf || FIQ._mf.c !== c) { let f; try { f = new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }); } catch { f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); } FIQ._mf = { c, f }; } return FIQ._mf.f.format(Math.round(v)); },
        num: (v) => Math.round(v).toLocaleString('en-US'),
        pct: (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'),
        date: (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' }),
    };
    FIQ.badge = (s) => {
        const cls = { critical: 'bg-error-container text-on-error-container', low: 'bg-secondary-container text-on-secondary-container' }[s] || 'bg-surface-container-high text-on-surface';
        const label = { critical: 'Critical', low: 'Low', healthy: 'Healthy', stagnant: 'No recent sales', unknown: 'No stock data', stale: 'Stock data outdated' }[s] || 'No stock data';
        return `<span class="rounded-full px-2 py-0.5 text-label-sm font-semibold ${cls}">${label}</span>`;
    };
    FIQ.emptyState = () => `<section class="flex flex-col items-center gap-space-sm rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
        <span class="material-symbols-outlined text-[40px] text-primary">upload_file</span><h2 class="text-headline-sm">No data yet</h2>
        <p class="max-w-md text-body-md text-on-surface-variant">Upload an Excel or CSV file and map its columns to see this page. No file ready? Explore with sample data first.</p>
        <div class="flex flex-wrap justify-center gap-space-sm">
        <a href="data-model.html" class="rounded-lg bg-primary px-space-lg py-space-sm text-label-md text-on-primary hover:bg-primary-container">Upload your data</a>
        <button type="button" data-action="load-demo" class="rounded-lg bg-surface-container-low px-space-lg py-space-sm text-label-md hover:bg-surface-container-high">Load demo data</button>
        <button type="button" data-action="download-template" class="rounded-lg px-space-md py-space-sm text-label-md text-primary hover:bg-surface-container-low">Download Excel template</button></div></section>`;

    // marks: optional extra actual points (e.g. the in-progress period, f.partialActual), drawn as dots
    FIQ.lineChart = (el, actual, fc, marks = []) => {
        const W = 900, H = 340, P = { l: 56, r: 16, t: 12, b: 28 }, all = [...actual, ...fc, ...marks];
        if (!all.length) { el.innerHTML = ''; return; }
        const ts = all.map((p) => p.t), t0 = Math.min(...ts), t1 = Math.max(...ts);
        const vmax = Math.max(...actual.map((p) => p.v), ...marks.map((p) => p.v), ...fc.map((p) => p.hi), 1) * 1.08;
        const X = (t) => (P.l + ((t - t0) / (t1 - t0 || 1)) * (W - P.l - P.r)).toFixed(1);
        const Y = (v) => (H - P.b - (v / vmax) * (H - P.t - P.b)).toFixed(1);
        const line = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + X(p.t) + ' ' + Y(p.v)).join('');
        const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(vmax * f)}" y2="${Y(vmax * f)}" class="stroke-surface-container-high"/><text x="${P.l - 8}" y="${+Y(vmax * f) + 4}" text-anchor="end" class="fill-outline" font-size="11">${FIQ.fmt.compact(vmax * f)}</text>`).join('');
        const xl = [0, 0.25, 0.5, 0.75, 1].map((f) => { const t = t0 + (t1 - t0) * f; return `<text x="${X(t)}" y="${H - 8}" text-anchor="middle" class="fill-outline" font-size="11">${FIQ.fmt.date(t)}</text>`; }).join('');
        let ci = '', fl = '';
        if (fc.length) {
            ci = `<path d="${fc.map((p, i) => (i ? 'L' : 'M') + X(p.t) + ' ' + Y(p.hi)).join('')}${[...fc].reverse().map((p) => 'L' + X(p.t) + ' ' + Y(p.lo)).join('')}Z" class="fill-primary-fixed-dim/40"/>`;
            fl = `<path d="${line(actual.length ? [actual[actual.length - 1], ...fc] : fc)}" fill="none" stroke-width="2" stroke-dasharray="6 5" class="stroke-secondary"/>`;
        }
        const dots = marks.map((p) => `<circle cx="${X(p.t)}" cy="${Y(p.v)}" r="4" class="fill-primary-container"><title>Period in progress: ${FIQ.fmt.date(p.t)}</title></circle>`).join('');
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h-full w-full" role="img" aria-label="Actual vs forecasted sales">${grid}${xl}${ci}<path d="${line(actual)}" fill="none" stroke-width="2.5" class="stroke-primary-container"/>${fl}${dots}</svg>`;
    };
})();