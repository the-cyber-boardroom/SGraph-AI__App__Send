# Role: Dev — SG_Send__CLI

**Team:** Explorer
**Scope:** Implementation, code reviews, testing

---

## Responsibilities

1. **Implement core services** — `Vault__Crypto`, `Vault__Client`, `Vault__Tree`, `Vault__Config`, `Vault__Sync`
2. **Implement CLI commands** — `Command__Clone`, `Command__Init`, `Command__Push`, `Command__Pull`, `Command__Status`, `Command__Ls`, `Command__Info`
3. **Write tests** — every service and command has tests, no mocks, no patches
4. **Follow Type_Safe rules** — zero raw primitives, schemas are pure data, `@type_safe` on validated methods
5. **Class-based Typer** — use `Typer__Routes` pattern, `cmd_` prefix for CLI commands

## Critical Rules

### Type_Safe (Non-Negotiable)

- **Read the Type_Safe guidance** before writing any code: `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md`
- **NEVER** use raw `str`, `int`, `float`, `list`, `dict` as class attributes or method parameters
- **Use Safe_* types** for everything: `Safe_Str__Vault__Id`, `Safe_Str__Transfer__Id`, etc.
- **Schemas are PURE DATA** — no methods, no business logic
- **Logic in service classes** — methods decorated with `@type_safe`
- **Collection subclasses are PURE TYPE DEFINITIONS** — `Dict__`, `List__`, `Set__` prefixes

### Testing

- **No mocks, no patches** — use real in-memory implementations
- **`setUpClass` pattern** — shared test objects for speed
- **Test crypto interop first** — this is the gate
- **Test each service independently** — then integration tests for full workflows

### Code Patterns

```python
# Schema — PURE DATA
class Schema__Vault__Settings(Type_Safe):
    vault_name         : Safe_Str
    vault_id           : Safe_Str__Vault__Id
    created            : Timestamp_Now
    version            : Safe_UInt = 1
    description        : Safe_Str__Text
    tree_transfer_id   : Safe_Str__Transfer__Id

# Service — HAS METHODS
class Vault__Crypto(Type_Safe):
    @type_safe
    def derive_key(self, passphrase : Safe_Str__Vault__Passphrase,
                         vault_id   : Safe_Str__Vault__Id         ) -> bytes:
        ...

# CLI command — Typer__Routes pattern
class CLI__Vault(Typer__Routes):
    vault_client : Vault__Client

    def cmd_clone(self, vault_key: Annotated[str, typer.Argument(help='Vault key')],
                        target_dir: Annotated[str, typer.Option('--path')] = '.'):
        """Clone a vault to local folder."""
        ...
```

## Review Documents

Place reviews at: `team/explorer/dev/reviews/{date}/`
