/* =================================================================================
   startApiServer() — spawn the REAL SGraph Send API (api-server.py) for a test run.

   Returns { url, token, stop() }. With SG_API_URL set, no server is spawned: the handle
   points at that deployment (token from SG_ACCESS_TOKEN / SGRAPH_SEND__ACCESS_TOKEN).
   Node's fetch ignores proxy env vars; Chromium honours them, and its default bypass list
   covers 127.0.0.1 / localhost.
   ================================================================================= */

import { spawn }          from 'node:child_process';
import fs                 from 'node:fs';
import path               from 'node:path';
import { fileURLToPath }  from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function pythonBin() {
    const candidates = [
        process.env.SG_PYTHON,
        path.join(REPO_ROOT, '.venv/bin/python3'),
        'python3'
    ].filter(Boolean);
    for (const c of candidates) {
        if (c === 'python3' || fs.existsSync(c)) return c;
    }
    return 'python3';
}

// A deployed target instead of a spawned server: SG_API_URL (+ SG_ACCESS_TOKEN or
// SGRAPH_SEND__ACCESS_TOKEN). This is how an agent points the live test / the browser e2e
// at dev.send.sgraph.ai to confirm a deployment (see DECLARED-MOUNTS-E2E.md §6).
export function remoteApiFromEnv() {
    const url = process.env.SG_API_URL;
    if (!url) return null;
    const token = process.env.SG_ACCESS_TOKEN || process.env.SGRAPH_SEND__ACCESS_TOKEN || '';
    if (!token) throw new Error('SG_API_URL is set but no SG_ACCESS_TOKEN / SGRAPH_SEND__ACCESS_TOKEN');
    return { url: url.replace(/\/$/, ''), token, remote: true, proc: null, stop() { return Promise.resolve(); } };
}

export function startApiServer({ timeoutMs = 60_000 } = {}) {
    const remote = remoteApiFromEnv();
    if (remote) return Promise.resolve(remote);
    return new Promise((resolve, reject) => {
        const script = path.join(__dirname, 'api-server.py');
        const env    = Object.assign({}, process.env, { SEND__STORAGE_MODE: 'memory', PYTHONUNBUFFERED: '1' });
        const child  = spawn(pythonBin(), [script], { cwd: REPO_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '', done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true; child.kill('SIGKILL');
            reject(new Error('api-server.py did not report ready in ' + timeoutMs + 'ms\n' + err));
        }, timeoutMs);
        child.stdout.on('data', (d) => {
            out += d.toString();
            const line = out.split('\n').find((l) => l.trim().startsWith('{'));
            if (line && !done) {
                done = true; clearTimeout(timer);
                const info = JSON.parse(line);
                resolve({
                    url:   info.url,
                    token: info.token,
                    proc:  child,
                    stop() {
                        return new Promise((res) => {
                            if (child.exitCode !== null) return res();
                            child.once('exit', () => res());
                            try { child.stdin.end(); } catch (_) {}
                            setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 3000);
                        });
                    }
                });
            }
        });
        child.stderr.on('data', (d) => { err += d.toString(); });
        child.on('exit', (code) => {
            if (!done) { done = true; clearTimeout(timer); reject(new Error('api-server.py exited early (' + code + ')\n' + err)); }
        });
    });
}
