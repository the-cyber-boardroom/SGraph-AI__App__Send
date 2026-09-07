/* =================================================================================
   startApiServer() — spawn the REAL SGraph Send API (api-server.py) for a test run.

   Returns { url, token, stop() }. Local calls must bypass any HTTP(S) proxy configured in
   the environment: Node's fetch ignores proxy env vars, but Chromium does not, so the
   Playwright spec launches the browser with --no-proxy-server (see the spec).
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

export function startApiServer({ timeoutMs = 60_000 } = {}) {
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
