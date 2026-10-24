/* ForecastIQ · index.js — landing page: if a dataset is already loaded, offer to continue instead of upload */
(() => {
    'use strict';
    const meta = window.FIQ && FIQ.meta();
    if (!meta) return;
    const primary = document.getElementById('cta-primary'), demo = document.getElementById('cta-demo'), status = document.getElementById('dataset-status');
    primary.href = 'overview.html'; primary.textContent = 'Open dashboard';
    demo.hidden = true;
    status.hidden = false;
    status.textContent = `${meta.demo ? 'Demo data' : 'Dataset'} loaded: ${meta.name} · ${Number(meta.rows).toLocaleString('en-US')} rows. You can replace it in Data & Model.`;
})();