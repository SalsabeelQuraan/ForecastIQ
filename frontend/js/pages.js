/* ForecastIQ · pages.js — Sales Forecast, Inventory Risk, Products, Data & Model (needs data.js) */
(() => {
    'use strict';
    const { esc, fmt, badge } = FIQ, page = document.body.dataset.page, app = document.getElementById('app');
    // Any value that comes from settings is forced to a real number before it is printed into HTML.
    const sn = (v) => esc(String(Number(v) || 0));
    const card = (c, cls = '') => `<section class="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm ${cls}">${c}</section>`;
    const stat = (l, v, s = '') => card(`<p class="text-label-md text-on-surface-variant">${esc(l)}</p><p class="text-headline-md tracking-tight">${v}</p><p class="text-body-sm text-on-surface-variant">${s}</p>`);
    const th = (t, r) => `<th scope="col" class="px-3 py-2.5 ${r ? 'text-right' : ''}">${t}</th>`;
    const td = (t, r) => `<td class="px-3 py-2.5 ${r ? 'text-right' : ''}">${t}</td>`;
    const table = (heads, body) => `<div class="overflow-x-auto"><table class="w-full min-w-[640px] border-collapse text-left text-body-sm"><thead><tr class="bg-surface-container-low text-label-sm uppercase tracking-wider text-outline">${heads}</tr></thead><tbody class="divide-y divide-surface-container-low">${body}</tbody></table></div>`;
    const select = (attr, opts, val) => `<select ${attr} class="rounded-lg bg-surface-container-low px-3 py-2 text-label-md">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    const PAGES = {
        'sales-forecast'(rows, set) {
        const st = { h: set.horizon, g: set.granularity, c: set.confidence, s: 'baseline' };
        app.innerHTML = `<div class="flex flex-wrap gap-space-sm">
            ${select('data-f="h"', [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']], st.h)}
            ${select('data-f="g"', [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], st.g)}
            ${select('data-f="c"', [[80, '80% CI'], [95, '95% CI'], [99, '99% CI']], st.c)}
            ${select('data-f="s"', [['baseline', 'Baseline'], ['promo', 'Promotional Surge (+15%)'], ['supply_shock', 'Supply Shock (-20%)']], st.s)}</div><div id="sf-out" class="flex flex-col gap-space-lg"></div>`;
        const draw = () => {
            const g = FIQ.GRAIN[st.g], h = FIQ.periods(+st.h, g), f = FIQ.forecast(rows, g, h, +st.c, FIQ.SCENARIO[st.s]), out = document.getElementById('sf-out');
            if (!f) { out.innerHTML = card('<p>Not enough history: at least 4 periods are needed at this granularity. Try a finer granularity.</p>'); return; }
            const total = f.fc.reduce((a, p) => a + p.v, 0), prev = f.series.slice(-h).reduce((a, p) => a + p.v, 0);
            out.innerHTML = `<div class="grid gap-gutter sm:grid-cols-3">${stat('Forecast revenue', fmt.money(total), `next ${h} ${esc(g)}${h > 1 ? 's' : ''}`)}
            ${stat('vs. previous period', fmt.pct(prev > 0 ? (total - prev) / prev : null), 'same number of periods')}
            ${stat('Backtest error (wape)', f.wape == null ? '—' : (f.wape * 100).toFixed(1) + '%', f.wape != null ? `held out last ${f.holdout} periods` : 'not enough history for a backtest')}</div>
            ${f.m ? '' : `<p class="text-body-sm text-on-surface-variant">No seasonality applied: needs at least ${2 * FIQ.SEASON[g]} ${esc(g)}s of history (you have ${f.n}).</p>`}
            ${card('<div id="sf-chart" class="h-80 w-full sm:h-96"></div>')}
            ${card(`<h3 class="mb-space-sm text-headline-sm">Forecast values</h3>${table(th('Period') + th('Forecast', 1) + th('Lower', 1) + th('Upper', 1),
                f.fc.slice(0, 60).map((p) => `<tr>${td(fmt.date(p.t))}${td(fmt.money(p.v), 1)}${td(fmt.money(p.lo), 1)}${td(fmt.money(p.hi), 1)}</tr>`).join(''))}`)}`;
                FIQ.lineChart(document.getElementById('sf-chart'), f.series.slice(-120), f.fc, f.partialActual);
        };
        app.querySelectorAll('select[data-f]').forEach((s) => (s.onchange = () => { st[s.dataset.f] = s.value; draw(); }));
        draw();
        },

        'inventory-risk'(rows, set) {
        const ps = FIQ.products(rows, set), has = ps.some((p) => p.stock != null);
        const crit = ps.length ? Math.round(ps[0].critDays * 10) / 10 : 7;
        const order = { critical: 0, low: 1, healthy: 2, stagnant: 3, unknown: 4, stale: 5 };
        if (!has) { app.innerHTML = card('<h2 class="text-headline-sm">Stock data needed</h2><p class="text-body-md text-on-surface-variant">Inventory risk needs a “Current stock” column. Upload again and map it in Data &amp; Model.</p>'); return; }
        const cnt = (s) => ps.filter((p) => p.status === s).length, list = [...ps].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.cover ?? 1e9) - (b.cover ?? 1e9));
        app.innerHTML = `<div class="grid gap-gutter sm:grid-cols-3">${stat(`Critical (≤ ${crit} days)`, cnt('critical'), 'stock-out before a new order arrives')}${stat('Low (≤ 14 days or below reorder point)', cnt('low'), 'reorder soon')}${stat('Healthy', cnt('healthy'), '> 14 days of cover')}</div>
        ${card(`<p class="mb-space-sm text-body-sm text-on-surface-variant">Demand = average daily units over the last 30 days (a shorter window for new products), adjusted by ×${(ps[0]?.demandFactor ?? 1).toFixed(2)} from the forecast. Reorder point = adjusted demand × (${sn(set.leadDays)}-day base lead time + ${sn(set.leadBuffer)} buffer + ${sn(set.safetyDays)} safety days). Orders above ${fmt.money(Number(set.autoApproveLimit) || 0)} need approval.</p>
            ${table(th('Product') + th('Status') + th('Stock', 1) + th('Units/day', 1) + th('Days of cover', 1) + th('Reorder point', 1) + th('Suggested order', 1) + th('PO value', 1) + th('Approval'),
                list.slice(0, 200).map((p) => `<tr>${td(`<strong>${esc(p.p)}</strong><br><span class="text-on-surface-variant">${esc(p.c)}</span>`)}${td(badge(p.status))}${td(p.stock == null ? '—' : fmt.num(p.stock), 1)}${td(p.daily.toFixed(1), 1)}
                ${td(p.cover == null ? '—' : p.cover.toFixed(1), 1)}${td(fmt.num(p.rop), 1)}${td(p.order ? fmt.num(p.order) : '—', 1)}${td(p.order ? fmt.money(p.po) : '—', 1)}${td(p.order ? (p.auto ? 'Auto-approve' : 'Needs approval') : '—')}</tr>`).join(''))}`)}`;
        },

        products(rows, set) {
        const ps = FIQ.products(rows, set); let q = (new URLSearchParams(location.search).get('q') || '').toLowerCase().trim(), sort = 'rev';
        app.innerHTML = `<div class="flex flex-wrap gap-space-sm"><input id="pq" type="search" placeholder="Search product or category…" value="${esc(q)}" class="min-w-[16rem] rounded-lg bg-surface-container-low px-3 py-2 text-body-md" />
            ${select('id="ps"', [['rev', 'Sort: Revenue'], ['sales30', 'Sort: Last 30 days'], ['growth', 'Sort: Growth'], ['cover', 'Sort: Days of cover (low first)']], sort)}</div><div id="pt"></div>`;
        const draw = () => {
            let l = ps.filter((p) => (p.p + ' ' + p.c).toLowerCase().includes(q));
            l = [...l].sort((a, b) => sort === 'cover' ? (a.cover ?? 1e9) - (b.cover ?? 1e9) : (b[sort] ?? -1e18) - (a[sort] ?? -1e18));
            document.getElementById('pt').innerHTML = card(`<p class="mb-space-sm text-body-sm text-on-surface-variant">${l.length.toLocaleString('en-US')} of ${ps.length.toLocaleString('en-US')} products${l.length > 200 ? ' (showing 200)' : ''}</p>${table(
            th('Product') + th('Category') + th('Revenue', 1) + th('Units', 1) + th('Last 30 days', 1) + th('Growth', 1) + th('Stock health'),
            l.slice(0, 200).map((p) => `<tr>${td(`<strong>${esc(p.p)}</strong>`)}${td(esc(p.c))}${td(fmt.money(p.rev), 1)}${td(fmt.num(p.units), 1)}${td(fmt.money(p.sales30), 1)}${td(fmt.pct(p.growth), 1)}${td(badge(p.status))}</tr>`).join(''))}`);
        };
        document.getElementById('pq').oninput = (e) => { q = e.target.value.toLowerCase().trim(); draw(); };
        document.getElementById('ps').onchange = (e) => { sort = e.target.value; draw(); };
        draw();
        },

        'data-model'(rows, set) {
        const meta = FIQ.meta(); let body;
        if (!meta || !rows.length) body = card('<h2 class="text-headline-sm">Current dataset</h2><p class="text-body-md text-on-surface-variant">No dataset loaded yet. Upload a file above.</p>');
        else {
            const m = meta.mapping || {}, g = FIQ.GRAIN[set.granularity] || 'week', f = FIQ.forecast(rows, g, FIQ.periods(+set.horizon, g), +set.confidence);
            const kv = (k, v) => `<div class="flex justify-between gap-space-md py-2"><dt class="text-on-surface-variant">${k}</dt><dd class="font-semibold">${v}</dd></div>`;
            body = `<div class="grid gap-gutter lg:grid-cols-2">${card(`<h2 class="mb-space-sm text-headline-sm">Current dataset</h2><dl class="divide-y divide-surface-container-low text-body-md">
            ${kv('File', esc(meta.name))}${kv('Rows used', Number(meta.rows).toLocaleString('en-US'))}${kv('Rows skipped (invalid)', Number(meta.skipped || 0).toLocaleString('en-US'))}${kv('Date range', fmt.date(meta.from) + ' – ' + fmt.date(meta.to))}
            ${kv('Auto-delete', esc(FIQ.retentionText(meta)))}${kv('Products', FIQ.group(rows, 'p').size.toLocaleString('en-US'))}${kv('Mapped columns', Object.entries(m).map(([k, v]) => `${esc(k)}→${esc(v)}`).join(', '))}</dl>
            <button id="dm-clear" type="button" class="mt-space-md rounded-lg bg-error-container px-space-md py-space-sm text-label-md text-on-error-container">Remove dataset</button>`)}
            ${card(`<h2 class="mb-space-sm text-headline-sm">Forecast model</h2><dl class="divide-y divide-surface-container-low text-body-md">
            ${kv('Method', 'Damped additive Holt-Winters')}${kv('Granularity', esc(g))}${kv('Seasonal period', f ? (f.m ? f.m + ' periods' : 'none (not enough history)') : '—')}
            ${kv('Periods of history', f ? f.n : '—')}${kv('Backtest wape', f && f.wape != null ? (f.wape * 100).toFixed(1) + '%' : '—')}${kv('Backtest RMSE', f && f.rmse != null ? fmt.money(f.rmse) : '—')}</dl>
            <p class="mt-space-md text-body-sm text-on-surface-variant">Runs in your browser. Smoothing parameters are tuned automatically on your data${f && f.params ? ` (α ${f.params.a}, β ${f.params.b}, γ ${f.params.g})` : ''}. Backtest = hold out the last periods, forecast them, compare.</p>`)}</div>`;
        }
        let box = document.getElementById('dm-body');
        if (!box) { box = document.createElement('div'); box.id = 'dm-body'; app.append(box); }
        app.innerHTML = body;
        const b = document.getElementById('dm-clear'); if (b) b.onclick = async () => { await FIQ.clear(); location.reload(); };
        },
    };

    const run = async () => {
    const rows = await FIQ.load(), set = FIQ.settings();
        if (!rows.length && page !== 'data-model') { app.innerHTML = FIQ.emptyState(); return; }
        try { PAGES[page]?.(rows, set); } catch (e) { app.innerHTML = card(`<p class="text-error">Something went wrong: ${esc(e.message)}</p>`); }
        };
        run();
        if (page === 'data-model') document.addEventListener('fiq:data-changed', run);
})();