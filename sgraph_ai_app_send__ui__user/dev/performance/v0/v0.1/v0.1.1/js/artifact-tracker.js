// SGraph Send — Performance Tool — Artifact Tracker  (v0.1.1 patch)
// Change: cleanOrphans now passes purge:true to vaultDestroy so orphan
// cleanup also leaves no tombstone residue on S3. All other logic unchanged.

(function (global) {
  'use strict';

  const KEY_TRANSFERS = 'sg-perf:artifacts:transfers';
  const KEY_VAULTS    = 'sg-perf:artifacts:vaults';

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  const ArtifactTracker = {

    listTransfers() { return safeGet(KEY_TRANSFERS, []); },
    listVaults()    { return safeGet(KEY_VAULTS, []); },

    registerTransfer(record) {
      const all = this.listTransfers();
      all.push({
        transfer_id: record.transfer_id,
        delete_auth: record.delete_auth || '',
        created_at:  Date.now(),
        status:      'pending',
        scenario_id: record.scenario_id || 'unknown',
      });
      safeSet(KEY_TRANSFERS, all);
    },

    markTransferCleaned(transferId) {
      const all = this.listTransfers();
      const next = all.map(t => t.transfer_id === transferId
        ? { ...t, status: 'cleaned', cleaned_at: Date.now() }
        : t);
      safeSet(KEY_TRANSFERS, next);
    },

    pruneTransfer(transferId) {
      const all = this.listTransfers().filter(t => t.transfer_id !== transferId);
      safeSet(KEY_TRANSFERS, all);
    },

    registerVault(record) {
      const all = this.listVaults();
      all.push({
        vault_id:    record.vault_id,
        write_key:   record.write_key || '',
        file_ids:    record.file_ids || [],
        created_at:  Date.now(),
        status:      'pending',
        scenario_id: record.scenario_id || 'unknown',
      });
      safeSet(KEY_VAULTS, all);
    },

    addVaultFile(vaultId, fileId) {
      const all = this.listVaults();
      const next = all.map(v => v.vault_id === vaultId
        ? { ...v, file_ids: [...new Set([...(v.file_ids || []), fileId])] }
        : v);
      safeSet(KEY_VAULTS, next);
    },

    markVaultDestroyed(vaultId) {
      const all = this.listVaults();
      const next = all.map(v => v.vault_id === vaultId
        ? { ...v, status: 'destroyed', destroyed_at: Date.now() }
        : v);
      safeSet(KEY_VAULTS, next);
    },

    pruneVault(vaultId) {
      const all = this.listVaults().filter(v => v.vault_id !== vaultId);
      safeSet(KEY_VAULTS, all);
    },

    countOrphans() {
      const t = this.listTransfers().filter(x => x.status === 'pending').length;
      const v = this.listVaults().filter(x => x.status === 'pending').length;
      return { transfers: t, vaults: v, total: t + v };
    },

    countAll() {
      return {
        transfers: this.listTransfers().length,
        vaults:    this.listVaults().length,
      };
    },

    async cleanOrphans(client, onProgress) {
      const tOrphans = this.listTransfers().filter(x => x.status === 'pending');
      const vOrphans = this.listVaults().filter(x => x.status === 'pending');
      let okT = 0, okV = 0, fail = 0;

      for (const t of tOrphans) {
        onProgress && onProgress(`Deleting transfer ${t.transfer_id} ...`);
        const r = await client.transferDelete(t.transfer_id, t.delete_auth);
        if (r.ok || r.status === 404) { this.pruneTransfer(t.transfer_id); okT++; }
        else fail++;
      }

      for (const v of vOrphans) {
        onProgress && onProgress(`Destroying vault ${v.vault_id} ...`);
        if (!v.write_key) { fail++; continue; }
        const r = await client.vaultDestroy(v.vault_id, v.write_key, { purge: true });
        if (r.ok || r.status === 404) { this.pruneVault(v.vault_id); okV++; }
        else fail++;
      }

      return { transfers_cleaned: okT, vaults_destroyed: okV, failed: fail };
    },

    clearAll() {
      try {
        localStorage.removeItem(KEY_TRANSFERS);
        localStorage.removeItem(KEY_VAULTS);
      } catch {}
    },
  };

  global.ArtifactTracker = ArtifactTracker;
})(window);
