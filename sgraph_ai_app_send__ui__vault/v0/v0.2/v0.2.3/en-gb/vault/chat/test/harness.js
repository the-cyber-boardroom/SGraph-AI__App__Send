/* =================================================================================
   Vault Chat — Standalone harness wiring (Phase 0, test fixture)
   Wires the Phase-0 modules + the mock sg + the mock LLM into a runnable chat with a
   visible execution log, ledger, CONFIRM cards, and a mock-vault commit feed.
   ================================================================================= */
(function () {
    'use strict';
    const VC = window.VaultChat;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const transcriptEl = $('transcript');
    const logEl = $('log'), ledgerEl = $('ledger'), commitsEl = $('commits');

    let vfs, sg, session, ec, fc, loop, logArr;

    function build() {
        vfs = new VC.MemoryVfs();
        sg = VC.createMockSg({ writable: $('writable').checked });
        session = new VC.ChatSession({ mode: $('mode').value, loadout: $('loadout').value, budgetUsd: 1.0, model: 'mock' });
        logArr = [];
        ec = new VC.ExecutionCenter({
            policies: buildPolicies(),
            registry: VC.BuiltinTools.REGISTRY,
            runners: VC.BuiltinTools.makeRunners(vfs),
            confirm: askConfirm,
            log: (row) => { logArr.push(row); renderLog(); renderLedger(); },
            estimate: (name) => (name === 'create_infographic' ? 0.06 : 0),
            budgetUsd: 1.0,
        });
        fc = new VC.VaultFlushController(vfs, sg, $('mode').value);
        loop = new VC.ChatLoop({ executionCenter: ec, session, vfs, sendLlm: VC.createMockLlm(), onEvent: renderEvent });
        transcriptEl.innerHTML = '';
        renderAll();
    }

    function buildPolicies() {
        let p = VC.ToolPolicies.applyLoadout(VC.ToolPolicies.defaults(), $('loadout').value);
        p = VC.ToolPolicies.degradeIfReadOnly(p, $('writable').checked);
        return p;
    }

    function syncControls() {
        // reflect live control changes without losing the ledger
        ec.policies = buildPolicies();
        fc.mode = $('mode').value;
        session.mode = $('mode').value;
    }

    function askConfirm({ name, args, estimate, remaining }) {
        return new Promise((resolve) => {
            const div = document.createElement('div');
            div.className = 'confirm';
            div.innerHTML = `<div>tool: <code>${esc(name)}</code> ${esc(JSON.stringify(args))}<br>` +
                `est $${(estimate || 0).toFixed(2)} · budget left $${remaining.toFixed(2)}</div>`;
            ['approve', 'approve always', 'deny'].forEach((label) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.onclick = () => {
                    div.querySelectorAll('button').forEach((x) => (x.disabled = true));
                    resolve(label === 'approve always' ? 'always' : label);
                };
                div.appendChild(b);
            });
            transcriptEl.appendChild(div);
            transcriptEl.scrollTop = transcriptEl.scrollHeight;
        });
    }

    function renderEvent(e) {
        const div = document.createElement('div');
        if (e.type === 'user')        { div.className = 'msg user'; div.innerHTML = `<div class="role">you</div>${esc(e.text)}`; }
        else if (e.type === 'assistant') { div.className = 'msg assistant'; div.innerHTML = `<div class="role">chat</div>${esc(e.text)}`; }
        else if (e.type === 'tool-call')   { div.className = 'tool'; div.textContent = `🛠 ${e.name}(${JSON.stringify(e.args)})`; }
        else if (e.type === 'tool-result') {
            div.className = 'tool';
            const r = e.result || {};
            div.textContent = r.denied ? `↳ denied` : r.refused ? `↳ REFUSED: ${r.reason}` : r.ok === false ? `↳ error: ${r.error}` : `↳ ok`;
        } else { div.className = 'msg'; div.textContent = e.text || ''; }
        transcriptEl.appendChild(div);
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }

    function renderLog() {
        logEl.innerHTML = logArr.map((c) => {
            const ic = c.kind === 'llm' ? '🤖' : '🛠';
            let d = c.name || '';
            if (c.mode) d += ` [${c.mode}]`;
            if (c.cost) d += ` $${Number(c.cost).toFixed(4)}`;
            if (c.refused) d += ` REFUSED:${c.reason}`;
            if (c.denied) d += ' denied';
            if (c.ms != null) d += ` ${c.ms}ms`;
            return `<div class="logrow${c.ok === false ? ' err' : ''}"><span class="ic">${ic}</span><span>${esc(d)}</span></div>`;
        }).join('') || '<div class="logrow">no activity</div>';
    }

    function renderLedger() {
        const l = ec.ledger;
        const left = isFinite(l.budgetUsd) ? (l.budgetUsd - l.spentUsd).toFixed(2) : '∞';
        ledgerEl.innerHTML = `spent $${l.spentUsd.toFixed(3)} / $${isFinite(l.budgetUsd) ? l.budgetUsd.toFixed(2) : '∞'} ` +
            `(left $${left})<br>task $${l.byTag.task.toFixed(3)} · memory $${l.byTag.memory.toFixed(3)}`;
    }

    function renderCommits() {
        const c = sg._debug.commits;
        commitsEl.innerHTML = c.length
            ? c.map((x) => `${esc(x.commitId || x.message)} — ${x.count} file(s): ${esc((x.items || []).join(', '))}`).join('<br>')
            : 'no commits';
    }

    function renderAll() { renderLog(); renderLedger(); renderCommits(); }

    async function send() {
        const input = $('input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        syncControls();
        const manifest = session.buildManifest(await vfs.listAll());
        await loop.runTurn(text, manifest);
        await fc.onTurnEnd(`turn: ${text.slice(0, 40)}`);
        renderAll();
    }

    // --- wire UI ---
    $('send').onclick = send;
    $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    $('seed').onclick = async () => {
        await vfs.writeFile('/notes.md', 'Quarterly notes: revenue up 12%, churn down 3%.');
        await vfs.writeFile('/data.csv', 'q,amount\nq1,100\nq2,112');
        renderEvent({ type: 'assistant', text: 'seeded /notes.md and /data.csv into the working set' });
    };
    $('cap').onclick = () => { ec.ledger.budgetUsd = ec.ledger.spentUsd + 0.02; renderLedger(); renderEvent({ type: 'assistant', text: 'budget cap forced near current spend — costly tools will be refused' }); };
    $('flush').onclick = async () => { const r = await fc.flush('manual flush'); renderCommits(); renderEvent({ type: 'assistant', text: `flush: ${JSON.stringify(r)}` }); };
    $('reset').onclick = () => build();
    ['mode', 'loadout', 'writable'].forEach((id) => $(id).addEventListener('change', syncControls));

    build();
})();
