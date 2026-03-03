# Practices Reference

**Version:** v0.10.36

This document points to the authoritative guides in the SG/Send main repo. Clone the main repo to `/tmp/sgraph-send-ref` and read these files.

---

## Type_Safe (MUST READ — before writing any code)

| Document | Path in main repo | When to read |
|---|---|---|
| **Type_Safe core guide** | `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` | Before writing ANY class |
| **Safe primitives catalog** | `library/dependencies/osbot-utils/type_safe/v3.28.0__for_llms__osbot-utils-safe-primitives.md` | When choosing domain types |
| **Testing guidance** | `library/dependencies/osbot-utils/type_safe/v3.1.1__for_llms__type_safe__testing_guidance.md` | Before writing ANY test |
| **Collections guide** | `library/dependencies/osbot-utils/type_safe/v3.63.3__for_llms__type_safe__collections__subclassing_guide.md` | When defining Dict__, List__, Set__ |
| **Decorator guide** | `library/dependencies/osbot-utils/type_safe/v3.63.3__for_llms__type_safe__decorator_guide.md` | When using @type_safe |

### Type_Safe Quick Rules

1. **All classes** extend `Type_Safe`
2. **All attributes** have type annotations
3. **Zero raw primitives** — no `str`, `int`, `float`, `list`, `dict`
4. **Schemas are pure data** — no methods
5. **Collection subclasses are pure type definitions** — no methods
6. **Use `@type_safe`** on methods that validate parameters
7. **Return `None`** for not found — no exceptions for missing resources
8. **No `str()` casts** — Type_Safe handles conversions
9. **No `Optional[T]`** — returning `None` is always allowed
10. **Simplified defaults** — auto-conversion handles it (e.g. `version: Safe_Str__Version = '1.0.0'`)

### Past Issues with Type_Safe Violations

The SG/Send main repo tracked issue DEV-010 for raw primitive usage. Key problems that occurred:
- Raw `dict` returns from service methods meant callers got unvalidated data
- Raw `str` for transfer_id allowed invalid values to propagate silently
- Missing `@type_safe` on methods meant type errors surfaced deep in execution
- Mixing Pydantic and Type_Safe caused serialization incompatibilities

**Learn from this:** Enforce Type_Safe from the first commit. It's much harder to retrofit.

---

## Git Conventions

- **Default branch:** `dev`
- **Feature branches** branch from `dev`
- **Branch naming:** `claude/{description}-{session-id}`
- **Always push with:** `git push -u origin {branch-name}`
- **Commit messages:** concise, focus on "why" not "what"

## Testing

- **No mocks, no patches** — real implementations, in-memory backends
- **`setUpClass` pattern** — shared test objects for speed
- **Every change has tests** — no untested code ships

## File Naming

- **Version prefix** on review/doc files: `{version}__description.md`
- **Class naming:** `Schema__` prefix for data, `Service__` or `Vault__` for logic, `CLI__` for CLI
- **Custom types:** `Safe_Str__Domain__Specific`, `Enum__Domain__Values`
- **Collections:** `Dict__Items__By_Key`, `List__Item__Ids`
