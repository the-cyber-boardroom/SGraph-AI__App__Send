# Compatibility Through Connectivity: Testing Across Artifact Types

**Document:** issues-fs__compatibility-through-connectivity  
**Version:** v1.0  
**Date:** 2026-02-05  
**Status:** Foundational  
**Depends On:** issues-fs__thinking-in-graphs v1.0  

---

## Executive Summary

This document extends the "Thinking in Graphs" philosophy to its natural conclusion: **compatibility is measured by comparing graphs extracted from different representations of the same system**. An architect writes prose, draws diagrams, and imagines behavior. Developers write code. DevOps writes deployment configs. The system produces runtime traces. These are all different *languages* expressing what should be the *same truth*.

The question we're answering is not "does the code work?" but rather:

> **"Does the system work the way the architect thinks it works?"**

Or more precisely:

> **"Do all representations of this system agree on what it is?"**

This is compatibility testing. And just like meaning comes from connectivity within a graph, **compatibility comes from connectivity across graphs**.

---

## Part 1: The Problem of Multiple Representations

### Systems Are Described Many Times

A typical system has many descriptions:

| Artifact | Language | Author | Purpose |
|----------|----------|--------|---------|
| Architecture docs | Natural language | Architect | Explain intent and rules |
| Diagrams | Visual language | Architect | Show structure and flow |
| ADRs | Natural language | Architect | Capture decisions |
| Code | Programming language | Developer | Implement behavior |
| Tests | Programming language | Developer | Verify behavior |
| API specs | Specification language (OpenAPI) | Developer | Define interfaces |
| Configs | Declarative language (YAML, HCL) | DevOps | Deploy infrastructure |
| Runbooks | Natural language | Ops | Operate the system |
| Logs/Traces | Behavioral data | The System | Record what actually happens |

Each is a representation of the same underlying reality. Each uses a different language. Each is created by a different person (or the system itself).

### The Assumption of Alignment

We assume these representations are aligned. When the architect writes "all external traffic goes through the API Gateway," we assume:
- The diagram shows arrows going through the gateway
- The code routes requests through the gateway
- The Kubernetes config exposes only the gateway
- The runtime traces show traffic flowing through the gateway

But we rarely verify this assumption. We hope they align. We review them separately. Drift accumulates silently.

### The Cost of Misalignment

When representations diverge:

**Security vulnerabilities:** Architect documents a security boundary that doesn't exist in code.

**Operational surprises:** Runbook describes a failover process that the actual config doesn't support.

**Onboarding confusion:** New developer reads the architecture docs, then looks at the code, and they don't match.

**Audit failures:** Compliance documentation claims certain controls exist, but implementation differs.

**Debugging nightmares:** "The diagram says this should never happen, but it's happening."

Misalignment between representations is a major source of system failures, security breaches, and organizational dysfunction.

---

## Part 2: The Core Insight

### Every Artifact Is a Graph

From "Thinking in Graphs," we know: everything can be represented as a graph of nodes and edges. This applies to every artifact type:

**Text (Architecture Documentation):**
```
Document
├── Section: "API Gateway"
│   ├── describes → API_Gateway (Component)
│   ├── states_rule → "all external traffic through gateway"
│   └── mentions → Kong (Technology)
```

**Diagram (ASCII or Visual):**
```
Diagram
├── Box: "External_Client"
│   └── arrow_to → Box: "API_Gateway"
├── Box: "API_Gateway"
│   └── arrow_to → Box: "User_Service"
│   └── arrow_to → Box: "Order_Service"
```

**Code:**
```
Codebase
├── Module: "gateway"
│   ├── function: handle_request()
│   │   └── calls → route_to_service()
│   └── function: authenticate()
├── Module: "user_service"
│   └── function: handle_user_request()
│       └── called_by → gateway.route_to_service()
```

**Config (Kubernetes):**
```
Deployment
├── Service: "api-gateway"
│   └── type: LoadBalancer (external)
├── Service: "user-service"
│   └── type: ClusterIP (internal)
```

**Runtime Traces:**
```
Trace
├── Span: "incoming_request"
│   └── child → Span: "gateway_auth"
│       └── child → Span: "user_service_call"
```

Each artifact type produces a graph. The graphs use different vocabularies (nodes have different types), but they describe the same system.

### Compatibility Is Graph Comparison

If we can extract a graph from each artifact, we can compare them.

The text says: "All external traffic must pass through API Gateway"
→ Extracts to: `Rule(subject: External, action: pass_through, object: API_Gateway)`

The diagram shows: External → Gateway → Services
→ Extracts to: `Path(External, Gateway, Services)` with no path bypassing Gateway

The code does: All external handlers call gateway functions
→ Extracts to: `CallGraph(external_handlers → gateway_module → service_modules)`

The config declares: Only gateway service is type LoadBalancer
→ Extracts to: `ExposedServices([API_Gateway])`, all others ClusterIP

The traces show: All external requests have gateway spans
→ Extracts to: `AllTraces(external_request → gateway_span → service_span)`

**Compatibility question:** Do these five graphs agree?

If yes: The system is coherent. Design matches implementation matches runtime.

If no: There's drift. Someone's understanding is wrong. Find it. Fix it.

---

## Part 3: The Two Types of Tests

### Extraction Tests (Always Pass)

Extraction tests verify that we can accurately extract what an artifact says. They don't judge whether what it says is *correct* — they confirm we *understood* it.

```python
class TextExtractionTest:
    """Confirms: I can accurately extract rules from architecture docs."""
    
    def test_extract_gateway_rule(self):
        text = load("architecture.md", section="API Gateway")
        graph = extract_semantic_graph(text, ontology="architecture-v1")
        
        rule = graph.find(Traffic_Rule, 
                          subject="external_traffic",
                          object="API_Gateway")
        
        # This test PASSES because the text contains this rule
        # We're not testing if the rule is correct
        # We're testing if we can extract it
        assert rule is not None
        assert rule.modal == "must"
        assert rule.action == "pass_through"
```

```python
class DiagramExtractionTest:
    """Confirms: I can accurately extract structure from diagrams."""
    
    def test_extract_gateway_structure(self):
        diagram = load("containers.ascii")
        graph = extract_diagram_graph(diagram)
        
        external = graph.find_all(type="external")
        gateway = graph.find(name="API_Gateway")
        services = graph.find_all(type="service")
        
        # Verify we extracted the structure correctly
        for ext in external:
            assert graph.has_path(ext, gateway)
        for svc in services:
            assert graph.has_path(gateway, svc)
```

```python
class CodeExtractionTest:
    """Confirms: I can accurately extract behavior from code."""
    
    def test_extract_request_handling(self):
        code = analyze_codebase("./src")
        graph = extract_call_graph(code)
        
        external_handlers = graph.find_all(handles="external_request")
        gateway_module = graph.find(module="gateway")
        
        # We're extracting what the code ACTUALLY does
        # Not judging if it's right
        for handler in external_handlers:
            calls = graph.calls_from(handler)
            # Record the actual behavior
            self.record_behavior(handler, calls)
```

**Key principle:** Extraction tests always pass (assuming the extraction logic works). They confirm *what is*, not *what should be*.

This is analogous to the bug test pattern: a bug test passes when the bug exists, because we're confirming we can detect the bug. Similarly, an extraction test passes when we successfully extract the content, regardless of whether that content is "correct."

### Compatibility Tests (The Real Question)

Compatibility tests compare extracted graphs to see if they agree.

```python
class CompatibilityTest:
    """The real test: Do all representations agree?"""
    
    def test_gateway_rule_compatibility(self):
        # Extract from all sources
        text_graph = extract_from_text("architecture.md")
        diagram_graph = extract_from_diagram("containers.ascii")
        code_graph = extract_from_code("./src")
        config_graph = extract_from_config("./k8s")
        trace_graph = extract_from_traces("./traces")
        
        # Get the "gateway rule" from each representation
        text_rule = text_graph.get_rule("external_through_gateway")
        diagram_structure = diagram_graph.get_paths(from_="external", to="internal")
        code_behavior = code_graph.get_call_paths(from_="external_handler")
        config_exposure = config_graph.get_exposed_services()
        trace_paths = trace_graph.get_request_paths(type="external")
        
        # THE REAL TEST: Do they agree?
        compatibility = assess_compatibility(
            text_says       = text_rule,
            diagram_shows   = diagram_structure,
            code_does       = code_behavior,
            config_declares = config_exposure,
            traces_show     = trace_paths,
        )
        
        if not compatibility.all_agree:
            self.report_divergence(compatibility)
            
        assert compatibility.all_agree, \
            f"Representations diverge: {compatibility.summary}"
```

---

## Part 4: The Five Layers

### Layer 1: Text (What the Architect Wrote)

Architecture documents, ADRs, design docs, READMEs, comments.

**Language:** Natural language (English, etc.)

**Extracted Graph:**
- Components, relationships, rules, constraints
- Claims about behavior ("must," "never," "always")
- Justifications and rationale

**Extraction Method:**
- NLP + LLM semantic extraction
- O&T-guided multi-pass extraction
- Linked to Lexicon anchors

**Example Rule Extraction:**
```
Source: "All external traffic must pass through the API Gateway for authentication"

Extracted:
  Traffic_Rule:
    subject: external_traffic
    modal: must
    action: pass_through
    object: API_Gateway
    reason: authentication
```

### Layer 2: Diagram (What the Architect Drew)

Architecture diagrams, flow charts, sequence diagrams, data flow diagrams.

**Language:** Visual language (boxes, arrows, swimlanes)

**Extracted Graph:**
- Nodes (boxes) with names and types
- Edges (arrows) with directions and labels
- Containment (nested boxes)
- Zones and boundaries

**Extraction Method:**
- Parse structured formats (Mermaid, PlantUML, Structurizr DSL)
- OCR + visual analysis for images
- ASCII art parsing

**Example Structure Extraction:**
```
Source: 
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ External │────▶│ Gateway  │────▶│ Service  │
  └──────────┘     └──────────┘     └──────────┘

Extracted:
  Nodes: [External, Gateway, Service]
  Edges: [External→Gateway, Gateway→Service]
  Implied: No direct path from External to Service
```

### Layer 3: Code (What Developers Implemented)

Source code, modules, classes, functions, dependencies.

**Language:** Programming language (Python, Go, TypeScript, etc.)

**Extracted Graph:**
- Modules, classes, functions
- Call relationships
- Import dependencies
- Data flow

**Extraction Method:**
- AST parsing
- Static analysis
- Dependency scanning

**Example Behavior Extraction:**
```
Source:
  # gateway/router.py
  def handle_external_request(request):
      if not authenticate(request):
          return 401
      service = route_to_service(request.path)
      return service.handle(request)

Extracted:
  Function: handle_external_request
    handles: external_request
    calls: [authenticate, route_to_service, service.handle]
    pattern: authenticate_then_route
```

### Layer 4: Config (What's Actually Deployed)

Kubernetes manifests, Terraform, Docker Compose, cloud configs.

**Language:** Declarative configuration (YAML, HCL, JSON)

**Extracted Graph:**
- Deployed services
- Network policies
- Exposed endpoints
- Resource relationships

**Extraction Method:**
- Parse config files
- Query live infrastructure APIs
- Merge declared + actual state

**Example Deployment Extraction:**
```
Source:
  # k8s/gateway-service.yaml
  apiVersion: v1
  kind: Service
  metadata:
    name: api-gateway
  spec:
    type: LoadBalancer
    ports:
      - port: 443

Extracted:
  Service: api-gateway
    exposure: LoadBalancer (external)
    ports: [443]
    
  Service: user-service
    exposure: ClusterIP (internal only)
```

### Layer 5: Traces (What Actually Happens)

Runtime logs, distributed traces, metrics, actual behavior.

**Language:** Behavioral data (spans, logs, events)

**Extracted Graph:**
- Request paths
- Service interactions
- Timing and dependencies
- Error patterns

**Extraction Method:**
- Parse OpenTelemetry traces
- Analyze log patterns
- Build runtime call graph

**Example Behavior Extraction:**
```
Source:
  Trace ID: abc123
  Spans:
    - name: "HTTP GET /users"
      service: api-gateway
      children:
        - name: "authenticate"
          service: api-gateway
        - name: "get_user"
          service: user-service

Extracted:
  Request: GET /users
    path: [api-gateway, user-service]
    passed_through: api-gateway (confirmed)
```

---

## Part 5: Compatibility Assessment

### What Agreement Means

Two representations "agree" on a rule if:
1. Both express the rule (or its equivalent)
2. The expressions are logically compatible
3. No contradictions exist

**Example: "All external traffic through gateway"**

| Layer | Expression | Agreement |
|-------|------------|-----------|
| Text | "must pass through" | ✓ Explicit rule |
| Diagram | External → Gateway → Services (no bypass) | ✓ Structure enforces |
| Code | All handlers call gateway first | ✓ Implementation matches |
| Config | Only gateway is LoadBalancer | ✓ Deployment enforces |
| Traces | All external requests have gateway span | ✓ Runtime confirms |

All five agree → **Compatible**

### What Divergence Means

Representations diverge when they express different things:

| Layer | Expression | Agreement |
|-------|------------|-----------|
| Text | "must pass through" | States rule |
| Diagram | External → Gateway → Services | Matches text |
| Code | Most handlers call gateway, but `admin_handler` calls `user_service` directly | **DIVERGES** |
| Config | Gateway is LoadBalancer, but `user-service` also has NodePort 30080 | **DIVERGES** |
| Traces | 99.2% through gateway, 0.8% bypass via admin endpoint | **DIVERGES** |

Text and diagram agree, but code, config, and traces show violations.

**This is not a test failure in the traditional sense.** It's a detection of misalignment. The question becomes: which representation is "correct"?

- Maybe the code has a legitimate exception the docs should mention
- Maybe the NodePort is a debugging leftover that should be removed
- Maybe the admin bypass is a security vulnerability

The compatibility test surfaces the divergence. Humans decide what to do.

### The Compatibility Report

```
═══════════════════════════════════════════════════════════════════════════
                    ARCHITECTURE COMPATIBILITY REPORT
                    Generated: 2026-02-05 14:30:00 UTC
═══════════════════════════════════════════════════════════════════════════

RULE: "All external traffic must pass through API Gateway"
Source: architecture.md, Section 2, Paragraph 1

  LAYER          STATUS    DETAILS
  ─────────────────────────────────────────────────────────────────────────
  Text           ✓ PASS    Rule extracted: Traffic_Rule(external → gateway)
  
  Diagram        ✓ PASS    All External nodes connect through Gateway
                           No direct paths to internal services found
  
  Code           ✗ FAIL    2 violations detected:
                           • admin_handler.py:45 → calls user_service directly
                           • health_check.py:12 → calls order_service directly
  
  Config         ✗ FAIL    1 violation detected:
                           • user-service has NodePort 30080 (externally accessible)
  
  Traces         ⚠ WARN    99.2% compliant, 847 requests bypassed gateway
                           Bypass sources: admin-portal (812), health-checks (35)

  COMPATIBILITY: PARTIAL (2 of 5 layers fully compliant)
  
  RECOMMENDATIONS:
  1. Review admin_handler bypass - is this intentional?
  2. Remove NodePort 30080 from user-service or document exception
  3. If health-check bypass is intentional, document in architecture.md

═══════════════════════════════════════════════════════════════════════════

RULE: "Orders can only move forward in state"
Source: architecture.md, Section 3, State Machine

  LAYER          STATUS    DETAILS
  ─────────────────────────────────────────────────────────────────────────
  Text           ✓ PASS    Rule extracted: State_Rule(order, forward_only)
  
  Diagram        ✓ PASS    State diagram shows unidirectional transitions
                           No backward arrows detected
  
  Code           ✓ PASS    OrderStateMachine class enforces forward transitions
                           Backward transition attempts raise InvalidTransition
  
  Config         ○ N/A     No deployment-level state machine config
  
  Traces         ✓ PASS    0 backward transitions in 1.2M order events

  COMPATIBILITY: FULL (all applicable layers compliant)

═══════════════════════════════════════════════════════════════════════════

RULE: "Card numbers never enter our system"
Source: architecture.md, Section 5, PII Rules

  LAYER          STATUS    DETAILS
  ─────────────────────────────────────────────────────────────────────────
  Text           ✓ PASS    Rule extracted: Data_Rule(card_number, never_stored)
  
  Diagram        ✓ PASS    PII flow shows card data → Stripe (external)
                           No card data flows to internal datastores
  
  Code           ✓ PASS    No "card_number" field in any model
                           PaymentService uses Stripe tokens only
  
  Config         ✓ PASS    No PII-flagged fields in database schemas
  
  Traces         ✓ PASS    No card patterns detected in logged data
                           (PII scanner ran on 30 days of logs)

  COMPATIBILITY: FULL (all layers compliant)

═══════════════════════════════════════════════════════════════════════════

SUMMARY
───────────────────────────────────────────────────────────────────────────
  Rules Checked:         15
  Fully Compatible:      12 (80%)
  Partially Compatible:   2 (13%)
  Incompatible:           1 (7%)
  
  Overall Health: GOOD (minor drift detected)
  
  Priority Actions:
  1. [HIGH] Fix gateway bypass in admin_handler.py
  2. [MED]  Remove or document NodePort on user-service
  3. [LOW]  Document health-check exception in architecture.md

═══════════════════════════════════════════════════════════════════════════
```

---

## Part 6: The Paradigm Shift

### Traditional Testing

```
         ┌─────────────────┐
         │   Requirements  │
         └────────┬────────┘
                  │ (manual translation)
                  ▼
         ┌─────────────────┐
         │      Code       │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │      Tests      │───────▶ Pass/Fail
         └─────────────────┘
         
Question: "Does the code do what we want?"
```

Tests are written by developers, based on their understanding of requirements. The tests check code behavior. If tests pass, we assume the system is correct.

**Problems:**
- Requirements may be misunderstood
- Tests may not cover all requirements
- No connection between architecture docs and tests
- Drift is invisible

### Compatibility Testing

```
    ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
    │    Text    │  │  Diagram   │  │    Code    │  │   Config   │  │   Traces   │
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
          │               │               │               │               │
          ▼               ▼               ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
    │   Text     │  │  Diagram   │  │   Code     │  │  Config    │  │   Trace    │
    │   Graph    │  │   Graph    │  │   Graph    │  │   Graph    │  │   Graph    │
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
          │               │               │               │               │
          └───────────────┴───────────────┴───────┬───────┴───────────────┘
                                                  │
                                                  ▼
                                    ┌───────────────────────────┐
                                    │   COMPATIBILITY TESTING   │───────▶ Report
                                    └───────────────────────────┘
                                    
Question: "Do all representations of this system agree?"
```

Every artifact produces a graph. Graphs are compared. Divergence is surfaced.

**Advantages:**
- Tests derive from architecture docs (not manual translation)
- All layers are compared (not just code)
- Drift is detected automatically
- The architect's intent is directly testable

---

## Part 7: Meaning Through Connectivity (Extended)

### Within a Graph: Nodes Get Meaning from Edges

From "Thinking in Graphs": a node like "Bug" is just a label until it connects to a definition. Meaning emerges from connectivity.

```
Bug-Node
  └── links_to → Lexicon:anchor__bug
                   └── links_to → schema.org/SoftwareBug
                   
Meaning: "This is a bug in the standard sense of the term"
```

### Across Graphs: Artifacts Get Meaning from Compatibility

Extended principle: an artifact's claims are just assertions until they're verified against other artifacts. **Meaning emerges from cross-graph compatibility.**

```
Text-Graph:
  Rule: "all external traffic through gateway"
  
Diagram-Graph:
  Structure: External → Gateway → Services
  
Code-Graph:
  Behavior: external_handler() → gateway.route() → service.handle()
  
Compatibility: All three agree
  
Meaning: "The gateway rule is real — it's designed, drawn, and implemented"
```

If they don't agree, the rule's meaning is uncertain:

```
Text-Graph:
  Rule: "all external traffic through gateway"
  
Code-Graph:
  Behavior: admin_handler() → service.handle() (bypasses gateway)
  
Compatibility: Divergence
  
Meaning: "The gateway rule is aspirational, not actual"
         "Either the text is wrong or the code is wrong"
         "We need to decide which is the source of truth"
```

### The Connectivity Hierarchy

```
         ┌───────────────────────────────────────────────────────────────────┐
         │                                                                   │
         │                    SEMANTIC COMPATIBILITY                         │
Level 3  │         "Do the different representations agree?"                 │
         │                                                                   │
         └───────────────────────────────────────────────────────────────────┘
                                        │
                                        │ depends on
                                        ▼
         ┌───────────────────────────────────────────────────────────────────┐
         │                                                                   │
         │                    LEXICON CONNECTIVITY                           │
Level 2  │         "Does this concept link to known definitions?"            │
         │                                                                   │
         └───────────────────────────────────────────────────────────────────┘
                                        │
                                        │ depends on
                                        ▼
         ┌───────────────────────────────────────────────────────────────────┐
         │                                                                   │
         │                    LOCAL CONNECTIVITY                             │
Level 1  │         "Does this node connect to other nodes?"                  │
         │                                                                   │
         └───────────────────────────────────────────────────────────────────┘
```

**Level 1:** A node has meaning within its graph based on its edges.

**Level 2:** A node has broader meaning by linking to shared vocabulary (Lexicon).

**Level 3:** An assertion has verified meaning by agreement across artifact types.

---

## Part 8: Practical Implementation

### The Extraction Pipeline

```python
class ArtifactExtractor:
    """Base class for extracting graphs from artifacts."""
    
    def extract(self, artifact: Artifact) -> Graph:
        """Extract a graph from an artifact."""
        raise NotImplementedError
    
    def get_ontology(self) -> Ontology:
        """Return the O&T used for extraction."""
        raise NotImplementedError


class TextExtractor(ArtifactExtractor):
    """Extracts graphs from text documents."""
    
    def extract(self, document: TextDocument) -> Graph:
        graph = Graph()
        
        # Multi-pass extraction
        entities = self.extract_entities(document)
        relationships = self.extract_relationships(document, entities)
        rules = self.extract_rules(document, entities)
        
        # Build graph
        for entity in entities:
            graph.add_node(entity)
        for rel in relationships:
            graph.add_edge(rel)
        for rule in rules:
            graph.add_node(rule)
            
        # Link to Lexicon
        self.link_to_lexicon(graph)
        
        return graph


class DiagramExtractor(ArtifactExtractor):
    """Extracts graphs from diagrams."""
    
    def extract(self, diagram: Diagram) -> Graph:
        graph = Graph()
        
        # Parse structure
        boxes = self.parse_boxes(diagram)
        arrows = self.parse_arrows(diagram)
        containments = self.parse_containments(diagram)
        
        # Build graph
        for box in boxes:
            graph.add_node(Component(name=box.label, type=box.type))
        for arrow in arrows:
            graph.add_edge(Connection(
                source=arrow.from_box,
                target=arrow.to_box,
                type=arrow.label or "connects_to"
            ))
            
        return graph


class CodeExtractor(ArtifactExtractor):
    """Extracts graphs from source code."""
    
    def extract(self, codebase: Codebase) -> Graph:
        graph = Graph()
        
        # Parse AST
        modules = self.parse_modules(codebase)
        functions = self.parse_functions(codebase)
        calls = self.analyze_call_graph(codebase)
        
        # Build graph
        for module in modules:
            graph.add_node(module)
        for function in functions:
            graph.add_node(function)
            graph.add_edge(Edge(function.module, function, "contains"))
        for call in calls:
            graph.add_edge(Edge(call.caller, call.callee, "calls"))
            
        return graph
```

### The Compatibility Engine

```python
class CompatibilityEngine:
    """Compares graphs from different artifacts."""
    
    def assess(self, rule: Rule, graphs: Dict[str, Graph]) -> CompatibilityResult:
        """
        Assess whether a rule is consistently represented across graphs.
        """
        results = {}
        
        for artifact_type, graph in graphs.items():
            # Find this rule's representation in this graph
            representation = self.find_representation(rule, graph, artifact_type)
            results[artifact_type] = representation
        
        # Compare all representations
        compatibility = self.compare_representations(results)
        
        return CompatibilityResult(
            rule=rule,
            representations=results,
            all_agree=compatibility.all_agree,
            divergences=compatibility.divergences,
            recommendations=self.generate_recommendations(compatibility)
        )
    
    def find_representation(self, rule: Rule, graph: Graph, artifact_type: str):
        """Find how a rule is expressed in a specific artifact type."""
        
        if artifact_type == "text":
            # Look for explicit rule statements
            return graph.find_rules(matching=rule.pattern)
            
        elif artifact_type == "diagram":
            # Look for structural patterns that imply the rule
            return graph.find_structural_pattern(rule.structural_form)
            
        elif artifact_type == "code":
            # Look for behavioral patterns that implement the rule
            return graph.find_behavioral_pattern(rule.behavioral_form)
            
        elif artifact_type == "config":
            # Look for declarations that enforce the rule
            return graph.find_declarations(enforcing=rule.pattern)
            
        elif artifact_type == "traces":
            # Look for runtime evidence of the rule
            return graph.find_runtime_pattern(rule.runtime_form)
    
    def compare_representations(self, representations: Dict) -> Comparison:
        """Compare representations across artifact types."""
        
        # Build compatibility matrix
        agreements = []
        divergences = []
        
        artifact_types = list(representations.keys())
        for i, type_a in enumerate(artifact_types):
            for type_b in artifact_types[i+1:]:
                rep_a = representations[type_a]
                rep_b = representations[type_b]
                
                if self.representations_agree(rep_a, rep_b):
                    agreements.append((type_a, type_b))
                else:
                    divergences.append(Divergence(
                        type_a=type_a,
                        type_b=type_b,
                        rep_a=rep_a,
                        rep_b=rep_b,
                        description=self.describe_divergence(rep_a, rep_b)
                    ))
        
        return Comparison(
            all_agree=len(divergences) == 0,
            agreements=agreements,
            divergences=divergences
        )
```

### CLI Integration

```bash
# Extract graph from each artifact type
issues-fs extract text architecture.md --output text-graph.json
issues-fs extract diagram containers.ascii --output diagram-graph.json
issues-fs extract code ./src --output code-graph.json
issues-fs extract config ./k8s --output config-graph.json
issues-fs extract traces ./traces --output trace-graph.json

# Run compatibility check
issues-fs compatibility check \
    --text text-graph.json \
    --diagram diagram-graph.json \
    --code code-graph.json \
    --config config-graph.json \
    --traces trace-graph.json \
    --output report.html

# Or all-in-one
issues-fs compatibility analyze \
    --architecture ./docs/architecture.md \
    --diagrams ./docs/diagrams/ \
    --code ./src \
    --config ./k8s \
    --traces ./traces \
    --output report.html
```

---

## Part 9: Why This Matters

### For Architects

"I can finally verify that what I documented is what got built."

The architect writes architecture docs and draws diagrams. Previously, these were static documents that might or might not reflect reality. Now, they're executable specifications. Every claim in the architecture docs becomes a testable assertion.

### For Developers

"I can understand the architect's intent and verify my code matches."

Developers often work from architecture docs that are out of date or ambiguous. With compatibility testing, they can run a check: "Does my code match what the architecture says?" If not, they either fix the code or update the architecture.

### For DevOps

"I can verify that the deployment matches the design."

Kubernetes configs, Terraform plans, and cloud configurations are yet another representation of the system. Compatibility testing includes them, ensuring that what's deployed matches what was designed and implemented.

### For Security

"I can verify that security boundaries exist, not just that they're documented."

Security requirements often live in documents that are never verified. "All external traffic through the gateway" is a security claim. Compatibility testing verifies it's true in code, config, and runtime — not just on paper.

### For Compliance

"I can prove that controls exist across all layers."

Auditors ask: "Show me that you encrypt data at rest." With compatibility testing, you can show: the architecture doc says it, the code implements it, the config enables it, and the traces confirm it. All layers agree.

### For the Organization

"We have a single source of truth for system understanding."

Currently, different people have different mental models of the system. The architect's model lives in their docs. The developer's model lives in their code. The ops model lives in their runbooks. Compatibility testing surfaces where these models diverge, enabling alignment.

---

## Part 10: The 10 Principles

1. **Every artifact is a graph.** Text, diagrams, code, config, traces — all can be represented as nodes and edges.

2. **Extraction tests confirm understanding.** Before comparing, verify you can accurately extract what each artifact says.

3. **Extraction tests always pass.** They're not judging correctness; they're confirming the extraction works.

4. **Compatibility tests compare graphs.** The real question is whether different representations agree.

5. **Divergence is information, not failure.** When representations disagree, someone learns something. Maybe the docs are wrong. Maybe the code is wrong. Either way, visibility is valuable.

6. **Meaning requires agreement.** A rule in architecture docs only has verified meaning if code, config, and runtime confirm it.

7. **Layers have different vocabularies.** Text uses natural language. Diagrams use visual language. Code uses programming language. The compatibility engine translates between them.

8. **Not all layers apply to all rules.** A state machine rule applies to text, diagrams, and code. It may not apply to deployment config. That's fine — compare what's applicable.

9. **Compatibility is continuous.** Run compatibility checks in CI/CD. Detect drift early. Don't wait for an incident to discover that docs and code diverged.

10. **The goal is coherence.** A coherent system is one where all representations agree on what it is. Compatibility testing measures coherence.

---

## Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| CC1 | **Two test types: extraction and compatibility** | Extraction tests confirm understanding. Compatibility tests compare understanding across artifacts. Separating them clarifies purpose. |
| CC2 | **Extraction tests always pass** | Like bug tests that pass when the bug exists. We're confirming detection, not judging correctness. |
| CC3 | **Five layers: text, diagram, code, config, traces** | These cover the major artifact types from design through runtime. More can be added. |
| CC4 | **Compatibility produces reports, not just pass/fail** | Divergence is nuanced. A report shows exactly what differs and where. Humans decide what to do. |
| CC5 | **Each layer uses its own extraction method** | Text needs NLP. Diagrams need parsing. Code needs AST analysis. No single method fits all. |
| CC6 | **Graphs are the common language** | Despite different source formats, all artifacts produce graphs. Graphs can be compared. |
| CC7 | **Rules are the unit of comparison** | We compare specific rules (e.g., "traffic through gateway"), not entire artifacts. This gives precise feedback. |
| CC8 | **Meaning requires cross-graph agreement** | Extending "Thinking in Graphs": meaning within a graph comes from edges; meaning across artifacts comes from compatibility. |

---

## References

- [Thinking in Graphs: Meaning Through Connectivity](./v0_4_0__issues-fs__thinking-in-graphs.md) — Foundational philosophy
- [Semantic Text Architecture](./v0_4_0__issues-fs__semantic-text-architecture.md) — Text extraction
- [Code Representations for Semantic Graphs](./v0_4_0__issues-fs__semantic-graph-code-representation.md) — Code representation
- [Issues-FS Lexicon Architecture](./v0_4_0__issues-fs__lexicon-architecture-v2.md) — Shared vocabulary

---

*Compatibility Through Connectivity v1.0*  
*A Foundational Document for Issues-FS*  
*Date: 2026-02-05*
