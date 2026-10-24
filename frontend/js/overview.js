/* ForecastIQ · overview.js (ES module) — Executive Demand & Revenue Matrix */
const $ = (id) => document.getElementById(id);
// The banner is built from plain text and DOM nodes only, so nothing in a message is ever parsed as HTML
const banner = (...parts) => { const b = $('error-banner'); b.replaceChildren(...parts); b.hidden = false; };
const link = (tag, text, props = {}, data = {}) => {
    const n = Object.assign(document.createElement(tag), { className: 'font-semibold underline', textContent: text }, props);
    Object.assign(n.dataset, data);
    return n;
};

async function main() {
    if (!window.FIQ) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/data.js'; s.onload = res; s.onerror = () => rej(new Error('js/data.js failed to load')); document.head.append(s); });
    const { esc, fmt, badge } = FIQ, rows0 = await FIQ.load();
    if (!rows0.length) {
        banner('No data yet. ', link('a', 'Upload an Excel file', { href: 'data-model.html' }), ' or ',
            link('button', 'load demo data', { type: 'button' }, { action: 'load-demo' }), ' to fill this dashboard.');
        return;
    }
    const set0 = FIQ.settings(), st = { scn: 'baseline', grain: { day: 'day', week: 'week', month: 'month' }[FIQ.GRAIN[set0.granularity]] || 'week', cat: 'all', reg: 'all' };
    const opts = (id, label, key) => { $(id).innerHTML = `<option value="all">${label}: All</option>` + [...new Set(rows0.map((x) => x[key]))].sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(''); };
    opts('filter-category', 'Category', 'c'); opts('filter-region', 'Region', 'r');

    const active = 'bg-surface-container-lowest shadow-sm font-bold text-primary';
    const mark = (sel, attr, val) => document.querySelectorAll(sel).forEach((b) => active.split(' ').forEach((c) => b.classList.toggle(c, b.dataset[attr] === val)));
    const bars = (groups, end) => [...groups].map(([k, xs]) => ({ k, v: FIQ.sum(xs), g: FIQ.growth(xs, end) })).sort((a, b) => b.v - a.v);
    function render() {
        const set = FIQ.settings(), rows = FIQ.filter(rows0, { cat: st.cat, reg: st.reg });
        mark('[data-scenario]', 'scenario', st.scn); mark('[data-grain]', 'grain', st.grain);
        if (!rows.length) {
            st.last = null;
            $('btn-export').disabled = true;
            $('kpi-grid').innerHTML = '<p class="text-body-md text-on-surface-variant">No rows match these filters.</p>';
            ['chart-canvas', 'category-bars', 'region-bars', 'products-body', 'alerts-list'].forEach((id) => { $(id).innerHTML = ''; });
            ['date-range', 'total-revenue', 'reconciliation', 'fastest-region', 'sku-count', 'urgent-count'].forEach((id) => { $(id).textContent = '—'; });
            return;
        }        
        const end = FIQ.end(rows), start = rows.reduce((m, x) => Math.min(m, x.d), Infinity), h = FIQ.periods(+set.horizon, st.grain);
        $('date-range').textContent = `${fmt.date(start)} – ${fmt.date(end)}`;
        const f = FIQ.forecast(rows, st.grain, h, +set.confidence, FIQ.SCENARIO[st.scn]), prods = FIQ.products(rows, set), rev = FIQ.sum(rows);
        const risk = prods.filter((p) => p.status === 'critical' || p.status === 'low').length, hasStock = prods.some((p) => p.stock != null);
        const fcTotal = f ? f.fc.reduce((a, p) => a + p.v, 0) : null, prev = f ? f.series.slice(-h).reduce((a, p) => a + p.v, 0) : 0;

        const kpi = (l, v, s) => `<div class="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm"><p class="text-label-md text-on-surface-variant">${l}</p><p class="text-headline-md tracking-tight">${v}</p><p class="text-body-sm text-on-surface-variant">${s}</p></div>`;
        $('kpi-grid').innerHTML = kpi('Total revenue', fmt.money(rev), `${rows.length.toLocaleString('en-US')} data rows`) + kpi('Units sold', fmt.num(FIQ.sum(rows, 'q')), `${prods.length.toLocaleString('en-US')} products`)
        + kpi('Forecast revenue', fcTotal == null ? '—' : fmt.money(fcTotal), f ? `${fmt.pct(prev > 0 ? (fcTotal - prev) / prev : null)} vs previous ${h} ${st.grain}s` : 'not enough history')
        + kpi('Products at risk', hasStock ? risk : '—', hasStock ? 'critical or low stock' : 'map a stock column')
        + kpi('Forecast accuracy', f && f.wape != null ? Math.max(0, 100 - f.wape * 100).toFixed(1) + '%' : '—', 'backtest (100 − wape)');

        FIQ.lineChart($('chart-canvas'), (f ? f.series : FIQ.series(rows, st.grain)).slice(-90), f ? f.fc : [], f ? f.partialActual : []);

        const cats = bars(FIQ.group(rows, 'c'), end), top = cats.slice(0, 4), maxShare = Math.max(...top.map((c) => c.v), 1);
        $('category-bars').style.gridTemplateColumns = `repeat(${Math.max(top.length, 1)}, minmax(0, 1fr))`;
        $('category-bars').innerHTML = top.map((c) => `<div class="flex h-full flex-col items-center justify-end gap-1 text-center"><span class="text-label-sm">${rev > 0 ? (c.v / rev * 100).toFixed(0) : 0}%</span>
        <div class="w-full rounded-t-lg bg-primary-container" style="height:${Math.max(4, c.v / maxShare * 70)}%"></div><span class="w-full truncate text-label-sm" title="${esc(c.k)}">${esc(c.k)}</span>
        <span class="text-label-sm ${c.g != null && c.g < 0 ? 'text-error' : 'text-tertiary'}">${fmt.pct(c.g)}</span></div>`).join('');
        $('total-revenue').textContent = fmt.money(rev);
        $('reconciliation').textContent = `${cats.length} categories`;

        const regs = bars(FIQ.group(rows, 'r'), end), rmax = Math.max(...regs.map((r) => r.v), 1);
        $('region-bars').innerHTML = regs.slice(0, 8).map((r) => `<div><div class="mb-1 flex justify-between text-label-md"><span>${esc(r.k)}</span><span>${fmt.money(r.v)} · ${fmt.pct(r.g)}</span></div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-surface-container-low"><div class="h-full rounded-full bg-primary-container" style="width:${r.v / rmax * 100}%"></div></div></div>`).join('');
        const fast = regs.filter((r) => r.g != null).sort((a, b) => b.g - a.g)[0]; $('fastest-region').textContent = fast ? `${fast.k} (${fmt.pct(fast.g)})` : '—';

        st.last = { prods, f, scn: st.scn, grain: st.grain };
        $('btn-export').disabled = false;
        const top5 = [...prods].sort((a, b) => b.sales30 - a.sales30).slice(0, 5);
        $('products-body').innerHTML = top5.map((p) => `<tr class="text-body-sm"><td class="px-3 py-2.5 font-semibold">${esc(p.p)}</td><td class="px-3 py-2.5">${esc(p.c)}</td><td class="px-3 py-2.5 text-right">${fmt.money(p.sales30)}</td>
        <td class="px-3 py-2.5 text-right ${p.growth != null && p.growth < 0 ? 'text-error' : 'text-tertiary'}">${fmt.pct(p.growth)}</td><td class="px-3 py-2.5">${badge(p.status)}</td>
        <td class="px-3 py-2.5 text-right">${p.order ? `<a class="font-semibold text-primary underline" href="inventory-risk.html">Reorder ${fmt.num(p.order)}</a>` : '—'}</td></tr>`).join('');
        $('sku-count').textContent = `Top 5 of ${prods.length.toLocaleString('en-US')} products by last 30 days`;

        const alerts = prods.filter((p) => (p.status === 'critical' && set.alertCritical) || (p.status === 'low' && set.alertLow)).sort((a, b) => a.cover - b.cover);
        const drift = set.alertDrift && f && f.wape != null && f.wape > 0.3;
        $('urgent-count').textContent = `${alerts.filter((p) => p.status === 'critical').length} urgent`;
        $('alerts-list').innerHTML = (hasStock ? '' : '<p class="text-body-sm text-on-surface-variant">Map a “Current stock” column to enable stock-out alerts.</p>')
        + (drift ? `<div class="rounded-lg bg-secondary-container p-space-md text-body-sm"><strong>Model drift:</strong> backtest error is ${(f.wape * 100).toFixed(0)}%. Forecasts may be unreliable.</div>` : '')
        + alerts.slice(0, 6).map((p) => `<div class="rounded-lg bg-surface-container-low p-space-md"><div class="flex items-center justify-between gap-space-sm"><strong class="text-body-md">${esc(p.p)}</strong>${badge(p.status)}</div>
            <p class="text-body-sm text-on-surface-variant">${p.cover.toFixed(1)} days of cover · ${fmt.num(p.stock)} in stock${p.order ? ` · reorder ${fmt.num(p.order)} (${fmt.money(p.po)})` : ''}</p></div>`).join('')
        + (hasStock && !alerts.length && !drift ? '<p class="text-body-sm text-on-surface-variant">No stock alerts. 🎉</p>' : '');
    }

    document.querySelectorAll('[data-scenario]').forEach((b) => (b.onclick = () => { st.scn = b.dataset.scenario; render(); }));
    document.querySelectorAll('[data-grain]').forEach((b) => (b.onclick = () => { st.grain = b.dataset.grain; render(); }));
    $('filter-category').onchange = (e) => { st.cat = e.target.value; render(); };
    $('filter-region').onchange = (e) => { st.reg = e.target.value; render(); };
    const csvCell = (v) => {
        let x = v == null ? '' : String(v);
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(x)) x = "'" + x;
        return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };    
    $('btn-export').onclick = () => {
        if (!st.last) return;
        const { prods, f, scn, grain } = st.last, d = (t) => new Date(t).toISOString().slice(0, 10), r2 = (v) => (v == null ? '' : Math.round(v * 100) / 100);
        const out = [['Products'], ['Product', 'Category', 'Revenue', 'Units', 'Last 30 days', 'Growth %', 'Stock', 'Days of cover', 'Status', 'Suggested order', 'PO value'],
            ...prods.map((p) => [p.p, p.c, r2(p.rev), p.units, r2(p.sales30), p.growth == null ? '' : r2(p.growth * 100), p.stock ?? '', p.cover == null ? '' : r2(p.cover), p.status, p.order || '', p.order ? r2(p.po) : ''])];
        if (f) out.push([], [`Forecast (${scn}, per ${grain})`], ['Period', 'Forecast', 'Lower', 'Upper'], ...f.fc.map((p) => [d(p.t), r2(p.v), r2(p.lo), r2(p.hi)]));
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\ufeff' + out.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' })), download: 'forecastiq-report.csv' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    render();
}
main().catch((e) => banner(String((e && e.message) || e)));