# DEV-000 | Parent: Type_Safe Refactor Review

**Status:** open
**Type:** epic
**Priority:** high
**Source:** `team/humans/dinis_cruz/briefs/02/12/v0.2.10__review-of-user-site-mvp.md`

## Description

Parent tracking issue for the complete Type_Safe refactor of the backend transfer workflow.
Dinis Cruz reviewed the MVP backend and identified significant architectural issues where
Type_Safe capabilities are not being leveraged. This review covers Transfer__Service,
Schema__Transfer, Routes__Transfers, and associated tests.

## Child Issues

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| DEV-001 | Replace raw dicts with Type_Safe collections / Memory-FS | open | high |
| DEV-002 | Create Transfer_Id type (Random_Guid) | open | high |
| DEV-003 | Create Enum__Transfer__Status | open | medium |
| DEV-004 | Replace datetime.now with Timestamp_Now | open | medium |
| DEV-005 | Create Type_Safe schema for transfer metadata | open | high |
| DEV-006 | Create Type_Safe schema for transfer events | open | medium |
| DEV-007 | Create Schema__Transfer__Transparency | open | medium |
| DEV-008 | Move hash_ip to separate class | open | low |
| DEV-009 | Remove hardcoded URLs from service | open | low |
| DEV-010 | Replace raw primitives in Schema__Transfer | open | high |
| DEV-011 | Split Schema__Transfer into one file per schema | open | medium |
| DEV-012 | Fix injection vulnerabilities in HTTPException | open | critical |
| DEV-013 | Routes return Type_Safe classes, service creates return objects | open | high |
| DEV-014 | Add @type_safe decorators to all methods | open | high |
| DEV-015 | Rename test file, create direct Routes test | open | medium |
| DEV-016 | Clarify statusCode comment in lambda handler test | open | low |

## Acceptance Criteria

- All raw dicts replaced with Type_Safe classes
- All raw primitives replaced with Safe_* types
- All methods have @type_safe decorators
- All injection vulnerabilities fixed
- All tests pass
- Memory-FS integration for storage layer
