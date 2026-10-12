# MEMO: Issues-FS Documentation Import for SGraph Send

**From:** Conductor (acting as you, the Librarian)  
**To:** Librarian (you) — who has write access to the SGraph Send repo  
**Date:** 2026-06-11  
**Priority:** High  
**Action:** Review, categorize, and import these documents into the SGraph Send repo

---

## Context

The agent building the LinkedIn export analysis vault discovered that the SGraph Send repo is missing foundational conceptual documents that exist in the Issues-FS__Docs repo. These are not project-specific; they are **foundational thinking documents** that underpin the semantic graph, role-based agent coordination, and graph-first architecture that SGraph Send uses.

**The discovery:** The briefs from June 1 and June 4 (Tier 0) assume understanding of:
- "Thinking in Graphs: Meaning Through Connectivity" (Issues-FS)
- "Compatibility Through Connectivity" (Issues-FS)
- Role ecosystem (cartographer, historian, journalist, etc.) — Issues-FS
- Graph-based issue tracking architecture — Issues-FS

These documents are **canonical**. They were written at the heart of the Issues-FS project and are the source of the architecture patterns that SGraph Send has adopted.

---

## Documents Included in This Package

**Ten documents from Issues-FS__Docs that should be integrated:**

### Tier 0: Foundational Philosophy

1. **`v0_4_0__issues-fs__thinking-in-graphs.md`**
   - Date: 2026-02-05
   - Status: Draft (but canonical)
   - What: Foundational philosophy that "everything is a graph, meaning through connectivity"
   - Why: This is the *intellectual foundation* for semantic graphs, typed primitives, and ontologies. It pre-dates the June 1-4 briefs and explains *why* graphs matter.
   - **Action:** Import to `library/concepts/` as a foundational reference

2. **`v0_4_0__issues-fs__compatibility-through-connectivity.md`**
   - What: How compatibility and interoperability emerge from richly connected graph structure (not from centralized specs)
   - Why: Directly relevant to how the SGraph Send vault ecosystem should evolve without breaking
   - **Action:** Import to `library/concepts/` and cross-link from Brief #2 (skill-as-projection)

### Tier 0: Role Architecture

3. **`v0_4_0__issues-fs__role-ecosystem-guide.md`**
   - What: Overview of the 18+ role ecosystem (Conductor, Architect, Dev, Librarian, Cartographer, Historian, Journalist, etc.)
   - Why: SGraph Send uses this exact role model. Having the source document in the repo clarifies role interactions
   - **Action:** Import to `library/guides/` as "agentic-role-ecosystem"

4. **`v0_4_0__issues-fs__cartographer-role.md`**
   - What: The Cartographer role — system visualization via Wardley Maps
   - Why: SGraph Send uses Wardley Maps for product evolution. Having the role definition clarifies what a Cartographer does
   - **Action:** Import to `team/roles/cartographer/` as additional reference (if cartographer role is adopted; otherwise to library)

5. **`v0_4_0__issues-fs__historian-role.md`** and **`v0_4_0__issues-fs__journalist-role.md`**
   - What: Role definitions for Historian (decision tracking) and Journalist (narrative/communication)
   - Why: SGraph Send has or may adopt these roles. Having canonical definitions ensures consistency
   - **Action:** Import to `team/roles/` for each role, or to `library/guides/agentic-role-ecosystem/`

### Tier 1: Architecture & Coordination

6. **`v0.1.0__issues-fs__role-architecture-framework-analysis.md`**
   - What: How roles, responsibilities, and boundaries are structured in a role-based agent system
   - Why: Explains the *framework* that underpins how SGraph Send coordinates across roles (Dev, QA, DevOps, etc.)
   - **Action:** Import to `library/guides/agentic-setup/` as "role-architecture-framework"

7. **`v0.1.0__issues-fs__role-based-agent-coordination.md`**
   - What: Coordination patterns when agents have distinct roles with handoff points
   - Why: Directly applicable to how SGraph Send coordinates across Explorer, Villager, and Town Planner teams
   - **Action:** Import to `library/guides/agentic-setup/` as "role-based-agent-coordination"

8. **`v0.4.0__issues-fs__architecture-overview.md`**
   - What: High-level architecture of Issues-FS system (memory-FS, graph storage, role coordination)
   - Why: Issues-FS architecture influenced SGraph Send (vault as storage abstraction, issues-FS for project tracking). Understanding the source clarifies design decisions
   - **Action:** Import to `library/dependencies/issues-fs/` as architectural reference

### Tier 1: Lexicon & Semantics

9. **`v0_4_0__issues-fs__lexicon-architecture-v2.md`**
   - What: How to build a consistent lexicon (vocabulary) across a distributed system
   - Why: Relevant to the semantic graphs work (what terms mean, how to define ontologies consistently)
   - **Action:** Import to `library/guides/` as "semantic-lexicon-design"

### Supporting Resources

10. **`guide__agentic-role-based-workflow.md`** (already in SG Send; flagged for clarity)
    - This is already in the SGraph Send repo at `library/guides/agentic-setup/`
    - Verify it's the current version from Issues-FS

---

## Integration Plan

### **Phase 1: Immediate (This Sprint)**

**Destination:** `library/concepts/` (new folder)
- Copy `thinking-in-graphs.md` → `library/concepts/v0_4_0__thinking-in-graphs.md`
- Copy `compatibility-through-connectivity.md` → `library/concepts/v0_4_0__compatibility-through-connectivity.md`
- Copy `lexicon-architecture-v2.md` → `library/concepts/v0_4_0__lexicon-architecture.md`
- **Action:** Create a `library/concepts/README.md` that lists these as foundational references

**Destination:** `library/guides/agentic-setup/`
- Copy `role-ecosystem-guide.md` → `library/guides/agentic-setup/v0_4_0__role-ecosystem-guide.md`
- Copy `role-architecture-framework-analysis.md` → `library/guides/agentic-setup/v0.1.0__role-architecture-framework.md`
- Copy `role-based-agent-coordination.md` → `library/guides/agentic-setup/v0.1.0__role-based-coordination.md`

**Destination:** `team/roles/` (if roles are adopted)
- Copy `cartographer-role.md` → `team/roles/cartographer/REFERENCE__from-issues-fs.md`
- Copy `historian-role.md` → `team/roles/historian/REFERENCE__from-issues-fs.md` (if role is adopted)
- Copy `journalist-role.md` → `team/roles/journalist/REFERENCE__from-issues-fs.md` (if role is adopted)

**Destination:** `library/dependencies/issues-fs/`
- Copy `architecture-overview.md` → `library/dependencies/issues-fs/v0.4.0__architecture-overview.md`

### **Phase 2: Integration (Next Sprint)**

- Update `.claude/CLAUDE.md` to reference these foundational documents
- Add cross-references from June 1-4 briefs to these Issues-FS documents
- Update the Librarian's reality document to note these as foundational sources

---

## Cross-References to Add

Once imported, add these references:

1. **In `.claude/CLAUDE.md`:**
   - "Before starting any architecture decision, read `library/concepts/thinking-in-graphs.md`"

2. **In June 4 briefs (Tier 0):**
   - Brief #2 (skill-as-projection) → Reference `thinking-in-graphs.md` as the intellectual foundation
   - Brief #3 (NHI 2.0) → Reference `compatibility-through-connectivity.md` for how systems evolve

3. **In team role definitions:**
   - Each role definition should reference the Issues-FS version as "canonical source"

4. **In the Librarian's reality document:**
   - Add a section: "Foundational Concepts" pointing to these philosophy documents

---

## Naming & Versioning

All documents retain their original version prefixes from Issues-FS (v0_4_0, v0.1.0, etc.). Do **not** update them to match SGraph Send's v0.33.19. These are external references, not SGraph Send artifacts.

---

## One-Line Impact

**Before:** SGraph Send's team and briefs reference concepts like "meaning through connectivity" and "role ecosystem" without the source documents explaining them.

**After:** Every team member can read the canonical sources directly in the library.

---

## Sign-Off

Once imported, please create a master index entry in `team/roles/librarian/reviews/06/11/` documenting:
- What was imported
- Where it lives
- Cross-references added
- Any gaps found during import

---

**Files in this package:** 10 `.md` files  
**Total size:** ~400 KB  
**Time to integrate:** ~2 hours  
**Dependencies:** None (all documents are self-contained references)

---

Proceed at your discretion. The briefing pack for the LinkedIn agent is ready independently of this integration, but having these documents in the repo will significantly improve clarity for all agents going forward.
