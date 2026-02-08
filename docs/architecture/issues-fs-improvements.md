# Issues FS — Improvement Proposals from SGraph Send

**Author:** Claude (Librarian role)
**Date:** 2026-02-08
**Context:** Friction points encountered while setting up the SGraph Send Issues FS structure.

---

## 1. Missing: "Phase" as a First-Class Node Type

**Friction:** The current Issues FS schema doesn't formally define a "phase" or "milestone" concept. I had to use it as a custom node_type. Projects naturally break into phases (MVP, post-MVP, etc.) and the tooling should understand this hierarchy.

**Proposal:** Add `phase` as a standard node_type alongside `project`, `feature`, `task`, `bug`, etc. Phases sit between project and feature/release in the hierarchy.

**CLI impact:** `issues-fs list --phases` should list all phases in a project with status and progress.

---

## 2. Missing: Role Assignment Field

**Friction:** There's no standard field for assigning an issue to a role (Architect, Developer, QA, Human, etc.) or an agent. I used `properties.role_assignment` but this isn't queryable by the CLI.

**Proposal:** Add an optional `assigned_to` field (or `role`) at the top level of issue.json. Values could be role names ("Architect", "Developer", "QA") or agent identifiers.

**CLI impact:** `issues-fs list --assigned-to Developer` should filter issues by assignment.

---

## 3. Missing: Priority Field

**Friction:** Priority (P0, P1, P2) is a fundamental property of issues but isn't a standard field. I used `properties.priority` which means it's not filterable/sortable by the CLI.

**Proposal:** Add an optional `priority` field at the top level. Standard values: `P0` (must), `P1` (should), `P2` (could), `P3` (won't this phase).

**CLI impact:** `issues-fs list --priority P0` should filter by priority. Default sort should respect priority.

---

## 4. Missing: Acceptance Criteria Field

**Friction:** Tasks need acceptance criteria to be actionable, but there's no standard field for this. I used `properties.acceptance_criteria` as a free-text string.

**Proposal:** Add an optional `acceptance_criteria` field (string or array of strings) at the top level. This is especially important for the agentic workflow — an agent can't know when a task is "done" without clear criteria.

**CLI impact:** `issues-fs show {id}` should display acceptance criteria. Agent-mode output should include it.

---

## 5. Missing: "Deferred" Status

**Friction:** The standard workflow states are `backlog → in-progress → in-review → done → verified`. For phases and features that are explicitly out-of-scope for now, none of these fit. I used `deferred` as a custom status.

**Proposal:** Add `deferred` as a standard status, meaning "acknowledged but explicitly not being worked on in this phase."

---

## 6. Needed: Plan Mode Issue Type

**Friction:** The project uses a "Plan Mode" exercise where two independent plans are produced and then merged. There's no issue type that represents this pattern (it's not a task, not a spike, not a story).

**Proposal:** Add `plan` as an issue type. A plan issue:
- Has a status workflow: `draft → review → merged → superseded`
- Can link to other plan issues via `compared-with` link type
- Can produce a `decision` issue when two plans are merged
- Contains architectural decisions, not implementation work

---

## 7. Needed: Spec Document Linking

**Friction:** Issues should be able to reference their source specification document. I used `properties.source_document` but it would be better as a standard link type.

**Proposal:** Add `specified-by` / `specifies` as a link type pair. An issue can link to a spec document (file path) as its authoritative source.

---

## 8. CLI Missing: No CLI Installed

**Friction:** The issues-fs-cli package was not available in the environment. I created the entire Issues FS tree manually (mkdir + write JSON files). This works but is tedious and error-prone.

**Suggestion:** For environments where the CLI isn't installed, provide a lightweight Python helper that can create/update issues without the full CLI dependency. Or document the manual workflow more prominently.

---

## Summary

| # | Improvement | Type | Impact |
|---|-------------|------|--------|
| 1 | Phase node type | Schema addition | High — natural hierarchy level |
| 2 | Role assignment field | Schema addition | High — enables agent workflows |
| 3 | Priority field | Schema addition | High — fundamental issue property |
| 4 | Acceptance criteria field | Schema addition | Medium — important for agent clarity |
| 5 | Deferred status | Schema addition | Medium — common state in multi-phase projects |
| 6 | Plan issue type | Schema addition | Low–Medium — specific to Plan Mode workflow |
| 7 | Spec document linking | Link type addition | Low — nice-to-have traceability |
| 8 | Lightweight creation helper | Tooling | Medium — reduces manual work |
