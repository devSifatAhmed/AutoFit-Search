# AutoFit Search Master Implementation Plan

> Update: the original product direction in this file was the single `Year` range architecture. The active implementation direction now supports multiple `RANGE` fields through `RowRangeValue`; see `MULTIPLE_RANGE_FIELDS_PLAN.md` for the completed multi-range rollout details. Historical sections below are retained for context.

This document is the source of truth for turning AutoFit Search into a production-ready Shopify-style dynamic filter engine with Year-Make-Model support.

It is written to match the current codebase as it exists today, not an earlier intended state. The goal is to make future work predictable: we should be able to follow this file task by task until the project is complete.

## Product Goal

Build a scalable faceted search system for Shopify where:

- a shop can define dynamic search fields
- `SELECT` fields such as `Make`, `Model`, `Color`, `Trim` can be added, removed, and reordered
- exactly one `RANGE` field is allowed for the main year constraint
- each search entry maps a filter combination to one or more products or one collection
- the year range must be overlap-safe
- admin CRUD must stay simple
- storefront querying must remain fast enough for real production data

## Core Architecture Direction

The intended final architecture is:

- `Field` stores filter configuration
- `SearchRow` stores one searchable rule
- `SearchRow` owns the required year range directly
- `RowValue` stores dynamic non-range filter values for that row
- `RowAttachment` stores linked Shopify product or collection GIDs
- `FilterSuggestion` stores reusable admin/storefront suggestions

Design principle:

- `SearchRow = primary range constraint`
- `RowValue = secondary dynamic filters`

This is the architecture we should move toward, even though parts of the current schema still reflect an older mixed approach.

## Current Codebase Snapshot

Files most relevant to this system:

- [prisma/schema.prisma](/d:/Apps/Practice/AutoFit-Search/prisma/schema.prisma)
- [app/utils/fields.server.js](/d:/Apps/Practice/AutoFit-Search/app/utils/fields.server.js)
- [app/utils/rows.server.js](/d:/Apps/Practice/AutoFit-Search/app/utils/rows.server.js)
- [app/routes/app.database_.jsx](/d:/Apps/Practice/AutoFit-Search/app/routes/app.database_.jsx)
- [app/routes/app.database.add.jsx](/d:/Apps/Practice/AutoFit-Search/app/routes/app.database.add.jsx)

## What Is Already Working

### Data foundation

- Prisma models exist for `Shop`, `Field`, `SearchRow`, `RowValue`, `RowAttachment`, and `FilterSuggestion`
- shops are scoped through `shopId`
- field ordering is supported with `position`
- field type supports `SELECT` and `RANGE`
- range-capable field config supports `rangeStart` and `rangeEnd`

### Field management

- field list loading exists
- field creation exists
- field editing exists
- field deletion exists
- field reordering exists
- first-load field bootstrap is attempted through `validateShop`

### Admin UI

- `/app/database` shows field configuration UI
- drag-and-drop field ordering works at the UI level
- `/app/database/add` has a draft row creation UI
- product picker and collection picker UI both exist
- form UI already treats `SELECT` and `RANGE` differently

## What Exists But Is Incomplete

This section is now mostly historical context. The items below were the main gaps before the current implementation pass and have since been completed in code.

### Search row persistence

In [app/utils/rows.server.js](/d:/Apps/Practice/AutoFit-Search/app/utils/rows.server.js):

- `getRows` currently returns `[]`
- `createRow` currently parses data and builds a `tag`, but exits early with `return`
- actual Prisma row creation code exists below that early return, but it is not active

This means row creation and listing are not truly implemented yet.

### Row table rendering

In [app/routes/app.database_.jsx](/d:/Apps/Practice/AutoFit-Search/app/routes/app.database_.jsx):

- the table expects a display shape like `row.columns[field.id]`
- current backend does not produce this shape
- attachment display expects a `role` property that is not present in the schema

So the admin listing UI is structurally ahead of the server implementation.

### Add-row save flow

In [app/routes/app.database.add.jsx](/d:/Apps/Practice/AutoFit-Search/app/routes/app.database.add.jsx):

- validation feedback exists in the UI
- submit flow posts data to the server
- success handling is commented out
- current server action cannot complete because `createRow` returns early

## What Is Misaligned With The Target Design

### 1. Range is currently stored in `RowValue`

Current schema:

- `RowValue.value`
- `RowValue.minValue`
- `RowValue.maxValue`

Target direction:

- `SearchRow.startYear`
- `SearchRow.endYear`
- `RowValue.value` for dynamic select fields

Why this matters:

- row-level range makes overlap prevention much easier
- row-level range makes indexes cleaner
- row-level range simplifies queries
- row-level range reflects the actual YMM business rule more directly

### 2. Tag-first row identity is not a good primary design

Current row creation logic builds a tag from values:

- select fields become raw text fragments
- range becomes `min_max`
- everything is joined into one string

This can still be useful as an optimization or generated lookup signature, but it should not be the core model. It is too brittle for:

- partial filtering
- dynamic field changes
- overlap validation
- long-term maintainability

### 3. Single-range enforcement is not implemented

The business rule says only one `RANGE` field should exist per shop configuration, but this is not currently enforced in server logic.

### 4. Range overlap prevention is not implemented

There is no current validation to block:

- overlapping year ranges for the same filter combination
- accidental duplicate or conflicting fitment rules

### 5. Attachment semantics are not fully modeled

Current schema stores `RowAttachment.type`, but the row itself does not clearly state attachment mode such as:

- `PRODUCT`
- `COLLECTION`

That leaves room for mixed attachment states unless guarded carefully in service logic.

## Recommended Target Schema

This is the schema direction the project should move toward.

### Shop

Purpose:

- one tenant per installed Shopify shop

Important fields:

- `id`
- `shopifyGid`
- `domain`
- `name`

### Field

Purpose:

- stores admin-defined filter configuration

Important fields:

- `id`
- `shopId`
- `type`
- `label`
- `placeholder`
- `visibility`
- `sortOrder`
- `position`
- `rangeStart`
- `rangeEnd`

Required rules:

- exactly one `RANGE` field per shop
- all other fields must be `SELECT`

Optional future fields:

- `key`
- `isRequired`
- `isLocked`

### SearchRow

Purpose:

- one searchable fitment rule

Recommended important fields:

- `id`
- `shopId`
- `startYear`
- `endYear`
- `filterSignature` or `tag` as optional optimization
- `attachmentMode`
- `createdAt`
- `updatedAt`

Required rules:

- `startYear` required
- `endYear` required
- `startYear <= endYear`

### RowValue

Purpose:

- stores dynamic non-range values for a row

Recommended fields:

- `id`
- `rowId`
- `fieldId`
- `value`

Required rules:

- one value per row per field
- only valid for non-range fields in the final design

### RowAttachment

Purpose:

- stores attached products or collection for the row

Recommended fields:

- `id`
- `rowId`
- `shopifyGid`

Recommended rule:

- if row mode is `COLLECTION`, exactly one attachment
- if row mode is `PRODUCT`, one or more attachments allowed

### FilterSuggestion

Purpose:

- optional cached select suggestions

Recommended fields:

- `id`
- `shopId`
- `fieldId`
- `value`

## Business Rules To Enforce

### Field rules

- every row must follow current field configuration
- only one `RANGE` field can exist per shop
- range field defines UI year limits with `rangeStart` and `rangeEnd`
- field order drives both admin display and storefront filter order

### Search row rules

- every search row must include a year range
- year range must be normalized as integers
- `startYear` must be less than or equal to `endYear`
- all non-range field values must be present unless a future optional-field feature is introduced

### Overlap rules

At minimum, the system must reject conflicting year ranges for the same filter combination.

Overlap condition:

```text
existing.startYear <= new.endYear
AND
existing.endYear >= new.startYear
```

But overlap should not be checked globally across the whole shop. It should be checked within the same non-range filter combination.

That means:

- same `Make`
- same `Model`
- same other active select fields
- overlapping year window

should be rejected

### Attachment rules

- a row cannot mix product and collection attachments
- collection rows must have exactly one collection
- product rows must have one or more products

## Query Strategy

Final query behavior should work like this:

1. identify candidate rows where the requested year overlaps the row range
2. filter those rows by exact matches across selected non-range fields
3. return attached product or collection IDs

Example:

- Make = Toyota
- Model = Corolla
- Year = 2019

Candidate row rule:

- `startYear <= 2019`
- `endYear >= 2019`
- row has `Make = Toyota`
- row has `Model = Corolla`

## Performance Strategy

### Must-have indexes

- `SearchRow(shopId, startYear, endYear)`
- `RowValue(fieldId, value)`
- `RowValue(rowId, fieldId)`
- `RowAttachment(rowId)`

### Recommended optimization

Optional generated signature:

```text
make:toyota|model:corolla|color:red
```

Use this only for:

- conflict detection optimization
- faster grouped lookups
- cache helpers

Do not use it as the only source of truth.

## Project Phases

The project should be completed in the following order.

### Phase 1: Stabilize data model

Goal:

- stop the architecture from drifting

Tasks:

- decide final row-level year storage
- update Prisma schema to move range ownership to `SearchRow`
- add `attachmentMode` to `SearchRow`
- simplify `RowValue` toward select-only storage
- preserve data migration path from old schema shape

Exit criteria:

- schema matches target architecture
- migration strategy is written and safe

### Phase 2: Build field rule enforcement

Goal:

- make field config trustworthy

Tasks:

- enforce one `RANGE` field per shop in `createField`
- enforce one `RANGE` field per shop in `editField`
- protect field deletion when it would leave the system without a range field, if range is required at all times
- optionally add stable field `key`

Exit criteria:

- shops cannot create invalid field structures

### Phase 3: Implement row write path

Goal:

- make row creation real and safe

Tasks:

- rewrite `createRow`
- validate incoming field payload against live field config
- extract and normalize year range
- generate non-range values list
- compute optional signature
- validate attachment rules
- detect overlap conflicts
- create `SearchRow`
- create `RowValue[]`
- create `RowAttachment[]`
- update `FilterSuggestion`

Exit criteria:

- saving a row from `/app/database/add` works end to end

### Phase 4: Implement row read path

Goal:

- make admin table reflect saved data

Tasks:

- rewrite `getRows`
- load rows with values and attachments
- transform rows into a UI-friendly shape
- include attachment summary fields for listing
- update `/app/database` table mapping if needed

Exit criteria:

- saved rows appear correctly in admin UI

### Phase 5: Finish admin UX

Goal:

- make create/list flow usable without manual refresh or broken states

Tasks:

- restore success flow in `/app/database/add`
- redirect after save
- support `Save & add next`
- clear form state after success
- show server validation errors cleanly
- disable invalid year combinations in UI if practical

Exit criteria:

- admin can create multiple entries reliably

### Phase 6: Row edit and delete

Goal:

- complete row lifecycle management

Tasks:

- add edit route or modal
- load existing row into form
- update overlap validation for edits
- support row deletion
- support bulk delete later if needed

Exit criteria:

- rows support full CRUD

### Phase 7: Storefront filter engine

Goal:

- make data usable by the live widget

Tasks:

- define compact storefront payload shape
- generate payload from fields and rows
- implement cascading option filtering
- map selection results to products or collection
- decide whether storefront uses app proxy, metafield JSON, or both

Exit criteria:

- storefront widget can use real database entries

### Phase 8: Hardening and scale

Goal:

- prepare for real-world use

Tasks:

- add tests for overlap rules
- add tests for field constraints
- add tests for row transformations
- add indexes and validate query plans
- review import/export design
- review migration safety
- clean old abandoned code paths

Exit criteria:

- system is maintainable and scalable

## Detailed Task Backlog

This is the ordered backlog we should execute.

### Priority 1: Architecture correction

- [x] Decide and lock the final Prisma schema for YMM - Completed Task
- [x] Move year range from `RowValue` to `SearchRow` - Completed Task
- [x] Add `attachmentMode` to `SearchRow` - Completed Task
- [x] Decide whether `tag` remains, becomes `filterSignature`, or is removed - Completed Task
- [x] Audit existing migrations and choose a safe migration strategy - Completed Task

### Priority 2: Field integrity

- [x] Enforce one `RANGE` field per shop on create - Completed Task
- [x] Enforce one `RANGE` field per shop on edit - Completed Task
- [x] Decide whether zero range fields is ever allowed - Completed Task
- [x] Add server-side validation for `rangeStart <= rangeEnd` - Completed Task
- [x] Normalize field labels and optional stable keys - Completed Task

### Priority 3: Row creation service

- [x] Replace the early-return stub in `createRow` - Completed Task
- [x] Parse attachments safely - Completed Task
- [x] Validate product vs collection mode - Completed Task
- [x] Split incoming field data into range and select groups - Completed Task
- [x] Require exactly one range input - Completed Task
- [x] Reject invalid years - Completed Task
- [x] Reject overlapping rows for the same select combination - Completed Task
- [x] Insert row, values, and attachments in one transaction - Completed Task
- [x] Update suggestion cache safely - Completed Task

### Priority 4: Row listing service

- [x] Implement `listRows` - Completed Task
- [x] Implement `getRows` - Completed Task
- [x] Transform values into `{ columns: { [fieldId]: displayValue } }` - Completed Task
- [x] Add attachment summary output - Completed Task
- [x] Return stable row metadata for table actions - Completed Task

### Priority 5: Admin add-row page

- [x] Fix `validateSubmitData` return behavior - Completed Task
- [x] Re-enable success handling - Completed Task
- [x] Redirect to database page after save - Completed Task
- [x] Support `Save & add next` - Completed Task
- [x] Preserve field order in payload - Completed Task
- [x] Prevent impossible year selections in UI - Completed Task

### Priority 6: Admin row management

- [x] Add row edit action - Completed Task
- [x] Add row delete action - Completed Task
- [x] Add server-side delete guardrails - Completed Task
- [x] Decide whether row duplication is needed - Completed Task

### Priority 7: Storefront data contract

- [x] Define widget data contract - Completed Task
- [x] Define query endpoint or metafield payload - Completed Task
- [x] Build filter cascade logic from relational data - Completed Task
- [x] Return final matched products or collection - Completed Task

### Priority 8: Reliability

- [x] Add unit tests for validation logic - Completed Task
- [x] Add integration tests for row creation - Completed Task
- [x] Add regression tests for overlap conflicts - Completed Task
- [x] Add logging for row create failures - Completed Task
- [x] Review transaction boundaries - Completed Task

## Suggested Implementation Sequence

When we start executing work, we should do it in this order:

1. Schema redesign and migration plan
2. Field constraint enforcement
3. Row creation service
4. Row read service
5. Admin add-row UX completion
6. Row edit/delete
7. Storefront query layer
8. Testing and hardening

This order matters because the row write path depends on the final schema, and the admin UI should not be polished before the underlying rules are stable.

## Migration Notes

Current migration state appears messy:

- multiple migration folders exist
- schema and implementation are still changing
- current code may not match earlier migration intent

Recommended approach:

- do not trust old completion notes blindly
- audit current database state before destructive migration work
- if needed, create a clean baseline once the target schema is finalized
- avoid data-loss commands unless explicitly planned and approved

Audit summary:

- old migrations show multiple intermediate schema directions
- migration history still contains the older `AttachmentType` and range-in-`RowValue` design
- later migrations introduced `tag` and range suggestion fields that no longer match the new target architecture
- because of this, the migration chain should be treated as historical drift, not as the canonical future path

Chosen migration strategy:

- continue implementation against the validated Prisma schema first
- avoid generating or applying destructive reset-based migrations during active development
- once row services are implemented and schema stops moving, create a clean forward migration or fresh baseline from the final YMM schema
- only reconcile or rewrite historical migration state after we confirm whether existing local/dev data needs to be preserved

## Known Risks

- old migrations may not reflect current schema accurately
- row table UI currently assumes data that backend does not return
- range overlap rules can become incorrect if implemented before final schema is settled
- tag-based logic can create hidden coupling if we keep depending on it too early
- field edits may invalidate old rows unless rules are clearly defined

## Decisions Still Needed

These questions should be answered before deep implementation:

- should overlap be blocked only for exact same select combination, or also for partially matching combinations?
- should a row support only exact select matches, or future wildcard values?

Resolved decisions:

- a shop setup may temporarily have zero `RANGE` fields during configuration, but it may never have more than one
- field labels now generate stable internal keys and existing fields are backfilled safely
- overlap is blocked only for the exact same select-field combination
- rows currently support exact select matches only
- product tagging now uses one normalized tag per field value and one tag per year instead of one combined row tag
- row duplication is not required for the current product scope and remains intentionally unimplemented

## Definition Of Done

This project is complete when:

- field config supports dynamic `SELECT` fields and one enforced `RANGE` field
- rows save successfully with row-level year ranges
- overlap conflicts are prevented correctly
- admin can create, list, edit, and delete rows
- attached products or collection resolve correctly
- storefront widget can query and use saved data
- schema, services, and UI all follow the same architecture
- tests cover the main business rules

## Working Rule For Future Tasks

Before implementing any new row or storefront behavior, always check whether it matches this architecture:

- year range belongs to `SearchRow`
- dynamic filters belong to `RowValue`
- configuration belongs to `Field`
- attachments belong to `RowAttachment`

If a new change fights this model, pause and correct the design before adding more code.
