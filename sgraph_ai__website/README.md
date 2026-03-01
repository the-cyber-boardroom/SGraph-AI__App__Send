# sgraph.ai Website

Static website for [sgraph.ai](https://sgraph.ai) -- zero-knowledge encrypted file sharing.

Pure HTML/CSS/JS with no build step. Deployed to S3 + CloudFront via GitHub Actions.

---

## Local Development

No build tools, bundlers, or package managers required.

### Quick Start (file browser)

```bash
# Simply open the landing page in your browser
open sgraph_ai__website/index.html
```

### With Local Server (recommended for proper path routing)

```bash
cd sgraph_ai__website
python3 -m http.server 8080
# Visit http://localhost:8080
```

Using the HTTP server ensures that absolute paths (e.g. `/agents/`, `/product/`) resolve
correctly, matching production behaviour.

---

## File Structure

```
sgraph_ai__website/
  index.html              Landing page
  css/style.css           Design system (Aurora theme)
  js/contact-form.js      Contact modal logic
  product/index.html      Product explainer
  agents/
    index.html            Agent directory
    keys.json             Machine-readable key directory
    sherpa/index.html     Sherpa profile
    ambassador/index.html Ambassador profile
    architect/index.html  Architect profile
  architecture/index.html How it's built
  contact/index.html      Contact form
  README.md               This file
```

---

## Deployment

Deployment is fully automated via GitHub Actions.

- **Trigger:** Push to `main` branch when files in `sgraph_ai__website/` change
- **Manual:** Run the `Deploy Website - sgraph.ai` workflow from the Actions tab
- **Pipeline:** Validate HTML/links/JSON --> Sync to S3 --> Invalidate CloudFront --> Smoke test
- **Domain:** sgraph.ai
- **Region:** eu-west-2 (London)
- **No build step** -- files are deployed as-is

### Cache Policy

| File Type        | max-age   | Duration |
|------------------|-----------|----------|
| HTML             | 300       | 5 minutes |
| CSS / JS / JSON  | 86400     | 1 day    |
| Images           | 604800    | 7 days   |

CloudFront cache is fully invalidated on every deployment.

---

## Adding a New Agent Page

1. Create `agents/{role}/index.html` following the template from existing agent pages
   (see `agents/sherpa/index.html` or `agents/ambassador/index.html` for reference)
2. Update `agents/index.html` to add a link to the new agent page
3. Update `agents/keys.json` with the agent's public key information
4. Commit and push to `main` -- CI handles the rest

---

## Design System

All styles live in `css/style.css`.

### Theme

- **Name:** Aurora
- **Brand colours:** Teal (`#4ECDC4`), Dark Navy (`#1A1A2E`)
- **Uses CSS custom properties** for consistent theming across all pages

### Typography

- **Headings / body:** DM Sans
- **Code / monospace:** JetBrains Mono

### Responsive

Mobile-first responsive design. Test at common breakpoints before deploying.

---

## Required GitHub Secrets

These must be configured in the repository settings under **Settings > Secrets and variables > Actions**.

| Secret                   | Description                              |
|--------------------------|------------------------------------------|
| `WEBSITE_S3_BUCKET`     | S3 bucket name for website files         |
| `WEBSITE_CF_DIST`       | CloudFront distribution ID               |
| `AWS_ACCESS_KEY_ID`     | AWS credentials for deployment           |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for deployment           |

The deploy workflow uses `eu-west-2` (London) as the AWS region, consistent with the
rest of the SGraph Send infrastructure.

---

## CI Pipeline Details

The workflow (`.github/workflows/deploy-website.yml`) runs two jobs:

### 1. validate

- Checks that required HTML files exist (index.html, product, agents, architecture, contact)
- Scans HTML files for internal links (`href="/..."`) and verifies the target files exist
- Validates `agents/keys.json` is well-formed JSON

### 2. deploy (requires validate to pass)

- Syncs files to S3 with `--delete` (removes files no longer in the repo)
- Sets per-file-type content types and cache headers
- Invalidates the full CloudFront distribution
- Runs a smoke test against https://sgraph.ai

A concurrency group (`website-deploy`) prevents parallel deployments.
