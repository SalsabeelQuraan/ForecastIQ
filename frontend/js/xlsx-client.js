/* ForecastIQ · xlsx-client.js — safe spreadsheet reading → FIQ.xlsx
 * 1) zip-bomb check BEFORE anything is decompressed, 2) parsing in a Web Worker, 3) hard timeouts.
 * Load after data.js and before upload.js. */
(() => {
    'use strict';
    const MB = 1024 * 1024;
    const LIMIT = { unzipped: 250 * MB, entry: 200 * MB, ratio: 100, entries: 1000, openMs: 30000, taskMs: 20000 };
    const bad = (m) => { throw new Error(m); };

    // An .xlsx is a zip. Read its directory (end of the file) and add up the sizes it DECLARES.
    async function zipGuard(file) {
        const sig = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (sig[0] !== 0x50 || sig[1] !== 0x4b) return; // not a zip (.xls or .csv): nothing to expand

        const tailLen = Math.min(file.size, 65557);
        const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
        let e = -1;
        for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
        if (e < 0) bad('This file looks corrupted (it is not a valid .xlsx).');

        const count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
        if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) bad('Zip64 files are not supported.');
        if (count > LIMIT.entries || cdOff + cdSize > file.size) bad('This file looks corrupted or suspicious.');

        const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
        let p = 0, n = 0, total = 0;
        while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
            const comp = cd.getUint32(p + 20, true), size = cd.getUint32(p + 24, true);
            total += size; n++;
            if (size > LIMIT.entry || total > LIMIT.unzipped || (size > MB && size > comp * LIMIT.ratio))
                bad('This file expands to far too much data. Save it as CSV, or remove unused sheets, and try again.');
            p += 46 + cd.getUint16(p + 28, true) + cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true);
        }
        if (n !== count) bad('This file looks corrupted or suspicious.');
    }

    let worker = null, seq = 0, openSeq = 0;
    const pending = new Map();

    function stop(reason) {
        if (worker) { worker.terminate(); worker = null; }
        for (const p of pending.values()) { clearTimeout(p.timer); p.rej(new Error(reason)); }
        pending.clear();
    }

    function start() {
        try { worker = new Worker('js/xlsx-worker.js'); }
        catch { bad('Could not start the background reader. Open the site through http(s) or a local server, not file://.'); }
        worker.onmessage = (ev) => {
            const { id, ok, data, error } = ev.data, p = pending.get(id);
            if (!p) return;
            clearTimeout(p.timer);
            pending.delete(id);
            if (ok) p.res(data); else p.rej(new Error(error));
        };
        worker.onerror = (ev) => { ev.preventDefault(); stop('The spreadsheet reader crashed. Try a smaller file.'); };
    }

    const call = (type, args, ms, transfer = []) => new Promise((res, rej) => {
        if (!worker) return rej(new Error('The file is no longer open. Choose it again.'));
        const id = ++seq;
        const timer = setTimeout(() => stop(`Reading the file took longer than ${ms / 1000} seconds, so it was stopped. Try a smaller file or save it as CSV.`), ms);
        pending.set(id, { res, rej, timer });
        worker.postMessage({ id, type, ...args }, transfer);
    });

    FIQ.xlsx = {
        LIMIT,
        async open(file) {
            const mine = ++openSeq;
            stop('Replaced by another file.');
            await zipGuard(file);
            const buffer = await file.arrayBuffer();
            if (mine !== openSeq) throw new Error('Replaced by another file.'); // a newer file was picked meanwhile
            start();
            return call('open', { buffer, csv: /\.csv$/i.test(file.name) }, LIMIT.openMs, [buffer]);
        },
        isOpen: () => !!worker,
        preview: (sheet) => call('preview', { sheet }, LIMIT.taskMs),
        header: (sheet) => call('header', { sheet }, LIMIT.taskMs),
        rows: (sheet, cols) => call('rows', { sheet, cols }, LIMIT.taskMs),
        close: () => stop('Closed.'),
    };
    window.addEventListener('pagehide', () => stop('Closed.'));
})();