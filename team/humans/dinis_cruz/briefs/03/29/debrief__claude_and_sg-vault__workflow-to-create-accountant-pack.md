# From Raw Statements to Accountant-Ready Package: A Claude + SG/Send Workflow

*A debrief on using AI-assisted tooling to prepare company accounts materials*

---

## Overview

This document describes a workflow I developed to prepare the first statutory accounts materials for my UK limited company, working collaboratively with Claude (Anthropic's AI assistant) and SG/Send, an encrypted file vault platform built by SGraph.

The goal was straightforward: I had a pile of personal credit card statements, a Stripe export, and a general understanding of what my accountant would need — but no clean data, no ledger, and no package to hand over. What followed was an end-to-end collaborative process that turned raw PDFs into a structured, navigable accountant pack, with an interactive data exploration app built along the way.

---

## The Tools

### SG/Send and sgit

SG/Send is a zero-knowledge encrypted file vault — files are encrypted on your device before they leave, so the server never sees plaintext. It works like a git repository for encrypted files, with a companion CLI tool called `sgit` that handles versioning, branching, committing and pushing.

What made this collaboration possible was the `sgit clone` command with a Simple Token — I could share a snapshot of my vault with Claude using just a short token string, Claude could clone it, work inside it, commit changes, and push them back. I could then pull the updates locally and see exactly what had changed.

This created a genuine shared workspace: not a chat session where files get pasted back and forth, but a persistent, versioned, encrypted repository that both of us could read from and write to across multiple sessions.

The SG/Send web interface added another dimension — it renders markdown files with full link navigation, displays CSVs as formatted tables, and even renders HTML files in a built-in viewer. This meant the vault wasn't just a file store; it became a browsable, navigable document site.

### Claude

Claude acted as the technical and analytical partner throughout — writing and running Python scripts to parse PDFs, processing data, building the interactive expense browser app, and authoring the documentation. Crucially, Claude operated directly inside the sgit vault, so every change was immediately versioned and available to pull.

---

## The Workflow, Step by Step

### 1. Setting Up the Shared Vault

The session began with a voice memo: I described the situation, the history of the company, how I had been funding it, and what I wanted to achieve. Claude synthesised this into a structured plan and proposed a folder architecture and processing pipeline.

I then shared my vault with Claude using a Simple Token — a short identifier that allowed Claude to clone the encrypted vault, see its contents, and start working inside it. Within minutes, Claude had:

- Cloned the vault locally (in its sandboxed compute environment)
- Created a folder structure for raw statements, processed data and outputs
- Committed an initial `PLAN.md` and `INDEX.md`
- Pushed back to the remote vault

I pulled the changes locally, confirmed everything looked right, and we were off.

### 2. Ingesting the Raw Data

I uploaded my source files directly in the chat — credit card statement PDFs from two cards, and CSV exports from Stripe. Claude copied these into the vault's folder structure and immediately began analysing them.

For the credit card PDFs, Claude wrote tailored Python parsers using `pdfplumber` — one for each card's statement format. UK bank statement PDFs vary significantly in how they lay out transaction tables; Claude inspected the raw text and structure of sample pages before writing the extraction logic, then ran the parsers across all statements in batch. The result was normalised CSV files with a consistent schema: date, description, amount, card source, statement filename.

For the Stripe data, Claude parsed the CSV exports directly, identifying paid invoices, payout destinations (which banks received the money), and any cancelled or failed payments — all of which had different implications for how they should be treated in the accounts.

Everything extracted was committed to the vault at each stage, so there was always a clean checkpoint to return to.

### 3. Categorisation and the Director's Loan

The core analytical challenge was working out which transactions from my personal credit cards were legitimate company expenses — to be treated as a Director's Loan — and which were personal spend to be excluded.

Claude applied a layered categorisation approach:

- A set of pattern-matching rules identified obviously personal items (supermarket shops, health and medical, personal travel, entertainment) and moved them to an exclusion list
- Remaining transactions were categorised into business expense groups: workspace costs (cafes, restaurants), software and subscriptions, travel and transport, business services and tools, accommodation, bank fees
- Stripe income received into my personal bank account (rather than the company account) was tracked separately as a debit against the Director's Loan balance

The Director's Loan Account was then calculated: credits (business expenses I had personally funded) minus debits (company income I had personally received) equals the net amount the company owes me. This is a standard UK mechanism for startup founders who fund early operations personally before a company bank account is established.

All of this was iterative — I reviewed the numbers, asked Claude to refine the categorisation rules, and the data was reprocessed and recommitted each time.

### 4. The Interactive Expense Browser

One of the most valuable outputs of the session was an interactive web application Claude built and embedded directly in the vault.

The app is a single self-contained HTML file with all transaction data embedded — no server, no database, no dependencies beyond a charting library loaded from a CDN. It can be opened by double-clicking the file, or rendered natively inside the SG/Send vault viewer.

The application provided:

- **Three views**: business expenses, personal exclusions, and all expenses combined
- **Donut charts** showing the category breakdown for both business and personal transactions
- **Filtering and sorting** by card, month, category and amount
- **Clickable column headers** for sorting in any direction
- **A reclassification tool**: a pencil icon on every row opened a popup allowing me to reassign any transaction to a different business category or mark it as personal — with a live preview and instant update to the totals and charts
- **A changes log** at the bottom of the page, tracking every reclassification I made, with undo buttons and a "Copy for Claude" button that formatted all my changes as a clean message I could paste back into the chat

This last feature — the reclassification workflow — was the key feedback loop. I would open the app, browse through transactions, spot things that were miscategorised, use the popup to reclassify them, copy the log, and paste it back to Claude. Claude would then apply those changes to the underlying data, rebuild the app with updated figures, commit the new version to the vault, and I would pull it and continue.

This created a tight, efficient loop between human review and automated processing — I was providing domain knowledge and judgement; Claude was handling the data manipulation and rebuilding.

### 5. Vault Organisation and Navigation

As the materials grew, Claude restructured the vault into a clean hierarchy that separated concerns clearly:

```
business__the-cyber-boardroom/
├── accountant-pack/          ← The deliverable
│   └── supporting/           ← Evidence and ledgers
├── statements/               ← Source PDFs and CSVs
│   ├── virgin-money/
│   ├── mbna/
│   └── stripe/
├── processed/                ← Cleaned transaction data
└── tools/                    ← The expense browser app

personal__dinis-cruz/         ← Excluded personal transactions

_internal/                    ← Scripts, planning, working files
```

Every folder has a `README.md` that explains what's in it and links to every file it contains. Every markdown file has a breadcrumb navigation bar at the top — using clickable markdown links — so navigating the vault in the SG/Send UI feels like browsing a small website rather than a raw file system.

The SG/Send interface rendered all of this beautifully: markdown tables with clickable file links, breadcrumbs that actually navigated, the HTML expense browser opening inline in the viewer. The vault became a navigable document site rather than a folder of files.

### 6. The Accountant Pack

The final deliverable is a structured package designed so an accountant can open it, understand the situation quickly, and get to work.

The entry point is a `START HERE.md` document that gives an overview of the company, the accounting period, and the key proposed figures — framed explicitly as recommendations for the accountant's review rather than statements of fact.

The main narrative is the `ACCOUNTANT DEBRIEF.md` — a detailed document covering company background, income, the proposed treatment of expenses as a Director's Loan, the Director's Loan Account calculation, proposed P&L and balance sheet, and a set of specific observations and open questions where the accountant's professional judgement is needed.

Throughout the documentation, the language was deliberately softened to reflect that the director is not an accountant: "it is suggested", "it is recommended", "your view on this would be helpful" — rather than asserting treatments as correct. The accountant receives proposals, not instructions.

Supporting the narrative are:

- CSV files for the P&L, balance sheet, and DLA monthly summary
- A full transaction-level DLA ledger
- The categorised business expense CSV
- The excluded personal expense CSV with reason codes
- Stripe income and payout data with FX conversion workings
- All original source PDFs

---

## What Made This Work

### The Vault as Collaboration Medium

The sgit/SG/Send combination solved a problem that's easy to underestimate: how do you work collaboratively with an AI on files that persist between sessions? Chat sessions are ephemeral. Pasting file contents back and forth is error-prone and loses structure. The vault gave both parties a shared, versioned, structured filesystem that survived session boundaries and could be inspected, modified and pushed from either side.

### Processing Power Applied to Tedious Work

PDF parsing, transaction categorisation, data normalisation and ledger calculation are exactly the kind of work that is tedious and error-prone for humans but well-suited to automated processing. Claude wrote and ran the code, handled the edge cases (different date formats, foreign currency transactions, statement layout variations), and produced clean structured outputs — work that would have taken days of manual spreadsheet work.

### The App as a Feedback Interface

The expense browser app solved a specific problem: how do I review 985 transactions efficiently and communicate my classification decisions back to Claude? The answer was to build the review interface into the output itself. Rather than exporting a CSV, opening it in Excel, making notes, and then translating those notes back into instructions for Claude, the app provided a purpose-built classification interface that generated machine-readable output in exactly the format Claude needed to act on it.

### Tone and Framing for the Final Audience

The accountant was the ultimate audience, and the documentation was written with that in mind throughout — clear structure, honest about uncertainty, explicit about what needs professional input, and careful not to overstate the director's understanding of accounting treatment. The goal was to make the accountant's job easier, not to present a finished set of accounts.

---

## The Result

At the end of the session, I had a clean, navigable, encrypted vault containing:

- All source evidence (35 PDF statements, Stripe CSV exports)
- Processed and categorised transaction data
- A proposed Director's Loan Account calculation
- Draft P&L and balance sheet
- A full narrative debrief for the accountant with open questions flagged
- An interactive expense browser for exploring the data
- READMEs in every folder linking to every file
- Breadcrumb navigation across all documents

The vault was shared with my accountant using a Simple Token — a short string that decrypts and downloads the entire package. No email attachments, no shared drives, no plain-text financial data in transit.

---

## Reflections

This workflow points toward something broader: the combination of a persistent encrypted shared workspace, a capable AI that can write and run code directly inside that workspace, and a rendering layer that makes structured documents navigable — creates a genuinely new way to collaborate on complex analytical and documentation tasks.

The AI doesn't just answer questions; it does work. The vault doesn't just store files; it's a shared environment. And the output isn't just a document; it's a navigable, interactive package that the next person in the chain — in this case the accountant — can actually use.

The human brings domain knowledge, judgement calls, and the ability to review outputs and redirect. The AI brings speed, consistency, and the ability to handle the technical and mechanical work that would otherwise consume most of the time. The combination is considerably more capable than either alone.

---

*Written as a reflective debrief. No confidential financial data is included in this document.*
 
