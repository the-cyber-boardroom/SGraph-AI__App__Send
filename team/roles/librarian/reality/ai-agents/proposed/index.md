# AI Agents — Proposed Items Index

**Domain:** ai-agents/proposed/ | **Last updated:** 2026-07-18 | **Maintained by:** Librarian (daily run)

All items are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

This index was split from a 408-line monolith into topic files on 2026-06-28 (Librarian B-003).
The previous full index is preserved in git history on commit before this date.

---

## Topic Files

| Topic File | What It Covers | P-Number Range |
|------------|----------------|----------------|
| [`llm-components.md`](llm-components.md) | sg-llm component family, agentic tool execution, multi-agent chat, developer experience, observable LLM orchestration, Unified Observability REPL, Bedrock CLI, observability pipeline, AgentCore resell products, Nova + AgentCore POC | sg-llm (no P#); P-142–P-146 |
| [`agent-communication.md`](agent-communication.md) | MCP gaps, sgit CLI extensions, communication vault pattern, QA stack on SG/Compute, AppSec mini-tools, three-agent comms demo vault + PKI | P-159–P-164; P-312, P-315, P-316 |
| [`workflows.md`](workflows.md) | Scheduled and autonomous tasks, accountant demo, archiver-cataloguer pattern, agentic incident-response service | P-147–P-152; P-238–P-247 |
| [`skills-economy.md`](skills-economy.md) | Partner integrations (Netlify, Daytona, Convex, Pi, HeyGen), skills creator economy, ownership+maintenance model, skills deepened (06/04), NHI 2.0 agent-identity cross-domain items | P-288–P-305; P-317–P-321; P-325, P-328, P-332 |
| [`risk-mandate.md`](risk-mandate.md) | Agent blast-radius service, assessment template, WhatsApp case study, Odysseus evidence vault, formal Agent Mandate ontology, authorization ontology + delegation, how-not-why scope + mandate architecture, Wardley map series, risk acceptance service MVP, multi-stakeholder workflow, personal scenario, Calendly review, risk register architecture, digital twins, semantic graph engine, 2FA MVP, AWS risk engine (Python + browser + ontology), evidence economy (news vaults, force of proof, packs-as-service), experience loop | P-353–P-357; P-376–P-379; P-387–P-430 |

---

## Quick P-Number Lookup

| P-Number Range | Topic File |
|----------------|------------|
| sg-llm component family (no P#) | `llm-components.md` |
| P-142–P-146 (Nova + AgentCore POC) | `llm-components.md` |
| P-147–P-152 (Accountant demo) | `workflows.md` |
| P-159–P-164 (AppSec mini-tools) | `agent-communication.md` |
| P-238–P-247 (Archiver-cataloguer) | `workflows.md` |
| P-247 (Agentic incident response) | `workflows.md` |
| P-288–P-298 (Partner integrations + skills marketplace) | `skills-economy.md` |
| P-300–P-305 (Skills economy deepened) | `skills-economy.md` |
| P-312, P-315, P-316 (Vault comms demo, skills library, vault platform positioning) | `agent-communication.md` |
| P-317–P-321 (Skills deepened 06/04) | `skills-economy.md` |
| P-325, P-328, P-332 (NHI 2.0 agent-identity) | `skills-economy.md` |
| P-353–P-357 (Agent blast-radius mapping service) | `risk-mandate.md` |
| P-376–P-379 (Assessment template, WhatsApp case study) | `risk-mandate.md` |
| P-387–P-393 (Odysseus vault, formal ontology, translation layer) | `risk-mandate.md` |
| P-394–P-397 (Authorization ontology, delegation) | `risk-mandate.md` |
| P-399–P-403 (Observability-risk, potential/real mandate, mandate-to-operate, agent mandate graph) | `risk-mandate.md` |
| P-404–P-409 (Wardley maps, risk acceptance MVP, multi-stakeholder workflow, agentic freelancing, personal scenario) | `risk-mandate.md` |
| P-411 (Calendly RiskMandate review template) | `risk-mandate.md` |
| P-412 (Healthcare data-protection pattern) | `security/proposed/index.md` |
| P-413–P-414 (Risk register as graph, five whys as translator) | `risk-mandate.md` |
| P-415–P-418 (Digital twins: integration layer, 2FA demo, twin-of-anything, world model) | `risk-mandate.md` |
| P-419–P-421 (Semantic graph ontology, directed edges + query engine, paths as language) | `risk-mandate.md` |
| P-422 (2FA end-to-end MVP) | `risk-mandate.md` |
| P-423–P-430 (AWS risk engine, evidence economy) | `risk-mandate.md` |

---

## Notes

**P-numbering discrepancy (P-404–P-410):** A minor discrepancy exists between the P-numbers in `risk-mandate.md` (P-408 = agentic freelancing; P-409 = personal scenario) and the June 26 master index (P-408 = personal scenario; P-410 = agentic freelancing). The descriptions are correct in both; use the description not the number when resolving ambiguity.

**Early-item monolith reference:** For items without P-numbers (sg-llm family, agentic tool execution, multi-agent, scheduled tasks, developer experience, MCP gaps, sgit CLI extensions), the full specification is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted in each topic file).
