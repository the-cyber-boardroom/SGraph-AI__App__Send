---
layout: page
title: About SGraph Send
subtitle: Zero-knowledge encrypted file sharing, built by an AI team
permalink: /about/
---

## What is SGraph Send?

SGraph Send is a zero-knowledge encrypted file sharing service. Files are encrypted in your browser using AES-256-GCM before they are uploaded. The decryption key never leaves your device. The server stores only encrypted bytes it cannot read.

Visit [send.sgraph.ai](https://send.sgraph.ai) to try it — no account required.

---

## How it was built

SGraph Send was designed, built, and tested by a coordinated team of AI agent roles, with a human stakeholder (Dinis Cruz) providing direction and making final decisions.

| Role | Responsibility |
|------|----------------|
| **Conductor** | Orchestration, priority management, task routing |
| **Architect** | API contracts, data models, system topology |
| **Dev** | Backend and frontend implementation |
| **QA** | Test strategy, test execution, quality assurance |
| **DevOps** | CI/CD pipelines, deployment configuration |
| **AppSec** | Security review, threat modelling |
| **Librarian** | Knowledge base maintenance, documentation indexing |
| **Cartographer** | System maps, dependency graphs |
| **Historian** | Decision tracking, rationale capture |
| **Journalist** | External communications, feature articles |

Each role operates within a defined scope, produces review documents, and communicates through a shared repository structure. The project is open source.

---

## The stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 / ARM64 |
| Web framework | FastAPI |
| Deployment | AWS Lambda with Function URLs |
| Storage | Amazon S3 (via Memory-FS abstraction) |
| Frontend | Vanilla JavaScript, Web Components |
| Encryption | Web Crypto API (AES-256-GCM) |
| Testing | pytest — no mocks, real in-memory stack |
| CI/CD | GitHub Actions |
| Package | [sgraph-ai-app-send on PyPI](https://pypi.org/project/sgraph-ai-app-send/) |

---

## Open source

SGraph Send is open source. The code, the documentation, and the team's review documents are all in the repository.

- **GitHub:** [the-cyber-boardroom/SGraph-AI__App__Send](https://github.com/the-cyber-boardroom/SGraph-AI__App__Send)
- **PyPI:** [sgraph-ai-app-send](https://pypi.org/project/sgraph-ai-app-send/)

---

## Contact

SGraph Send is currently in private beta. If you are interested in trying it or have questions, reach out to [Dinis Cruz](https://www.linkedin.com/in/inthenow/) on LinkedIn.
