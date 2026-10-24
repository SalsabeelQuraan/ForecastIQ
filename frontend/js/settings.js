/* ForecastIQ · settings.js — load / validate / save settings, test backend URL
 * Needs FIQ.apiBase(), FIQ.ENUM and the `apiToken` default from data.js, and an input with data-key="apiToken" in settings.html. */
(async () => {
    'use strict';
    if (!window.FIQ) {
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'js/data.js';
            s.onload = res;
            s.onerror = () => rej(new Error('js/data.js failed to load'));
            document.head.append(s);
        });
    }

    const form = document.getElementById('settings-form'),
        errBox = document.getElementById('settings-error'),
        fields = [...form.querySelectorAll('[data-key]')];

    const fill = (s) => fields.forEach((f) => {
        const v = s[f.dataset.key];
        f.type === 'checkbox' ? (f.checked = !!v) : (f.value = v ?? '');
    });

    const note = (msg, ok) => {
        let n = document.getElementById('settings-note');
        if (!n) {
            n = document.createElement('div');
            n.id = 'settings-note';
            n.setAttribute('role', 'status');
            errBox.before(n);
        }
        n.className = 'rounded-lg px-space-md py-space-sm text-body-sm ' + (ok ? 'bg-tertiary-fixed text-on-surface' : 'bg-error-container text-on-error-container');
        n.textContent = msg;
    };

    fill(FIQ.settings());

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const next = {}, errs = [];
        fields.forEach((f) => {
            const k = f.dataset.key, label = (f.closest('label')?.childNodes[0]?.textContent || k).trim();
            if (f.type === 'checkbox') next[k] = f.checked;
            else if (f.type === 'number') {
                const v = Number(f.value);
                if (f.value.trim() === '' || !Number.isFinite(v) || v < 0 || (f.min !== '' && v < +f.min) || (f.max !== '' && v > +f.max))
                    errs.push(`${label}: enter a number${f.min !== '' ? ` from ${f.min}` : ''}${f.max !== '' ? ` to ${f.max}` : ''}.`);
                next[k] = v;
            } else if (FIQ.ENUM && FIQ.ENUM[k]) {
                if (!FIQ.ENUM[k].includes(f.value)) errs.push(`${label}: choose one of the listed values.`);
                next[k] = f.value;
            } else next[k] = f.value;
        });
        errBox.hidden = !errs.length;
        errBox.textContent = errs.join(' ');
        if (errs.length) return;
        FIQ.saveSettings(next);
        note('Settings saved. They apply the next time you open a page.', true);
    });

    document.getElementById('btn-reset').onclick = () => {
        fill(FIQ.DEFAULTS);
        FIQ.saveSettings({ ...FIQ.DEFAULTS });
        errBox.hidden = true;
        note('Defaults restored.', true);
    };

})();