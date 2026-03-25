<!-- Brief Pack Document 03 of 05 | See INDEX.md for navigation -->

# Dev Response — Use-Cases IA Implementation Plan (Rev 2)

**Role:** Dev (Explorer team)
**Version:** v0.16.52
**Date:** 23 March 2026 (Revised)
**Input:** Designer research (Rev 2) + Architect response (Rev 2) + stakeholder feedback
**Scope:** Concrete file changes, code modifications, implementation order

---

## 1. What Changed from Rev 1

Three significant corrections from stakeholder feedback:

1. **Type_Safe is mandatory.** All Python code must use Type_Safe from
   osbot-utils, matching the main SG/Send project standards. This turns
   a simple code change into a proper refactoring.

2. **Filesystem as database.** No central `_data/use_case_groups.json`.
   Group identity lives in the folder structure. Discovery, not configuration.

3. **"QA server" not "local stack."** All references to the in-memory test
   server use "QA server" to avoid confusion with LocalStack.

The implementation plan is restructured accordingly. The biggest change is
that the filesystem restructuring (moving 50 folders into 8 groups) is now
Phase 1, and the Type_Safe refactoring runs through everything.

---

## 2. File Change Summary (Revised)

```
    DIRECTORIES TO CREATE:
    ├── sg_send_qa__site/pages/use-cases/01-access-gate/
    ├── sg_send_qa__site/pages/use-cases/02-upload-share/
    ├── sg_send_qa__site/pages/use-cases/03-separate-key/
    ├── sg_send_qa__site/pages/use-cases/04-navigation/
    ├── sg_send_qa__site/pages/use-cases/05-gallery/
    ├── sg_send_qa__site/pages/use-cases/06-browse/
    ├── sg_send_qa__site/pages/use-cases/07-viewer/
    ├── sg_send_qa__site/pages/use-cases/08-pdf/
    ├── sg_send_qa__site/pages/use-cases/_archived/
    ├── sg_send_qa__site/pages/use-cases/_bugs/
    ├── sg_send_qa__site/pages/dashboard/
    ├── tests/qa/v030/access_gate/
    ├── tests/qa/v030/upload_share/
    ├── tests/qa/v030/separate_key/
    ├── tests/qa/v030/navigation/
    ├── tests/qa/v030/gallery/
    ├── tests/qa/v030/browse/
    ├── tests/qa/v030/viewer/
    └── tests/qa/v030/pdf/

    FILES TO CREATE:
    ├── 8x _group.json manifests                               ~15 lines each
    ├── sg_send_qa__site/pages/use-cases/_groups.json            ~30 lines
    ├── sg_send_qa__site/pages/dashboard/dashboard.md            ~80 lines
    ├── sg_send_qa/models/qa_types.py                            ~80 lines  ← Type_Safe classes
    ├── tests/unit/models/test__qa_types.py                      ~40 lines
    ├── tests/unit/cli/test__generate_docs.py                    ~80 lines
    └── 8x tests/qa/v030/{group}/__init__.py                      0 lines each

    FILES TO REWRITE (Type_Safe refactoring):
    ├── sg_send_qa/cli/generate_docs.py                        ~300 lines
    ├── sg_send_qa/ci/diff_screenshots.py                       ~100 lines
    └── tests/qa/v030/conftest.py                              ~400 lines

    FILES TO MODIFY:
    ├── sg_send_qa__site/_layouts/default.html                   ~40 lines changed
    ├── sg_send_qa__site/_config.yml                             ~15 lines removed
    └── .github/workflows/ci-pipeline.yml                        ~10 lines (test paths)

    FILES TO MOVE (git mv):
    ├── 50x use-case folders → into group subdirectories
    ├── 3x legacy folders → _archived/
    ├── 1x bugs folder → _bugs/
    └── 10x test files → into group subdirectories
```


---

## 3. Patch 1 — Type_Safe Data Models

**Depends on:** nothing
**Risk:** low (new file, no existing code affected yet)

Create `sg_send_qa/models/qa_types.py` with all Type_Safe data classes.
This is the foundation that everything else imports.

```python
    from osbot_utils.base_classes.Type_Safe import Type_Safe


    class QA_Screenshot(Type_Safe):
        name        : str
        path        : str  = ""
        description : str  = ""


    class QA_Test_Method(Type_Safe):
        method      : str
        doc         : str  = ""
        screenshots : list = []          # list of screenshot name strings


    class QA_Use_Case_Metadata(Type_Safe):
        use_case    : str
        module      : str
        module_doc  : str  = ""
        test_target : str  = "qa_server"
        tests       : list = []          # list of QA_Test_Method dicts
        screenshots : list = []          # list of QA_Screenshot dicts


    class QA_Group_Manifest(Type_Safe):
        name        : str
        icon        : str
        description : str  = ""
        duplicates  : dict = {}          # duplicate_id → parent_id


    class QA_Environment_Result(Type_Safe):
        status      : str  = "not_run"   # pass | fail | skip | not_run
        last_run    : str  = ""          # ISO 8601
        error       : str  = ""          # failure reason if failed


    class QA_Use_Case_Summary(Type_Safe):
        name           : str
        group          : str  = ""
        screenshot_count: int = 0
        evidence       : str  = "none"  # strong | good | stale | none
        priority       : str  = ""
        composite      : bool = False
        uc_id          : str  = ""


    class QA_Group_Summary(Type_Safe):
        id             : str
        name           : str
        icon           : str  = ""
        total          : int  = 0
        with_evidence  : int  = 0
        coverage_pct   : int  = 0


    class QA_Site_Summary(Type_Safe):
        generated_at       : str  = ""
        version            : str  = ""
        total_tests        : int  = 0
        total_screenshots  : int  = 0
        zero_evidence      : int  = 0
        known_bugs         : int  = 0
        groups             : list = []   # list of QA_Group_Summary dicts
        needs_attention    : list = []
        missing_tests      : list = []
```

**Test file:** `tests/unit/models/test__qa_types.py`

```python
    from sg_send_qa.models.qa_types import QA_Use_Case_Metadata, QA_Group_Manifest

    def test_metadata_defaults():
        meta = QA_Use_Case_Metadata(use_case="test", module="test__test")
        assert meta.test_target == "qa_server"
        assert meta.tests       == []
        assert meta.screenshots  == []

    def test_group_manifest():
        group = QA_Group_Manifest(name="Access Gate", icon="🔐")
        assert group.duplicates == {}
```


---

## 4. Patch 2 — Filesystem Restructuring

**Depends on:** nothing (parallel with Patch 1)
**Risk:** MEDIUM — moves many files, affects CI paths.
Must be tested locally before merge.

This is the biggest structural change. Every use-case folder moves into
a group subdirectory. Every test file moves into a group subdirectory.

### 4.1 Create Group Directories and Manifests

```bash
    cd sg_send_qa__site/pages/use-cases/

    # Create group directories
    mkdir -p 01-access-gate 02-upload-share 03-separate-key \
             04-navigation 05-gallery 06-browse 07-viewer 08-pdf \
             _archived _bugs

    # Create _group.json manifests
    # (one per group — example for 01-access-gate)
```

Each `_group.json` follows the schema from the Architect's response.
8 files, ~15 lines each.

### 4.2 Move Use-Case Folders

```bash
    # Access Gate
    git mv access_gate                        01-access-gate/
    git mv bogus_token_shows_error            01-access-gate/
    mkdir -p 01-access-gate/_duplicates
    git mv upload_accessible_with_token       01-access-gate/_duplicates/
    git mv wrong_token_shows_error            01-access-gate/_duplicates/
    git mv upload_zone_visible_without_gate   01-access-gate/_duplicates/

    # Upload & Share
    git mv combined_link                      02-upload-share/
    git mv friendly_token                     02-upload-share/
    mkdir -p 02-upload-share/_duplicates
    git mv combined_link_upload_and_auto_decrypt  02-upload-share/_duplicates/
    git mv combined_link_via_api_helper           02-upload-share/_duplicates/
    git mv friendly_token_upload_and_resolve      02-upload-share/_duplicates/
    git mv friendly_token_format                  02-upload-share/_duplicates/
    git mv friendly_token_resolves_in_new_tab     02-upload-share/_duplicates/
    git mv friendly_token_no_key_in_url_after_decrypt 02-upload-share/_duplicates/

    # Separate Key
    git mv entry_form_shown_without_hash      03-separate-key/
    git mv entry_form_has_decrypt_button      03-separate-key/
    git mv valid_transfer_id_resolves         03-separate-key/

    # Navigation
    git mv route_handling                     04-navigation/
    git mv gallery_route                      04-navigation/
    git mv browse_route                       04-navigation/
    git mv view_route                         04-navigation/
    git mv short_v_route                      04-navigation/
    git mv download_route_auto_detect         04-navigation/
    git mv hash_navigation_to_download        04-navigation/
    git mv gallery_to_browse_hash_preserved   04-navigation/
    git mv browse_to_gallery_hash_preserved   04-navigation/
    git mv copy_link_includes_key             04-navigation/

    # Gallery
    git mv gallery_page_loads                 05-gallery/
    git mv view_mode_buttons_present          05-gallery/
    git mv action_buttons_present             05-gallery/
    git mv info_panel_toggle                  05-gallery/
    git mv lightbox_opens_on_thumbnail        05-gallery/
    git mv lightbox_arrow_navigation          05-gallery/

    # Browse
    git mv browse_page_loads                  06-browse/
    git mv folder_tree_present                06-browse/
    git mv file_click_opens_preview           06-browse/
    git mv keyboard_navigation_j_k           06-browse/

    # Viewer
    git mv viewer_page_loads                  07-viewer/
    git mv markdown_content_displayed         07-viewer/
    git mv share_button_present               07-viewer/
    git mv copy_url_contains_key              07-viewer/
    git mv save_locally_button_present        07-viewer/
    git mv short_url_v_route                  07-viewer/
    git mv share_tab_present                  07-viewer/
    git mv info_tab_present                   07-viewer/

    # PDF
    git mv pdf_lightbox_opens                 08-pdf/
    git mv present_button_visible_for_pdf     08-pdf/

    # Archived
    git mv landing_page_loads                 _archived/
    git mv landing_page_has_access_gate       _archived/
    git mv invalid_token_rejected             _archived/

    # Bugs
    git mv bugs                               _bugs/
```

### 4.3 Restructure Tests

```bash
    cd tests/qa/v030/

    mkdir -p access_gate upload_share separate_key navigation \
             gallery browse viewer pdf

    git mv test__access_gate.py          access_gate/
    git mv test__combined_link.py        upload_share/
    git mv test__friendly_token.py       upload_share/
    git mv test__upload__single_file.py  upload_share/
    git mv test__separate_key.py         separate_key/
    git mv test__navigation.py           navigation/
    git mv test__download__gallery.py    gallery/
    git mv test__upload__folder.py       browse/
    git mv test__download__viewer.py     viewer/
    git mv test__pdf_present.py          pdf/

    # Create __init__.py in each group (for pytest discovery)
    touch access_gate/__init__.py upload_share/__init__.py \
          separate_key/__init__.py navigation/__init__.py \
          gallery/__init__.py browse/__init__.py \
          viewer/__init__.py pdf/__init__.py
```

### 4.4 Update Permalink Front Matter

After moving folders, the Jekyll permalinks in each `.md` file still
point to `/pages/use-cases/{name}/`. These must NOT change (URL stability).
But we need to verify they still work from the new filesystem location.

Jekyll resolves permalinks regardless of file path — so
`01-access-gate/access_gate/access_gate.md` with
`permalink: /pages/use-cases/access_gate/` will still serve at the
same URL. No front matter changes needed.

### 4.5 Update CI Pipeline Paths

**File:** `.github/workflows/ci-pipeline.yml`

The test run command changes from:

```yaml
    run: python -m pytest tests/integration/ -v
```

To include the new subdirectory structure. Pytest discovers recursively
by default, so no change needed if the path is `tests/qa/v030/`.

The conftest.py output paths change — this is handled in Patch 3.


---

## 5. Patch 3 — Conftest Refactoring (Type_Safe + Dedup + Group-Aware)

**Depends on:** Patch 1 (Type_Safe classes), Patch 2 (filesystem structure)
**Risk:** medium — changes test infrastructure

### 5.1 The Metadata Dedup Fix

The core bug: `save_metadata()` appends instead of deduplicating.

**Current (broken):**

```python
    existing["tests"].append({...})
    existing["screenshots"].extend(captured)
```

**Fixed (dedup by key):**

```python
    # Replace entry for this method, don't append
    existing.tests = [t for t in existing.tests
                      if t.get("method") != method_name]
    existing.tests.append(new_test.json())

    # Replace screenshots by name, don't extend
    existing_names = {s["name"] for s in captured}
    existing.screenshots = [s for s in existing.screenshots
                            if s.get("name") not in existing_names]
    existing.screenshots.extend(captured)
```

### 5.2 Group-Aware Output Path

The fixture must write screenshots to the correct group folder. It
derives the group from the test file's parent directory:

```python
    # Current: derives from module name
    module_name = request.node.module.__name__.split(".")[-1]
    use_case    = module_name.replace("test__", "")

    # Revised: also derives group from directory
    test_path  = Path(request.node.fspath)
    group_dir  = test_path.parent.name  # e.g. "access_gate"

    # Read _groups.json to map test dir → site dir
    groups_path = Path("sg_send_qa__site/pages/use-cases/_groups.json")
    groups_map  = json.loads(groups_path.read_text())
    site_group  = groups_map["test_dir_to_group"].get(group_dir, "")

    # Output to: pages/use-cases/{site_group}/{use_case}/screenshots/
    if site_group:
        shots_dir = Path("sg_send_qa__site/pages/use-cases") / site_group / use_case / "screenshots"
    else:
        # Fallback: ungrouped (logged as warning)
        shots_dir = Path("sg_send_qa__site/pages/use-cases") / use_case / "screenshots"
```

### 5.3 Use "qa_server" not "local_stack"

All metadata files use `"test_target": "qa_server"`. The conftest sets
this based on the test directory:

```python
    # tests/qa/v030/  → "qa_server"
    # tests/standalone/ → "production"
    test_target = "qa_server" if "v030" in str(test_path) else "production"
```


---

## 6. Patch 4 — Rewrite `generate_docs.py` (Type_Safe, Filesystem-Walking)

**Depends on:** Patch 1, 2, 3
**Risk:** medium — biggest code change

This is the core rewrite. The generator walks the filesystem to discover
everything, uses Type_Safe classes throughout, and produces all output.

### 6.1 Discovery Algorithm

```python
    from sg_send_qa.models.qa_types import (QA_Group_Manifest,
                                             QA_Use_Case_Metadata,
                                             QA_Site_Summary)

    class QA_Doc_Generator(Type_Safe):
        use_cases_dir : Path
        site_dir      : Path

        def discover_groups(self):
            """Walk the filesystem. Numbered dirs are groups."""
            groups = []
            for d in sorted(self.use_cases_dir.iterdir()):
                if d.is_dir() and d.name[0:2].isdigit():
                    manifest_path = d / "_group.json"
                    manifest = self._read_manifest(manifest_path)
                    members  = self._discover_members(d)
                    groups.append((d.name, manifest, members))
            return groups

        def _discover_members(self, group_dir):
            """List use-case subdirectories (excluding _duplicates, _*)."""
            members = []
            for d in sorted(group_dir.iterdir()):
                if d.is_dir() and not d.name.startswith("_"):
                    metadata = self._read_metadata(d)
                    members.append((d.name, metadata))
            return members

        def _discover_duplicates(self, group_dir):
            """List duplicates from _duplicates/ subfolder."""
            dup_dir = group_dir / "_duplicates"
            if not dup_dir.exists():
                return []
            return [d.name for d in sorted(dup_dir.iterdir()) if d.is_dir()]
```

### 6.2 Key Functions

```
    generate_docs():
        groups = discover_groups()

        for group_dir, manifest, members in groups:
            for use_case_name, metadata in members:
                if is_hand_crafted(use_case_name):
                    skip
                elif is_auto_scaffolded(use_case_name):
                    write_enriched_page(...)
                else:
                    write_enriched_page(...)  # new page

            for dup_name in discover_duplicates(group_dir):
                write_redirect_page(...)

        write_grouped_index(groups)
        write_site_summary(groups)       # → _data/qa_summary.json
        clean_all_metadata(groups)       # one-time dedup migration
```

### 6.3 Hand-Crafted Detection

```python
    HAND_CRAFTED_MARKERS = [
        "## Intent", "## User Flow", "## Test Overview",
        "## How Bug Tests Work", "<!-- hand-crafted -->"
    ]

    def is_hand_crafted(self, md_path):
        if not md_path.exists():
            return False
        content = md_path.read_text()
        if len(content.strip().split("\n")) > 30:
            return True
        return any(marker in content for marker in HAND_CRAFTED_MARKERS)
```

### 6.4 Full Test Coverage

```python
    # tests/unit/cli/test__generate_docs.py

    class Test__QA_Doc_Generator(Type_Safe):

        def test_discover_groups_finds_numbered_dirs(self):
            ...

        def test_discover_members_excludes_underscored(self):
            ...

        def test_hand_crafted_detection(self):
            ...

        def test_enriched_page_has_property_table(self):
            ...

        def test_redirect_page_links_to_parent(self):
            ...

        def test_grouped_index_has_all_groups(self):
            ...

        def test_site_summary_coverage_percentages(self):
            ...

        def test_metadata_cleaned_on_generation(self):
            ...
```


---

## 7. Patch 5 — Jekyll Template + Config

**Depends on:** Patch 4 (generator must produce `_data/qa_summary.json`)
**Risk:** low

### 7.1 Sidebar (default.html)

Replace the hardcoded `use_cases` nav with data-driven rendering.
The generator writes sidebar data to `_data/qa_sidebar.json` (derived
from the filesystem walk). The template reads it:

```html
    {% for group in site.data.qa_sidebar.groups %}
    <h3>{{ group.icon }} {{ group.name }}</h3>
    <ul>
      {% for member in group.members %}
      <li>
        <a href="{{ '/pages/use-cases/' | append: member.id
                    | append: '/' | relative_url }}"
           {% if page.url contains member.id %}class="active"{% endif %}>
          {{ member.title }}
          {% if member.composite %}
            <span style="color: var(--accent);">★</span>
          {% endif %}
        </a>
      </li>
      {% endfor %}
    </ul>
    {% endfor %}
```

### 7.2 Config

Remove the `use_cases:` block from `_config.yml`. Add Dashboard to nav.


---

## 8. Patch 6 — Dashboard Page

**Depends on:** Patch 4 (generator produces `_data/qa_summary.json`)
**Risk:** none (new page)

`sg_send_qa__site/pages/dashboard/dashboard.md` — Liquid template reading
from `site.data.qa_summary`. Same content as Rev 1, plus environment
columns.


---

## 9. Implementation Order — Session Plan (Revised)

```
    ORDER   PATCH   DESCRIPTION                          EST. EFFORT
    ──────────────────────────────────────────────────────────────────
      1     P1      Type_Safe data models (qa_types.py)  20 min
      2     P2      Filesystem restructuring              30 min
                    (git mv 50+ folders + 10 test files)
      3     P3      Conftest refactoring                  30 min
                    (Type_Safe + dedup + group-aware)
      4     P4      generate_docs.py rewrite              90 min  ← biggest
                    (Type_Safe + filesystem discovery)
      5     P5      Jekyll template + config              20 min
      6     P6      Dashboard page                        15 min
      7     --      Run generate_docs.py, verify          10 min
      8     --      Local test: jekyll serve              15 min
      9     --      Run pytest, verify paths              15 min
    ──────────────────────────────────────────────────────────────────
                                                   TOTAL: ~4 hours
```

The effort increased from ~2.5 to ~4 hours due to Type_Safe refactoring
and filesystem restructuring. Still a single-session task if focused,
or split across two sessions:

- **Session A:** P1 + P2 + P3 (data models + restructure + conftest) — safe to merge
- **Session B:** P4 + P5 + P6 (generator + template + dashboard) — depends on Session A


---

## 10. What I Won't Do / Flagging for Other Roles

**For the Architect:** `test__pdf_present.py` contains `TestBrowseSKeyShortcut`
with keyboard tests (`j_key`, `k_key`, `s_key`). These belong in browse/,
not pdf/. Should I split the test file during the restructuring?

**For the Designer:** The enriched page template has a "For Agents" section.
What should this contain beyond "if this fails, check X"? Is there a
standard format for agent-consumable test documentation?

**For the Conductor:** The Type_Safe refactoring of `diff_screenshots.py`
is straightforward but adds scope. Should it be in this sprint or deferred?
It's not blocking anything.

**For the QA Curator (new role):** The test lifecycle management (feature →
bug → regression) described in the stakeholder feedback needs a role
definition before I can build tooling for it. The filesystem structure
supports it (git mv between directories), but the workflows need to be
specified.

---

*Dev response (Rev 2) · SGraph Send QA · v0.16.52 · 23 March 2026*

---

## Cross-References (Brief Pack)

| Related Document | Relevance |
|-----------------|-----------|
| [00 Introduction](00-introduction.md) | Three execution modes that shape the code |
| [01 Designer](01-designer__ia-research.md) | Target IA structure being implemented |
| [02 Architect](02-architect__data-models-and-boundaries.md) | Schemas and boundaries this code implements |
| [04 DevOps](04-devops__ci-pipeline-review.md) | CI path changes that must ship with Phase 4 |
| [05 Refactoring Brief](05-conductor__villager-refactoring-brief.md) | Package structure target and success criteria |
