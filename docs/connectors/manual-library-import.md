# Manual Family Library JSON Import

## Supported Format

Lighthouse accepts one JSON object with `formatVersion: "library-item.v1"` and an `item` object. The existing owner-only Library export endpoint produces this format. `connectorId` may be omitted and defaults to `manual-family-library`; no other connector can use this import path.

```json
{
  "formatVersion": "library-item.v1",
  "item": {
    "title": "Emergency shutoff instructions",
    "category": "instruction",
    "body": "User-authored details",
    "sourceLabel": "Original notebook",
    "effectiveDate": "2026-07-21",
    "sensitivity": "personal",
    "retentionPolicy": "keep-until-archived",
    "retentionDeleteAfter": null,
    "provenance": { "note": "User-authored provenance note" }
  }
}
```

The JSON body is limited to 32 KiB. Binary files, archives, images, credentials, identity documents, financial data, and unreviewed medical data are not supported.

## Private-Copy Semantics

Preview performs no database write and returns only a sanitized candidate plus discard warnings. Commit requires explicit confirmation and revalidates the complete original document.

Retained user-authored fields:

- Title, category, and body
- Source label and effective date
- Sensitivity
- Retention policy and delete-after date
- A control-character-stripped provenance note, limited to 500 characters

Server-controlled behavior:

- A new item ID is generated.
- Household, owner, subject, creator, and updater come only from the authenticated actor.
- Visibility is forced to `private`, status to `active`, source type to `import`, and version to the database default.
- Original IDs, identity references, visibility, status, lifecycle timestamps, database timestamps, versions, allowed purposes, and owner kind are discarded.
- Sharing grants are never restored or recreated.
- Provenance records `manual-family-library`, the original format version, import time, original source label, and sanitized note.

## Threat Controls

- Session authentication runs before import body processing.
- Strict Zod objects reject unknown structure and unsupported versions.
- A route-level JSON limit and schema field limits bound parser and storage work.
- Connector policy rejects unknown, deferred, unsupported, and prohibited import connector IDs.
- Commit runs inside transaction-scoped database actor context; PostgreSQL RLS still fails closed if that context is missing.
- The `imported` audit event stores connector, format, visibility, and sensitivity metadata only. It does not retain title, body, source text, provenance note, IDs, or grants.

## Current Non-Goals

This path does not implement OAuth, external API calls, background synchronization, token storage, binary storage, health or financial ingestion, device monitoring, scraping, AI processing, cross-adult authorization, or automatic sharing.
