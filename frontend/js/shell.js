/* ForecastIQ · shell.js — one sidebar + header for every page (responsive: drawer below 1024px).
 * Load order on each page:  data.js → (pages.js) → shell.js
 * A page only needs: <body data-page="..."> and a <main>. */
(() => {
    'use strict';
    const main = document.querySelector('main');
    if (!main) return;

    const page = document.body.dataset.page || 'overview';
    const NAV = [['overview', 'analytics', 'Overview'], ['sales-forecast', 'trending_up', 'Sales Forecast'], ['inventory-risk', 'warning', 'Inventory Risk'],
        ['products', 'inventory_2', 'Products'], ['data-model', 'schema', 'Data & Model'], ['settings', 'tune', 'Settings']];
    const TITLES = Object.fromEntries(NAV.map(([h, , l]) => [h, l]));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let meta = null;
    try { meta = window.FIQ ? FIQ.meta() : JSON.parse(localStorage.getItem('forecastiq.meta')); } catch { /* no dataset */ }

    /* ---------- markup ---------- */
    const navLinks = NAV.map(([h, icon, label]) => {
        const cur = h === page;
        return `<a href="${h}.html"${cur ? ' aria-current="page"' : ''} class="flex items-center gap-space-md rounded-lg px-space-md py-space-sm transition-colors ${cur ? 'bg-primary-container font-bold text-on-primary' : 'hover:bg-white/10 hover:text-white'}">
        <span class="material-symbols-outlined text-[20px]">${icon}</span>${esc(label)}</a>`;
    }).join('');

    const statusHtml = (m) => m
    ? `<div class="flex items-center gap-space-xs"><span class="h-2 w-2 rounded-full bg-tertiary-fixed"></span><span class="text-label-sm font-medium text-white">${m.demo ? 'Demo data' : 'Dataset loaded'}</span></div>
    <span class="text-body-sm text-outline-variant">${esc(m.name)} · ${Number(m.rows).toLocaleString('en-US')} rows</span>`
    : `<div class="flex items-center gap-space-xs"><span class="h-2 w-2 rounded-full bg-outline"></span><span class="text-label-sm font-medium text-white">No dataset</span></div>
    <span class="text-body-sm text-outline-variant">Upload a file in Data &amp; Model, or start with sample data.</span>
    <button type="button" data-action="load-demo" class="mt-1 self-start rounded-lg bg-white/10 px-space-sm py-1 text-label-sm text-white transition-colors hover:bg-white/20">Load demo data</button>`;

    const ownH1 = !!main.querySelector('h1'); // pages with their own <h1> get a plain title in the header
    const titleTag = ownH1 ? 'p' : 'h1';
    main.id ||= 'main';

    document.body.insertAdjacentHTML('afterbegin', `
        <a href="#${main.id}" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-space-md focus:py-space-sm focus:text-on-primary">Skip to content</a>
        <aside id="sidebar" class="fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col justify-between bg-inverse-surface text-inverse-on-surface transition-transform duration-200 lg:translate-x-0">
        <div>
            <div class="flex h-16 items-center gap-space-sm px-space-lg">
            <span class="material-symbols-outlined text-[28px] text-primary-fixed-dim">query_stats</span>
            <a href="index.html" class="flex flex-col" aria-label="ForecastIQ home">
                <span class="text-headline-sm font-bold tracking-tight text-white">ForecastIQ</span>
                <span class="text-label-sm tracking-wider text-outline-variant">Retail Intelligence</span></a>
            <button id="nav-close" type="button" class="ml-auto rounded-lg p-1 hover:bg-white/10 lg:hidden" aria-label="Close menu"><span class="material-symbols-outlined">close</span></button>
            </div>
            <nav class="flex flex-col gap-space-xs px-space-md py-space-sm" aria-label="Primary">${navLinks}</nav>
        </div>
        <div class="p-space-md"><div class="flex flex-col gap-space-xs rounded-lg bg-white/5 p-space-md" role="status">${status}</div></div>
        </aside>
        <div id="nav-overlay" hidden class="fixed inset-0 z-[45] bg-black/40 lg:hidden"></div>
        <header class="fixed left-0 right-0 top-0 z-40 flex h-16 items-center gap-space-sm bg-surface-container-lowest/95 px-4 shadow-[0_1px_8px_rgba(0,0,0,.04)] backdrop-blur-xl lg:left-72 lg:px-space-lg">
        <button id="nav-toggle" type="button" class="rounded-lg p-2 hover:bg-surface-container-low lg:hidden" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">
            <span class="material-symbols-outlined">menu</span></button>
        <${titleTag} class="min-w-0 truncate text-headline-sm tracking-tight sm:text-headline-md">${esc(TITLES[page] || '')}</${titleTag}>
        <form id="global-search" role="search" class="relative ml-auto hidden w-full max-w-sm md:block">
            <label class="sr-only" for="global-q">Search products</label>
            <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
            <input id="global-q" type="search" placeholder="Search product or category…" autocomplete="off"
            class="w-full rounded-lg bg-surface-container-low py-space-xs pl-10 pr-4 text-body-sm placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </form>
        <a href="inventory-risk.html" class="relative ml-auto rounded-full p-2 hover:bg-surface-container-low md:ml-0" aria-label="Alerts">
            <span class="material-symbols-outlined">notifications</span>
            <span id="bell-count" hidden class="absolute right-0 top-0 rounded-full bg-error px-1.5 text-[10px] font-bold text-white"></span></a>
        </header>`);

    /* ---------- main area: room for the sidebar on desktop, full width on mobile ---------- */
    main.classList.add('min-h-screen', 'pb-margin', 'px-4', 'pt-[calc(4rem+1.5rem)]', 'lg:pl-[calc(18rem+2rem)]', 'lg:pr-margin');
    if (main.id === 'app') main.classList.add('flex', 'flex-col', 'gap-space-lg');

    /* ---------- mobile drawer ---------- */
    const sidebar = document.getElementById('sidebar'), overlay = document.getElementById('nav-overlay'), toggle = document.getElementById('nav-toggle');
    const desktop = window.matchMedia('(min-width: 1024px)');
    const setOpen = (open) => {
        sidebar.classList.toggle('-translate-x-full', !open); sidebar.classList.toggle('translate-x-0', open);
        overlay.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
        const hide = !desktop.matches && !open;
        if ('inert' in sidebar) sidebar.inert = hide;
        sidebar.setAttribute('aria-hidden', String(hide));
        sidebar.querySelectorAll('a, button').forEach((el) => { el.tabIndex = hide ? -1 : 0; });        
        if (open) sidebar.querySelector('a[aria-current], nav a')?.focus(); else if (!desktop.matches && document.activeElement && sidebar.contains(document.activeElement)) toggle.focus();
    };
    setOpen(false);
    toggle.onclick = () => setOpen(true);
    document.getElementById('nav-close').onclick = () => setOpen(false);
    overlay.onclick = () => setOpen(false);
    sidebar.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) setOpen(false); });
    desktop.addEventListener('change', () => setOpen(false));

    /* ---------- global search → Products page ---------- */
    const q = document.getElementById('global-q');
    if (page === 'products') q.value = new URLSearchParams(location.search).get('q') || '';
    document.getElementById('global-search').addEventListener('submit', (e) => {
        e.preventDefault(); const v = q.value.trim();
        location.href = 'products.html' + (v ? '?q=' + encodeURIComponent(v) : '');
    });

    /* ---------- alert bell ---------- */
    const refreshBell = () => window.FIQ && FIQ.load().then((rows) => {
        const b = document.getElementById('bell-count');
        if (!b) return;
        if (!rows.length) { b.hidden = true; return; }
        const set = FIQ.settings(), ps = FIQ.products(rows, set);
        const n = (set.alertCritical ? ps.filter((p) => p.status === 'critical').length : 0) + (set.alertLow ? ps.filter((p) => p.status === 'low').length : 0);
        b.textContent = n > 99 ? '99+' : n; b.hidden = !n;
    });
    refreshBell();
    document.addEventListener('fiq:data-changed', (e) => {
        const box = document.querySelector('#sidebar [role="status"]');
        if (box) box.innerHTML = statusHtml(e.detail);
        refreshBell();
    });
})();