// SGraph Send — Performance Tool — Test Scenario Catalogue
// Each scenario exposes: { id, name, group, desc, flags, run(ctx) }.
// ctx provides: client (ApiClient), tracker (ArtifactTracker), log(msg).
// run() returns: { ok, steps: [{label, duration_ms, status, bytes_in, bytes_out, error}], summary }

(function (global) {
  'use strict';

  const $api = global.ApiClient;
  const $art = global.ArtifactTracker;

  function step(label, fetched, opts) {
    // opts.expectStatus — when set, that status counts as ok (e.g. 404 for "must-not-exist" probes)
    const expected = opts && opts.expectStatus;
    const passed = expected != null
      ? fetched.status === expected
      : fetched.ok;
    return {
      label,
      duration_ms:    Math.round(fetched.duration_ms * 100) / 100,
      status:         fetched.status,
      bytes_in:       fetched.bytes_received || 0,
      bytes_out:      fetched.bytes_sent || 0,
      ok:             passed,
      error:          passed ? null : (fetched.error || `HTTP ${fetched.status}`),
      url:            fetched.url,
      method:         fetched.method,
    };
  }

  function summarise(steps) {
    const total_ms = steps.reduce((a, s) => a + s.duration_ms, 0);
    const calls    = steps.length;
    const ok       = steps.every(s => s.ok);
    const bytes_in  = steps.reduce((a, s) => a + (s.bytes_in || 0), 0);
    const bytes_out = steps.reduce((a, s) => a + (s.bytes_out || 0), 0);
    return { total_ms: Math.round(total_ms * 100) / 100, calls, ok, bytes_in, bytes_out };
  }

  // ---------------------------------------------------------------- helpers ---
  // Returns { create, transferId, deleteAuth } — the deleteAuth string is required
  // by /transfers/delete to dismantle the artefact afterwards.
  async function ensureCleanTransfer(ctx, scenarioId, sizeBytes) {
    const deleteAuth     = $api.randomHex(16);                       // 32-char hex
    const deleteAuthHash = await $api.sha256Hex(deleteAuth);
    const create = await $api.transferCreate(sizeBytes, 'application/octet-stream', {
      delete_auth_hash: deleteAuthHash,
    });
    if (!create.ok || !create.json || !create.json.transfer_id)
      return { create, transferId: null, deleteAuth };
    const id = create.json.transfer_id;
    $art.registerTransfer({ transfer_id: id, delete_auth: deleteAuth, scenario_id: scenarioId });
    return { create, transferId: id, deleteAuth };
  }

  async function cleanupTransfer(ctx, transferId, deleteAuth) {
    if (!transferId) return null;
    const del = await $api.transferDelete(transferId, deleteAuth);
    $art.markTransferCleaned(transferId);
    return del;
  }

  function newVaultId() { return $api.randomId(16); }
  function newWriteKey() { return $api.randomHex(32); }
  function newFileId()  { return $api.randomId(12); }

  // ---------------------------------------------------------------- A: cheap ---
  const sc_transfer_info_404 = {
    id: 'cheap.transfer-info-404',
    group: 'A · Cheap reads',
    name: 'Transfer info — unknown ID',
    desc: 'GET /api/transfers/info/<random> · expects 404 · pure read, no state change.',
    flags: [{ label: 'no-token', kind: '' }, { label: 'no side effects', kind: 'ok' }],
    sideEffects: 'none',
    async run(ctx) {
      const id = 'zz' + $api.randomId(20);
      const r = await $api.transferInfo(id);
      const steps = [step(`info(${id})`, r, { expectStatus: 404 })];
      return { ok: steps[0].ok, steps, summary: summarise(steps) };
    }
  };

  const sc_vault_health_404 = {
    id: 'cheap.vault-health-404',
    group: 'A · Cheap reads',
    name: 'Vault health — unknown ID',
    desc: 'GET /api/vault/health/<random> · returns whether vault exists, no token required.',
    flags: [{ label: 'no-token', kind: '' }, { label: 'no side effects', kind: 'ok' }],
    sideEffects: 'none',
    async run(ctx) {
      const id = 'zz' + $api.randomId(20);
      const r = await $api.vaultHealth(id);
      const steps = [step(`health(${id})`, r, { expectStatus: 404 })];
      return { ok: steps[0].ok, steps, summary: summarise(steps) };
    }
  };

  const sc_openapi_json = {
    id: 'cheap.openapi-json',
    group: 'A · Cheap reads',
    name: 'Fetch /api/openapi.json',
    desc: 'Pure routing + serialisation cost. No storage hit.',
    flags: [{ label: 'no-token', kind: '' }, { label: 'no side effects', kind: 'ok' }],
    sideEffects: 'none',
    async run(ctx) {
      const r = await $api.openApiJson();
      const steps = [step('openapi.json', r)];
      return { ok: r.ok, steps, summary: summarise(steps) };
    }
  };

  const sc_token_check = {
    id: 'token.check',
    group: 'A · Cheap reads',
    name: 'check-token (does not consume)',
    desc: 'GET /api/transfers/check-token/<token-from-storage>. Read-only.',
    flags: [{ label: 'no side effects', kind: 'ok' }],
    sideEffects: 'none',
    async run(ctx) {
      const t = $api.getToken();
      if (!t) return { ok: false, steps: [], summary: summarise([]), note: 'no token configured' };
      const r = await $api.checkToken(t);
      const steps = [step(`check-token(${t})`, r)];
      return { ok: r.ok, steps, summary: summarise(steps) };
    }
  };

  // ---------------------------------------------------------- B: transfer rt ---
  function transferRoundtrip(sizeKB) {
    return {
      id: `transfer.roundtrip.${sizeKB}kb`,
      group: 'B · Transfer round-trips',
      name: `Transfer round-trip · ${sizeKB} KB`,
      desc: `create → upload → complete → info → download → delete. Payload ${sizeKB} KB. Token use IS consumed on complete.`,
      flags: [
        { label: 'needs token', kind: 'warn' },
        { label: 'consumes 1 use', kind: 'warn' },
        { label: 'leaves meta.json residue', kind: 'warn' },
      ],
      sideEffects: 'transfer meta record remains with status=deleted; payload removed.',
      async run(ctx) {
        const steps = [];
        const sizeBytes = sizeKB * 1024;
        const payload   = $api.randomBytes(sizeBytes);

        const created = await ensureCleanTransfer(ctx, this.id, sizeBytes);
        steps.push(step('create', created.create));
        const id = created.transferId;
        if (!id) return { ok: false, steps, summary: summarise(steps), note: 'create failed' };

        steps.push(step('upload',   await $api.transferUpload(id, payload)));
        steps.push(step('complete', await $api.transferComplete(id)));
        steps.push(step('info',     await $api.transferInfo(id)));
        steps.push(step('download', await $api.transferDownload(id)));
        steps.push(step('delete',   await cleanupTransfer(ctx, id, created.deleteAuth)));

        return { ok: steps.every(s => s.ok), steps, summary: summarise(steps) };
      }
    };
  }

  // ---------------------------------------------------------- C: vault rt ----
  function vaultRoundtrip(fileCount, sizeKB) {
    return {
      id: `vault.roundtrip.${fileCount}f-${sizeKB}kb`,
      group: 'C · Vault round-trips',
      name: `Vault round-trip · ${fileCount}× ${sizeKB} KB`,
      desc: `new vault_id → write × N → read × N → list → delete × N → destroy. ⚠ destroy leaves deleted.json tombstone.`,
      flags: [
        { label: 'needs token', kind: 'warn' },
        { label: 'leaves tombstone', kind: 'danger' },
      ],
      sideEffects: 'destroy writes deleted.json (small JSON file) at vault path.',
      async run(ctx) {
        const steps = [];
        const vaultId  = newVaultId();
        const writeKey = newWriteKey();
        $art.registerVault({ vault_id: vaultId, write_key: writeKey, file_ids: [], scenario_id: this.id });

        const fileIds = Array.from({ length: fileCount }, () => newFileId());
        const payload = $api.randomBytes(sizeKB * 1024);

        // writes
        for (let i = 0; i < fileIds.length; i++) {
          const fid = fileIds[i];
          const r = await $api.vaultWrite(vaultId, fid, writeKey, payload);
          steps.push(step(`write(${i + 1}/${fileCount})`, r));
          if (r.ok) $art.addVaultFile(vaultId, fid);
        }
        // reads
        for (let i = 0; i < fileIds.length; i++) {
          steps.push(step(`read(${i + 1}/${fileCount})`, await $api.vaultRead(vaultId, fileIds[i])));
        }
        // list
        steps.push(step('list', await $api.vaultList(vaultId)));
        // deletes
        for (let i = 0; i < fileIds.length; i++) {
          steps.push(step(`delete(${i + 1}/${fileCount})`, await $api.vaultDeleteFile(vaultId, fileIds[i], writeKey)));
        }
        // destroy
        const destroy = await $api.vaultDestroy(vaultId, writeKey);
        steps.push(step('destroy', destroy));
        if (destroy.ok) $art.markVaultDestroyed(vaultId);

        return { ok: steps.every(s => s.ok), steps, summary: summarise(steps) };
      }
    };
  }

  // ---------------------------------------------------- D: concurrency -------
  const sc_concurrency_info_parallel_10 = {
    id: 'concurrency.info-parallel-10',
    group: 'D · Concurrency',
    name: '10× parallel transfer info',
    desc: 'Create one fixture transfer, fire 10 parallel /info calls, then delete.',
    flags: [{ label: 'needs token', kind: 'warn' }, { label: 'consumes 1 use', kind: 'warn' }],
    async run(ctx) {
      const steps = [];
      const created = await ensureCleanTransfer(ctx, this.id, 256);
      steps.push(step('create', created.create));
      const id = created.transferId;
      if (!id) return { ok: false, steps, summary: summarise(steps), note: 'create failed' };

      await $api.transferUpload(id, $api.randomBytes(256));
      await $api.transferComplete(id);

      const t0 = performance.now();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => $api.transferInfo(id))
      );
      const wall_ms = performance.now() - t0;
      results.forEach((r, i) => steps.push(step(`info[${i}]`, r)));
      steps.push({
        label: 'wall-clock-parallel',
        duration_ms: Math.round(wall_ms * 100) / 100,
        status: 200, ok: true, bytes_in: 0, bytes_out: 0,
      });

      steps.push(step('delete', await cleanupTransfer(ctx, id, created.deleteAuth)));
      return { ok: steps.every(s => s.ok !== false), steps, summary: summarise(steps) };
    }
  };

  const sc_concurrency_vault_read_parallel_20 = {
    id: 'concurrency.vault-read-parallel-20',
    group: 'D · Concurrency',
    name: '20× parallel vault read (same file)',
    desc: 'Write one vault file, fire 20 parallel reads, destroy.',
    flags: [{ label: 'needs token', kind: 'warn' }, { label: 'leaves tombstone', kind: 'danger' }],
    async run(ctx) {
      const steps = [];
      const vaultId  = newVaultId();
      const writeKey = newWriteKey();
      const fileId   = newFileId();
      $art.registerVault({ vault_id: vaultId, write_key: writeKey, file_ids: [fileId], scenario_id: this.id });

      steps.push(step('write', await $api.vaultWrite(vaultId, fileId, writeKey, $api.randomBytes(4 * 1024))));

      const t0 = performance.now();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => $api.vaultRead(vaultId, fileId))
      );
      const wall_ms = performance.now() - t0;
      results.forEach((r, i) => steps.push(step(`read[${i}]`, r)));
      steps.push({
        label: 'wall-clock-parallel',
        duration_ms: Math.round(wall_ms * 100) / 100,
        status: 200, ok: true, bytes_in: 0, bytes_out: 0,
      });

      steps.push(step('destroy', await $api.vaultDestroy(vaultId, writeKey)));
      $art.markVaultDestroyed(vaultId);
      return { ok: steps.every(s => s.ok !== false), steps, summary: summarise(steps) };
    }
  };

  // ------------------------------------------------------- E: warmth probe ---
  const sc_warmth_burst_10 = {
    id: 'warmth.burst-10',
    group: 'E · Lambda warmth',
    name: 'Burst — 10 sequential cheap reads',
    desc: '10× /api/transfers/info on a random ID, back-to-back. First is usually slower (cold).',
    flags: [{ label: 'no side effects', kind: 'ok' }],
    async run(ctx) {
      const steps = [];
      for (let i = 0; i < 10; i++) {
        const id = 'zz' + $api.randomId(20);
        steps.push(step(`probe[${i}]`, await $api.transferInfo(id), { expectStatus: 404 }));
      }
      return { ok: steps.every(s => s.ok), steps, summary: summarise(steps) };
    }
  };

  // ------------------------------------------------------ F: batch (vault) ---
  function vaultBatchRead(fileCount) {
    return {
      id: `batch.vault-read-${fileCount}`,
      group: 'F · Vault batch',
      name: `Batch read · ${fileCount} files`,
      desc: `Write N files, batch-read all in one /api/vault/batch call, destroy.`,
      flags: [
        { label: 'needs token', kind: 'warn' },
        { label: 'leaves tombstone', kind: 'danger' },
        { label: 'high server cost', kind: 'danger' },
      ],
      async run(ctx) {
        const steps = [];
        const vaultId  = newVaultId();
        const writeKey = newWriteKey();
        const fileIds = Array.from({ length: fileCount }, () => newFileId());
        $art.registerVault({ vault_id: vaultId, write_key: writeKey, file_ids: fileIds, scenario_id: this.id });

        const payload = $api.randomBytes(2 * 1024);
        for (let i = 0; i < fileIds.length; i++) {
          steps.push(step(`write(${i + 1}/${fileCount})`, await $api.vaultWrite(vaultId, fileIds[i], writeKey, payload)));
        }

        const ops = fileIds.map(fid => ({ op: 'read', file_id: fid }));
        steps.push(step(`batch-read[${fileCount}]`, await $api.vaultBatch(vaultId, ops)));

        steps.push(step('destroy', await $api.vaultDestroy(vaultId, writeKey)));
        $art.markVaultDestroyed(vaultId);
        return { ok: steps.every(s => s.ok), steps, summary: summarise(steps) };
      }
    };
  }

  // ------------------------------------------------------ G: metered (opt) ---
  const sc_validate_token = {
    id: 'metered.validate-token',
    group: 'G · Metered (consumes uses)',
    name: 'validate-token (CONSUMES 1 USE)',
    desc: 'POST /api/transfers/validate-token/<token>. Permanently uses one quota unit.',
    flags: [{ label: 'CONSUMES TOKEN USE', kind: 'danger' }],
    requiresConfirm: true,
    async run(ctx) {
      const t = $api.getToken();
      if (!t) return { ok: false, steps: [], summary: summarise([]), note: 'no token configured' };
      const r = await $api.validateToken(t);
      const steps = [step(`validate-token(${t})`, r)];
      return { ok: r.ok, steps, summary: summarise(steps) };
    }
  };

  // ---------------------------------------------------------- export catalog -
  global.SCENARIOS = [
    sc_transfer_info_404,
    sc_vault_health_404,
    sc_openapi_json,
    sc_token_check,
    transferRoundtrip(1),
    transferRoundtrip(100),
    transferRoundtrip(1024),       // 1 MB
    vaultRoundtrip(1, 1),
    vaultRoundtrip(5, 10),
    vaultRoundtrip(20, 10),
    sc_concurrency_info_parallel_10,
    sc_concurrency_vault_read_parallel_20,
    sc_warmth_burst_10,
    vaultBatchRead(10),
    vaultBatchRead(100),
    sc_validate_token,
  ];
})(window);
