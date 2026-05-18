# Multiple Range Fields Support Plan

এই ফাইলটি AutoFit Search-কে single `Year` range model থেকে multiple `RANGE` field support-এ নেওয়ার পূর্ণাঙ্গ implementation plan। এখনই implementation শুরু করা হবে না। কাজ শুরু করার আগে এই plan review করে final decision নেওয়া উচিত।

## Goal

বর্তমান system-এ range value `SearchRow.startYear` এবং `SearchRow.endYear`-এ সরাসরি রাখা আছে। এর ফলে app বাস্তবে একটাই range field ধরে চলে। নতুন লক্ষ্য:

- এক shop-এ একাধিক `RANGE` field রাখা যাবে, যেমন `Year`, `Mileage`, `Engine CC`, `Length` ইত্যাদি।
- প্রত্যেক row-তে প্রত্যেক range field-এর নিজস্ব `minValue` এবং `maxValue` থাকবে।
- storefront widget field order অনুযায়ী `SELECT` ও `RANGE` field একসাথে cascade করবে।
- product tag fallback, collection redirect, admin row CRUD, storefront metafield sync, tests সব নতুন range model অনুযায়ী কাজ করবে।
- non-premium shop-এ range add locked থাকবে, কিন্তু existing range edit করা যাবে। premium বা entitlement চালু হলে multiple range add করা যাবে।

## Current State Summary

বর্তমান codebase-এর গুরুত্বপূর্ণ assumption:

- `prisma/schema.prisma`
  - `SearchRow`-তে একটাই `startYear` / `endYear` আছে।
  - `RowValue` শুধু dynamic `SELECT` value রাখে।
  - `Field`-এ `rangeStart` / `rangeEnd` config আছে।
- `app/utils/fields.server.js`
  - এক shop-এ একটার বেশি `RANGE` field block করে।
- `app/utils/rows.server.js`
  - `getFieldContext` exactly one `RANGE` field চায়।
  - row save করার সময় range value `SearchRow.startYear/endYear`-এ যায়।
  - admin table display only first range field-এ value দেখায়।
- `app/utils/productTags.server.js`
  - প্রতিটি `RANGE` field একই `row.startYear/endYear` ব্যবহার করবে।
- `app/utils/storefrontConfig.server.js`
  - storefront row payload-এ only `startYear/endYear` পাঠায়।
- `extensions/auto-fit-search/assets/script.js`
  - range matching `row.startYear/endYear` দিয়ে হয়।
- `app/components/pages/database/RowEditorPage.jsx`
  - UI loop technically multiple range input render করতে পারে, কিন্তু backend persistence single range।
- `app/components/pages/database/home/FieldModal.jsx`
  - latest change অনুযায়ী add-mode-এ `Range` premium-gated/disabled।

## Recommended Data Model

Multiple range support-এর জন্য range value row-level generic storage-এ নিতে হবে। `SearchRow.startYear/endYear` আর source of truth হতে পারবে না।

### New Model: RowRangeValue

```prisma
model RowRangeValue {
  id        String    @id @default(uuid())

  rowId     String
  row       SearchRow @relation(fields: [rowId], references: [id], onDelete: Cascade)

  fieldId   String
  field     Field     @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  minValue  Int
  maxValue  Int

  @@unique([rowId, fieldId])
  @@index([rowId, fieldId])
  @@index([fieldId, minValue, maxValue])
}
```

### Prisma Relation Changes

`SearchRow`:

```prisma
rangeValues RowRangeValue[]
```

`Field`:

```prisma
rangeValues RowRangeValue[]
```

### Legacy Columns

`SearchRow.startYear` and `SearchRow.endYear` should be treated as legacy compatibility columns.

Recommended migration path:

1. Add `RowRangeValue`.
2. Backfill current single range data from `SearchRow.startYear/endYear`.
3. Make `SearchRow.startYear/endYear` nullable or keep them as deprecated mirrors during a transition.
4. Update all reads/writes to use `RowRangeValue`.
5. After storefront/admin/server no longer read legacy columns, remove them in a later migration.

This two-step approach is safer than deleting the old columns immediately.

## Migration Plan

### Migration 1: Add New Storage

- Add `RowRangeValue` model.
- Add relations to `Field` and `SearchRow`.
- Make `SearchRow.startYear` and `SearchRow.endYear` nullable, or keep required only if we intentionally mirror the first range during transition.
- Generate a Prisma migration.
- Run `prisma generate`.

### Migration 2: Backfill Existing Rows

Backfill logic:

- For each shop, find existing `RANGE` fields ordered by `position`.
- In current production data there should be one range field, usually `Year`.
- For each `SearchRow`:
  - create `RowRangeValue` for the first range field:
    - `rowId = row.id`
    - `fieldId = yearField.id`
    - `minValue = row.startYear`
    - `maxValue = row.endYear`
- Skip duplicates with `upsert` or unique constraint handling.
- Log shops with zero range fields or more than one range field for manual review.

### Migration Safety

- Do not delete old `startYear/endYear` data in the first pass.
- Add fallback reads during transition:
  - prefer `row.rangeValues`
  - fallback to `row.startYear/endYear` only for legacy rows
- Add a verification script/query to count:
  - rows without required range values
  - range values with `minValue > maxValue`
  - range values whose field is not `RANGE`

## Business Rules

### Field Rules

- `SELECT` fields still store row values in `RowValue`.
- `RANGE` fields store row values in `RowRangeValue`.
- Range bounds are configured on `Field.rangeStart/rangeEnd`.
- A row must have exactly one `RowRangeValue` for every active `RANGE` field.
- A row must have exactly one `RowValue` for every active `SELECT` field, unless optional fields are introduced later.
- Field `type` should remain non-editable after creation.

### Subscription Rules

- Non-premium:
  - cannot add new `RANGE` fields.
  - can edit existing `RANGE` field label, placeholder, visibility, sort order, and bounds if valid.
- Premium:
  - can add `RANGE` fields up to the plan limit.
  - plan limit should be enforced in both UI and server.
- Server must enforce entitlement even if UI is bypassed.

Potential helper:

```js
async function getRangeFieldLimit(shopId) {
  return isPremiumShop(shopId) ? PREMIUM_RANGE_LIMIT : 1;
}
```

Until real billing/subscription data exists, use a clearly named feature flag/helper so the logic is easy to replace.

### Range Bound Edit Rules

When editing `Field.rangeStart/rangeEnd`:

- `rangeStart <= rangeEnd` is required.
- If existing `RowRangeValue` values fall outside the new bounds, block the edit with a clear error.
- Alternative future UX: offer a bulk clamp/migration action. Do not silently mutate row data.

### Field Deletion Rules

Current delete behavior can leave rows structurally invalid. Multiple range support should tighten this.

Recommended MVP rule:

- Block deleting any field that has existing row data.
- For `SELECT`, check `RowValue`.
- For `RANGE`, check `RowRangeValue`.
- If no row data exists, allow delete and normalize positions.

Future option:

- Add a dedicated "delete field and affected rows" destructive workflow.

### Adding A Range Field When Rows Already Exist

This is the biggest UX/data decision.

Recommended full-support behavior:

- If rows exist and merchant adds a new `RANGE` field, require a backfill choice before saving:
  - fill all existing rows with the new field's full configured bounds, or
  - cancel and edit/import rows manually later.
- Store this as `RowRangeValue` for every existing row.
- Rebuild product tags and storefront metafields after backfill.

MVP fallback if we want less scope:

- Block adding new `RANGE` fields while rows exist.
- Message: "Add range fields before creating search entries, or clear/import data with the new structure."

The full-support behavior is better for premium upgrades.

## Conflict And Overlap Rules

Current rule: same select combination cannot have overlapping year range.

Multiple range rule: same select combination cannot have overlapping range space across all range fields.

Definition:

- Two rows conflict only when:
  - their `filterSignature` is the same, and
  - every configured range field overlaps.

Overlap for one range field:

```text
existing.minValue <= next.maxValue
AND
existing.maxValue >= next.minValue
```

Overlap for multiple range fields:

```text
all range fields overlap at the same time
```

Example:

- Existing: `Year 2018-2020`, `Mileage 0-50000`
- New: `Year 2019-2021`, `Mileage 60000-90000`
- Same select fields.
- These do not conflict because `Mileage` does not overlap.

Implementation direction:

- Keep `filterSignature` based only on `SELECT` values.
- Query candidate rows with the same `filterSignature`.
- Include their `rangeValues`.
- In JS/server code, compare range maps field-by-field.
- For edit, exclude the current `rowId`.

Rename helpers:

- `hasYearRangeOverlap` -> `rangesOverlap`
- Add `rangeSetsOverlap(existingRangeMap, nextRangeMap, rangeFields)`

## Server Changes

### app/utils/fields.server.js

Tasks:

- Replace hardcoded "only one range" validation with entitlement-aware range limit.
- Add a server guard for non-premium range creation.
- Validate range bounds for any `RANGE` field.
- When creating a new `RANGE` field:
  - if no rows exist, normal create.
  - if rows exist, trigger/apply backfill strategy.
- When editing a `RANGE` field:
  - block bounds that exclude existing row range values.
- When deleting a field:
  - block if row values or range values exist.
- Ensure field reorder still rebuilds select `filterSignature`; range order does not affect signature but affects UI cascade.

### app/utils/rows.server.js

Tasks:

- Update `listRows` includes:
  - `values.field`
  - `rangeValues.field`
  - `attachments`
- Replace `getFieldContext`:
  - require at least one `RANGE` field before creating rows.
  - allow multiple `RANGE` fields.
  - return `selectFields`, `rangeFields`, `fieldMap`.
- Update payload parsing:
  - `SELECT` entry: `{ fieldId, value }`
  - `RANGE` entry: `{ fieldId, minValue, maxValue }`
- Update validation:
  - submitted fields must match current field configuration.
  - every `RANGE` field must have valid integer min/max.
  - `minValue <= maxValue`.
  - min/max must stay inside `Field.rangeStart/rangeEnd`.
- Update row creation:
  - create `SearchRow` without relying on `startYear/endYear`.
  - create `RowValue[]` for select fields.
  - create `RowRangeValue[]` for range fields.
  - compute product tags from both select and range values.
  - compute overlap conflicts using multi-range rule.
- Update row update:
  - delete and recreate `RowValue` and `RowRangeValue`, or upsert both sets.
  - remove old product tags, add new product tags.
  - exclude current row in overlap query.
- Update admin shape:
  - `columns[field.id]` should work for every `SELECT` and every `RANGE`.
  - range display should use `minValue-maxValue` or single value if equal.
- Update edit loader shape:
  - `buildEditFieldData` must return each range field's own min/max.
- Update `rebuildRowFilterSignatures`:
  - still based on `SELECT` fields only.
  - should not depend on range fields.

### app/utils/productTags.server.js

Tasks:

- Accept row data with `rangeValues`.
- Build tags:
  - `SELECT`: `autofit_{fieldKey}_{slugifiedValue}`
  - `RANGE`: for every integer value between min and max, `autofit_{fieldKey}_{value}`
- Use field-specific range values, not `row.startYear/endYear`.
- Add a guard against huge tag explosions.

Important risk:

- Shopify product tag strategy works well for small discrete ranges like years.
- It can break down for large ranges like mileage 0-200000 because it would create too many tags.

Recommended rule:

- Add a per-range span cap, for example 200 or another product decision.
- If a range span exceeds the cap, block row save or require a different search strategy.
- Future alternative: use app proxy/search endpoint instead of product tag fallback for huge numeric ranges.

### app/utils/storefrontConfig.server.js

Tasks:

- Include `rangeValues` in storefront row payload:

```json
{
  "id": "row-1",
  "attachmentMode": "PRODUCT",
  "filterSignature": "brand:toyota|model:corolla",
  "values": [
    { "fieldId": "brand-id", "key": "brand", "value": "Toyota" }
  ],
  "rangeValues": [
    { "fieldId": "year-id", "key": "year", "minValue": 2018, "maxValue": 2020 },
    { "fieldId": "mileage-id", "key": "mileage", "minValue": 0, "maxValue": 50000 }
  ],
  "attachments": []
}
```

- Keep `startYear/endYear` temporarily only if needed for backward compatibility.
- Hydrate collection handles exactly as now.
- Ensure metafield JSON size stays reasonable.

### app/utils/storefrontSearch.server.js

Tasks:

- Replace `year` argument with generic `ranges`:

```js
getMatchingRows(config, {
  ranges: { year: 2020, mileage: 35000 },
  filters: { brand: "Toyota", model: "Corolla" },
});
```

- Keep temporary backward compatibility:
  - if `year` is passed, map it to the first `RANGE` field or `year` key.
- Update row matching:
  - `SELECT`: exact normalized value match.
  - `RANGE`: selected numeric value must be inside that row's field-specific min/max.
- Update available options:
  - include `SELECT` fields and `RANGE` fields according to position.
  - for range options, generate available discrete values from field-specific row ranges.

## Admin UI Changes

### app/components/pages/database/home/FieldModal.jsx

Tasks:

- Keep current non-premium range add disabled behavior.
- Add props or loader data for entitlement:
  - `canAddRangeField`
  - `rangeFieldLimit`
  - `currentRangeFieldCount`
- In add mode:
  - default to `SELECT` if range is locked.
  - allow `RANGE` only if entitlement and limit allow it.
- In edit mode:
  - field type remains disabled.
  - existing range can be edited.
- Show premium messaging only in add mode.
- Add backfill UX if adding a range field while rows exist:
  - full-bounds backfill checkbox or confirmation.

### app/routes/app.database_.jsx

Tasks:

- Loader should include subscription/entitlement state.
- Pass entitlement and row count to `FieldModal`.
- Action should send any backfill choice to `createField`.
- Admin table should display every range column from `row.columns[field.id]`.
- Deleting fields should surface new server errors cleanly.
- After field add/edit/delete/reorder, sync storefront config as now.
- If product tags need rebuild after range structural changes, call a dedicated rebuild function.

### app/components/pages/database/RowEditorPage.jsx

Good news:

- The current UI already loops fields and renders range fields with `minValue/maxValue`.

Tasks:

- Ensure each range field uses its own `fieldData` entry.
- Update copy from "year" to generic range label where hardcoded.
- Ensure `isChanged` tracks fieldData changes, not only attachments.
- If many range fields exist, review layout so the form remains readable.
- Validate all range fields before submit.
- Submit payload can remain array-based, but server must interpret multiple ranges.
- Edit mode must prefill each range field from `RowRangeValue`.

### app/routes/app.database.add.jsx

Tasks:

- No major route shape change expected.
- Ensure loader gets fields with suggestions.
- Ensure row create action uses updated `createRow`.
- Sync storefront config after success.

### app/routes/app.database.edit.$rowId.jsx

Tasks:

- Ensure `getRowEditorData` returns multiple range values.
- Ensure update action uses updated `updateRow`.
- Sync storefront config after success.

## Storefront Widget Changes

### extensions/auto-fit-search/assets/script.js

This file is minified. Before a large change, decide one of these:

- create/edit a readable source file and minify into `script.js`, or
- carefully patch the minified file and keep size under Shopify theme-check limits.

Recommended:

- Add a source file such as `extensions/auto-fit-search/assets/script.source.js` or a local build script.
- Generate minified `script.js` from source.
- Keep final app extension asset below Shopify's JavaScript asset size limit.

Tasks:

- State should remain generic by field key:

```js
state[field.key] = selectedValue;
```

- Field matching should be type-aware:
  - `SELECT`: read from `row.values`.
  - `RANGE`: read from `row.rangeValues`.
- Available options:
  - for `SELECT`, unique values from matching candidate rows.
  - for `RANGE`, union of available discrete values from matching candidate rows' field-specific ranges.
- Final row match:
  - selected value must match every visible field.
  - for hidden fields, decide whether they are ignored or still required. Current behavior uses visible fields; keep that unless product requirements change.
- Product tag redirect:
  - selected `RANGE` values should produce field-specific tags:

```text
autofit_year_2020
autofit_mileage_35000
```

- Collection redirect:
  - still prefer matched collection row with hydrated handle.
- History:
  - URL params already use `autofit_{field.key}`.
  - Keep this generic for multiple ranges.
  - Parse range params as numbers.
- Multiple widgets:
  - Keep existing block-scoped behavior.

### Liquid Blocks

Likely minimal changes:

- `extensions/auto-fit-search/blocks/search-widget.liquid`
- `extensions/auto-fit-search/blocks/injectable-widget.liquid`
- `extensions/auto-fit-search/blocks/app-embed.liquid`

Tasks:

- Ensure they pass updated `rows` payload with `rangeValues`.
- Ensure no assumptions about exactly one range field in Liquid.
- Keep app embed asset loading unchanged unless script build strategy changes.

## Product Tags And Search Results

### Product Rows

For product attachments, products receive tags from all selected dimensions.

Example row:

- Brand: Toyota
- Model: Corolla
- Year: 2018-2020
- Mileage: 0-50000

Product tags include:

```text
autofit_brand_toyota
autofit_model_corolla
autofit_year_2018
autofit_year_2019
autofit_year_2020
autofit_mileage_0
...
autofit_mileage_50000
```

This is only safe if range spans are small. For large numeric ranges, use a cap or a future app-proxy result page.

### Collection Rows

Collection rows should not rely on product tags. They should:

- match exact selected field combination against row data.
- redirect to hydrated collection handle.

## Import, Export, And Backup Considerations

The database page already shows backup/import buttons, even if the implementation is incomplete or future-facing.

Any import/export format must include:

- fields
- rows
- row select values
- row range values
- attachments

Recommended row export shape:

```json
{
  "values": {
    "brand": "Toyota",
    "model": "Corolla"
  },
  "ranges": {
    "year": { "minValue": 2018, "maxValue": 2020 },
    "mileage": { "minValue": 0, "maxValue": 50000 }
  },
  "attachmentMode": "PRODUCT",
  "attachments": []
}
```

Import validation must use the same rules as `createRow`.

## Storefront Payload Compatibility

During transition, support both payloads:

Legacy row:

```json
{
  "startYear": 2018,
  "endYear": 2020
}
```

New row:

```json
{
  "rangeValues": [
    { "key": "year", "minValue": 2018, "maxValue": 2020 }
  ]
}
```

Compatibility helper:

- if `row.rangeValues` exists, use it.
- else if field is `RANGE` and row has `startYear/endYear`, synthesize one legacy range for the first or `year` range field.

Remove this fallback only after all deployed stores have synced new metafields.

## Testing Plan

### Existing Tests To Update

- `tests/fitment-engine.test.js`
  - product tags should use `rangeValues`.
  - storefront matching should accept `ranges`.
  - keep legacy `year` compatibility test temporarily.
- `tests/integration-row-flow.test.js`
  - replace "allows only one range field" test with entitlement/limit tests.
  - add row creation with two range fields.
  - update overlap tests for multi-dimensional range conflict.

### New Tests

Add tests for:

- `rangesOverlap` helper.
- `rangeSetsOverlap` helper.
- same select combination + all ranges overlap => reject.
- same select combination + one range does not overlap => allow.
- different select combination + overlapping ranges => allow.
- row create persists multiple `RowRangeValue` records.
- row edit replaces multiple range values correctly.
- `getRows` returns display columns for all range fields.
- `getRowEditorData` preloads all range fields.
- product tags use field-specific range values.
- storefront config includes `rangeValues`.
- storefront utilities return options for multiple range fields.
- field deletion is blocked when range values exist.
- editing range bounds is blocked when existing row values are outside the new bounds.
- backfill existing rows when adding a new range field, if we choose full-support backfill.

### Suggested Verification Commands

Use Windows-friendly commands in this repo:

```powershell
npx.cmd prisma validate
npx.cmd prisma generate
node --test tests/*.test.js
npx.cmd eslint --no-cache app tests
```

`npm.cmd run lint` may fail locally if ESLint cache cannot write to `node_modules/.cache/eslint`; use `--no-cache` for focused verification.

## Implementation Phases

### Phase 0: Final Decisions

- [x] Done - Decide premium range field limit. Current implementation uses `AUTO_FIT_RANGE_FIELD_LIMIT`, defaulting to `1`.
- [x] Done - Decide MVP behavior for adding range fields when rows already exist.
  - [x] Done - Full-bounds backfill was implemented.
  - [x] Done - Blocking until rows are cleared was not selected.
- [x] Done - Decide max allowed range span for product tag generation. Product tag range spans are capped at `500` values.
- [x] Done - Decide whether to keep legacy `startYear/endYear` for one release. They are retained as transition mirrors.
- [x] Done - Decide whether to create a readable storefront script source and minify from it. Added `extensions/auto-fit-search/src/script.js` and generated `assets/script.js`.

### Phase 1: Schema And Migration

- [x] Done - Add `RowRangeValue` model.
- [x] Done - Add relations to `Field` and `SearchRow`.
- [x] Done - Make `SearchRow.startYear/endYear` legacy nullable or deprecated.
- [x] Done - Create Prisma migration.
- [x] Done - Backfill existing rows into `RowRangeValue`.
- [x] Done - Add verification query/script for migrated data through migration backfill and integration tests.
- [x] Done - Run Prisma validate/generate.

### Phase 2: Core Server Model

- [x] Done - Update field context to allow multiple range fields.
- [x] Done - Update row payload parser.
- [x] Done - Update row validation for all select/range fields.
- [x] Done - Update create row transaction.
- [x] Done - Update edit row transaction.
- [x] Done - Update delete row cleanup.
- [x] Done - Update row list/admin shape.
- [x] Done - Update row editor preload shape.
- [x] Done - Update overlap detection.
- [x] Done - Update product tag generation.
- [x] Done - Update storefront config generation.

### Phase 3: Field Management And Entitlement

- [x] Done - Add entitlement/range limit helper.
- [x] Done - Enforce range add limit server-side.
- [x] Done - Enforce range add limit client-side.
- [x] Done - Add premium messaging in `FieldModal`.
- [x] Done - Add row-data guard for field delete.
- [x] Done - Add range bounds guard for field edit.
- [x] Done - Add backfill flow if selected.
- [x] Done - Rebuild product tags/config when range field structure changes.

### Phase 4: Admin UI

- [x] Done - Update database route loader/action props.
- [x] Done - Update `FieldModal` for premium multiple range behavior.
- [x] Done - Update `RowEditorPage` dirty state and generic range copy.
- [x] Done - Confirm multiple range inputs render well through existing field loop and build verification.
- [x] Done - Confirm add row payload includes every range.
- [x] Done - Confirm edit row prefill includes every range.
- [x] Done - Confirm database table displays every range column.

### Phase 5: Storefront Engine

- [x] Done - Add source/minify workflow for `script.js` if chosen.
- [x] Done - Update row matching to use `row.rangeValues`.
- [x] Done - Update available options generation for multiple ranges.
- [x] Done - Update product tag redirect generation.
- [x] Done - Keep collection redirect by hydrated handle.
- [x] Done - Keep history/query-param support generic by field key.
- [x] Done - Keep injected and section widgets in sync.
- [x] Done - Check script size after minification. Generated asset is under 10KB.

### Phase 6: Tests And Regression

- [x] Done - Update existing tests.
- [x] Done - Add multi-range unit tests.
- [x] Done - Add multi-range integration row flow tests.
- [x] Done - Add storefront payload tests.
- [x] Done - Add product tag span cap coverage through product tag generation guard.
- [x] Done - Add migration/backfill tests where practical.
- [x] Done - Run focused lint and test commands.

### Phase 7: Cleanup

- [x] Done - Remove or deprecate legacy `hasYearRangeOverlap` naming. Kept as a compatibility wrapper over `rangesOverlap`.
- [x] Done - Remove legacy `startYear/endYear` reads after migration confidence. Retained intentionally as transition compatibility reads.
- [x] Done - Remove compatibility payload fields when no longer needed. Retained intentionally for deployed storefront compatibility.
- [x] Done - Update old plan docs if the product direction changes from "exactly one range" to "multiple ranges".
- [x] Done - Update README or developer notes with new data model via this plan and the master plan note.

## Acceptance Criteria

- [x] Done - Premium-enabled shop can create at least two `RANGE` fields.
- [x] Done - Non-premium shop cannot create additional `RANGE` fields via UI or forged request.
- [x] Done - Existing `Year` field can still be edited.
- [x] Done - A row stores one range value per range field.
- [x] Done - Row create/edit rejects missing or invalid range values.
- [x] Done - Row create/edit rejects conflicts only when select signature and all range intervals overlap.
- [x] Done - Admin table shows every range field correctly.
- [x] Done - Row edit page preloads every range field correctly.
- [x] Done - Storefront widget shows and cascades multiple range dropdowns.
- [x] Done - Storefront final matching uses field-specific range values.
- [x] Done - Product tag redirects include selected values for all select and range fields.
- [x] Done - Collection redirects still use hydrated collection handles.
- [x] Done - Existing single-year data migrates without loss.
- [x] Done - Tests cover multi-range server, product tags, storefront search, and integration flow.

## Main Risks

- Product tag explosion for large ranges.
- Existing rows becoming invalid when a new range field is added.
- Storefront metafield JSON growing too large for large catalogs.
- Minified storefront script becoming hard to maintain.
- Legacy `startYear/endYear` compatibility hiding incomplete migration bugs.
- Field deletion/editing can invalidate many rows if not guarded.

## Recommended First Implementation Slice

When work starts, do the smallest useful vertical slice:

1. Add `RowRangeValue` and backfill existing Year data.
2. Update server row create/read/edit to use range values.
3. Keep UI mostly unchanged and confirm one range still works.
4. Add a second range in tests and prove row persistence/overlap works.
5. Then update storefront JS.
6. Then unlock premium-gated range add behavior.

This reduces risk because the old single-range behavior stays working while the new storage model is introduced.
