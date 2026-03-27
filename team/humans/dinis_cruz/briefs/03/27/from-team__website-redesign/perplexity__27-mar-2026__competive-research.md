## 1. Message for the team

We’ve updated the competitive positioning table for SG/Send vs WeTransfer vs Proton Drive to stay technically accurate and defensible.

**Core stance:**

- WeTransfer uses server‑side encryption with rich previews, but not end‑to‑end or zero‑access encryption.  
- Proton Drive uses client‑side, zero‑access encryption for stored files, but its sharing UX still assumes accounts and does not give recipients a frictionless, gallery/folder experience with no signup.  
- SG/Send’s differentiators on the site should therefore be:  
  - Encrypted in the browser before upload (true zero‑knowledge for file contents).  
  - Recipients can browse galleries/folders/SgPrint *without downloading*.  
  - No account required for either sender or recipient (token‑based).  
  - Zero cookies (verifiable in DevTools).  
  - Pay‑per‑use pricing, no subscription lock‑in.  
  - Short, human‑readable privacy policy and open‑source implementation.

We should **not** position “encryption” alone as the differentiator vs Proton Drive; they also do client‑side E2EE. Instead, we emphasise:

- Recipient browsing UX (gallery/folder/SgPrint)  
- No‑account model  
- Pay‑per‑use  
- Zero‑cookie / short‑policy transparency  

The table rows in the brief are therefore:

- **Zero‑knowledge (client‑side)**  
  - **SG/Send:** ✅ — files encrypted in browser, key never sent to server (per our architecture).  
  - **WeTransfer:** ❌ “server‑side” — standard HTTPS + encryption at rest; not E2EE, provider holds keys. See WeTransfer’s security pages describing TLS in transit and encryption at rest, with them in control of keys:  
    - https://wetransfer.com/explore/data-security  
    - https://www.avast.com/c-is-wetransfer-safe  
  - **Proton Drive:** ✅ “client‑side” — files encrypted on device; provider cannot see plaintext. See:  
    - https://europeanpurpose.com/tool/proton-drive  

- **Recipients browse without downloading**  
  - **SG/Send:** ✅ “gallery + folder” — recipients get a browsable view.  
  - **WeTransfer:** They now have “Previews” (view before download) but still not an *encrypted, structured gallery/folder UX*. Our copy should be “browsable encrypted galleries/folders” rather than claiming WeTransfer is strictly “download only”. References:  
    - WeTransfer blog / announcements about previews: https://wetransfer.com/blog  
    - Example announcement post: https://www.linkedin.com/posts/wetransfer_no-more-pointless-downloads-meet-activity-7408905456653549568-_hA2  
  - **Proton Drive:** ❌ for *our specific UX claim* — while they offer web previews once logged in, they don’t offer our token‑based, no‑account, gallery/folder experience. See their sharing docs:  
    - https://proton.me/support/drive-how-to-share-files-via-email  
    - https://proton.me/support/drive-sharing-files-via-non-proton-email  

- **No account required (sender or recipient)**  
  - **SG/Send:** ✅ “token‑based”.  
  - **WeTransfer:** ❌ sender now needs at least a free account / email verification; recipient needs email or link. See:  
    - https://help.wetransfer.com/hc/en-us/articles/202702233-How-do-I-send-a-transfer  
    - https://www.transfernow.net/en/wetransfer/how-to-use  
  - **Proton Drive:** ❌ sharing flows assume a Proton account for full E2EE; public links are still not no‑account, token‑only in our sense. See:  
    - https://proton.me/support/drive-how-to-share-files-via-email  
    - https://proton.me/support/drive-sharing-files-via-non-proton-email  
    - Discussion of account‑centric sharing: https://www.reddit.com/r/ProtonDrive/comments/1gl6hs2/sharing_a_document_with_people_who_dont_have_a/  

- **Friendly tokens**  
  - **SG/Send:** ✅ short, human‑readable tokens.  
  - **WeTransfer / Proton:** ❌ links are long opaque IDs, not presented as human‑memorable tokens (inspect typical share URLs from: https://wetransfer.com and https://proton.me/drive/file-sharing).

- **Zero cookies (verifiable in DevTools)**  
  - **SG/Send:** ✅ no cookies / tracking.  
  - **WeTransfer / Proton:** ❌ both use cookies and analytics on their main products. See:  
    - https://wetransfer.com/explore/data-security  
    - https://proton.me/drive/security  

- **Pay‑per‑use (no subscription)**  
  - **SG/Send:** ✅ “£0.01/file”.  
  - **WeTransfer:** ❌ subscription‑led monetisation; free tier + Pro/Teams plans. See:  
    - Plan/limits overviews and comparisons: https://www.transfernow.net/en/wetransfer/limits  
    - How‑to/use guides emphasising free vs paid: https://www.transfernow.net/en/wetransfer/how-to-use  
  - **Proton Drive:** ❌ subscription‑based (bundled with Proton plans). See:  
    - Proton Drive service descriptions: https://europeanpurpose.com/tool/proton-drive  
    - “Is Proton Drive secure / how it’s sold”: https://www.switch-to.eu/en/services/eu/proton-drive  

- **Privacy policy**  
  - **SG/Send:** “6 sentences” – intentional minimalism (our own content).  
  - **WeTransfer:** “4,000+ words” – long, legalistic policy; see their full privacy policy linked from https://wetransfer.com.  
  - **Proton:** “Long” – multi‑page policies linked from https://proton.me/legal.  

- **Open source**  
  - **SG/Send:** ✅ core crypto and client visible on GitHub (our repos).  
  - **WeTransfer:** ❌ closed source.  
  - **Proton:** “Partial” – some components and clients open source, but not the full stack (see various Proton GitHub repos linked from https://proton.me/open-source).  

Where we’re opinionated (e.g. “server‑side ZK is an oxymoron”), we’ll keep that tone for decks and talks, not the on‑site comparison table. On‑site copy should map 1:1 to behaviour a reasonably technical buyer could verify from docs or by using the product.

---

## 2. Links backing the “encryption is not the differentiator vs Proton” note

- Proton Drive positioned as zero‑access, encrypted cloud storage (comparable to other secure drives, not just simple file‑drop):  
  - https://europeanpurpose.com/tool/proton-drive  
  - https://www.switch-to.eu/en/services/eu/proton-drive  
  - A general explainer: https://www.go2share.net/article/is-proton-drive-secure  

These support our internal note from the brief:

> “Proton Drive also uses client-side E2EE — encryption is not the differentiator vs Proton. Our edge is the recipient browsing experience, no-account model, and pay-per-use pricing.”