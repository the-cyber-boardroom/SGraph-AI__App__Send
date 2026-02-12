# DEV-010 | Replace raw primitives in Schema__Transfer

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** M
**Files:** `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py`

## Description

All Schema__Transfer classes use raw `str`, `int`, `dict` instead of
Type_Safe primitives. Every field should use the appropriate Safe_* type.

## Mapping

| Current | Target | Schema |
|---------|--------|--------|
| `transfer_id: str` | `Transfer_Id` | All schemas |
| `file_size_bytes: int` | `Safe_UInt__FileSize` | Create, Info, Download_Response |
| `content_type_hint: str = ""` | `Safe_Str__Http__Content_Type` | Create |
| `upload_url: str` | `Safe_Str` | Initiated |
| `download_url: str` | `Safe_Str` | Complete_Response |
| `transparency: dict` | `Schema__Transfer__Transparency` | Complete_Response, Download_Response |
| `status: str` | `Enum__Transfer__Status` | Info |
| `created_at: str` | `Timestamp_Now` | Info |
| `download_count: int` | `Safe_UInt` | Info |

## Dependencies

- DEV-002 (Transfer_Id)
- DEV-003 (Enum__Transfer__Status)
- DEV-007 (Schema__Transfer__Transparency)
