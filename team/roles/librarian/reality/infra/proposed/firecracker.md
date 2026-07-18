# Infrastructure — Firecracker Substrate Proposed Items

**Domain:** infra/proposed/ | **Last updated:** 2026-07-14 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Source briefs: docs 408, 411, 412 (05/15 briefs).

---

## Firecracker Substrate (05/15 briefs — docs 408, 411, 412)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Firecracker PoC on C8i-flex.large with nested virtualisation | Sub-$5 experiment: boot microVM, take snapshot, restore; measure startup and restore times | doc 412 |
| Firecracker microVM substrate option in container hosts primitive | Firecracker as an optional backend alongside Docker/Podman in the container hosts placement model | doc 412 |
| Vault-attached compute via Firecracker snapshots | Vault open → snapshot restore (sub-second); vault closes → snapshot discards; lifecycle-aligned | doc 412 |
| AI agent code execution sandbox on Firecracker | Per-execution hardware isolation for untrusted LLM-generated code; isolation not speed is the value | doc 412 |
| Snapshot-fast Playwright fleet on Firecracker | Pre-initialised Playwright state snapshot; sub-second restore; far faster than cold container start | doc 412 |
| Fourth vault-hosting density mode: multi-microVM per EC2 | Hardware-level isolation, mid-cost; between multi-container and dedicated EC2 on isolation axis | doc 411 |
| Podman as default container runtime for container hosts | Rootless-by-default; no daemon; 15-20% lower memory at scale vs Docker; pending benchmark confirmation | doc 411 |
| Firecracker-containerd integration for OCI compatibility | Run any OCI image as a Firecracker microVM via standard containerd tooling | doc 412 |
| Real benchmark on c8i-flex.large: Docker vs Podman vs Firecracker | Cold-start, memory, CPU for vault app workload; one-day exercise, sub-$5 cost | doc 411 |
