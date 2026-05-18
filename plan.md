# Storefront JavaScript Fix Plan

## Goal

Make the AutoFit Search storefront widget match the backend data model exactly, especially for collection attachments. Product attachments already work through Shopify product tags, but collection attachments need a reliable collection handle in the storefront payload because the storefront cannot redirect with only a collection GID.

## Current Problems

1. Collection attachment rows store only Shopify GIDs.
   - Storefront redirect needs `/collections/{handle}`.
   - Current JS tries to query collection handle from the storefront with the GID, but this is not reliable from theme JS.

2. Range fields are not matched correctly during final row matching.
   - Backend stores year as `SearchRow.startYear` and `SearchRow.endYear`.
   - Storefront JS currently treats every selected field as if it exists in `row.values`.

3. Product tag URL generation can mismatch backend tags.
   - Backend product tags are slugified into `autofit_{fieldKey}_{normalized_value}`.
   - Storefront JS currently uses `encodeURIComponent`, which can produce different output for spaces and punctuation.

4. Hidden fields can break the widget.
   - Liquid renders only fields where `visibility == "VISIBLE"`.
   - JS currently builds required state from every field in the metafield payload.

5. Widget selectors are globally scoped.
   - `document.querySelector(...)` can attach to the wrong element if multiple widgets exist on the page.
   - Initialization event includes `blockId`, but JS does not use it to scope selectors.

6. Placeholder handling is inconsistent.
   - Liquid uses `field.placeholder`.
   - JS repopulates selects with `Select ${field.label}` instead of preserving configured placeholders.

7. Debug logging is still present in storefront code.
   - `console.clear()` and row/state logs should not run in production storefront code.

## Proposed Solution

### 1. Add collection handles to storefront metafields

Change the storefront sync path so collection attachments are hydrated before being written to app metafields.

Implementation direction:

- Update `app/utils/storefrontConfig.server.js`.
- During `syncStorefrontConfig(admin, shopId)`, inspect rows with `attachmentMode === "COLLECTION"`.
- Query Admin GraphQL `nodes(ids: [...])`.
- For collection nodes, include at least:
  - `id`
  - `handle`
  - `title` if useful for debugging/admin payload clarity
- Write attachments in storefront payload as:

```json
{
  "id": "gid://shopify/Collection/123",
  "handle": "summer-fitments"
}
```

Fallback rule:

- If a legacy row has only an ID and no handle, do not guess the handle in JS.
- Product fallback can still use tags.
- Collection fallback should fail gracefully with a warning or no redirect instead of building a broken URL.

### 2. Fix storefront row matching for RANGE fields

Update `extensions/auto-fit-search/assets/script.js` so field matching follows field type:

- `SELECT`: match against `row.values`.
- `RANGE`: match selected year against `row.startYear <= year <= row.endYear`.

This applies to:

- available option generation
- final matched row selection
- search button enabled state

### 3. Normalize product tag URLs exactly like backend

Add the same slug behavior used by `app/utils/productTags.server.js` to storefront JS:

```js
function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
```

Then product fallback URL should use:

```text
/collections/all/autofit_brand_ford+autofit_model_corolla_cross+autofit_year_2020
```

### 4. Use only visible fields in storefront UI logic

Create separate field lists:

- `allFields`: all metafield config if needed.
- `visibleFields`: fields with `visibility === "VISIBLE"`.
- `orderedFields`: visible fields sorted by `position`.

Use `orderedFields` for:

- state initialization
- dropdown lookup
- required-field completion
- cascading UI
- final search selection

### 5. Scope JS to the current widget block

Use the event detail from Liquid:

```js
const widget = document.querySelector(
  `[data-section-type="auto-fit-search"][data-block-id="${blockId}"]`
);
```

Then query elements inside that widget:

```js
widget.querySelector(...)
```

This prevents collisions when more than one widget appears on the same storefront page.

### 6. Preserve configured placeholders

When repopulating selects, use:

```js
field.placeholder || `Select ${field.label}`
```

### 7. Clean production logs

Remove:

- `console.clear()`
- `console.log("Rows:", window.rows)`
- `console.log("STATE:", state)`

Keep only meaningful `console.warn` or `console.error` for unexpected failure paths.

## Implementation Order

1. Update this plan if any new mismatch is discovered before coding.
2. Update storefront payload generation to include collection handles.
3. Update tests for collection handle payload behavior.
4. Refactor storefront JS:
   - widget-scoped selectors
   - visible field filtering
   - field-type-aware matching
   - backend-compatible slugify
   - collection redirect by attachment handle
   - clean logs/placeholders
5. Update Liquid initialization only where necessary:
   - keep metafield assignment
   - pass `blockId`
   - remove production debug logs
6. Run focused tests:
   - `npm run lint` if reasonable
   - node tests in `tests/`
   - any lightweight syntax checks available
7. Manually review generated storefront payload shape.

## Expected Final Behavior

### Product rows

If the final matched row is product-based:

- Build `/collections/all/...` using tags that match backend `buildProductTags`.
- Include selected range year as an `autofit_year_YYYY` tag.
- Redirect to the product-filtered collection URL.

### Collection rows

If the final matched row is collection-based:

- Read `matchedRow.attachments[0].handle`.
- Redirect to `/collections/{handle}`.
- Do not call Storefront GraphQL from browser JS to discover the handle.

### Cascading dropdowns

Fields should cascade according to configured order:

- Brand filters Model.
- Brand + Model filters Year.
- Field names/order remain dynamic.
- Hidden fields do not block or appear in the widget.

## Acceptance Checklist

- [x] Collection rows redirect using collection handle from app metafield payload.
- [x] Product rows still redirect through product tags.
- [x] Product tag URL normalization matches backend tag generation.
- [x] Year/range selection checks `startYear` and `endYear`, not `row.values`.
- [x] Hidden fields do not disable search.
- [x] Multiple widgets on the same page do not collide.
- [x] Select placeholders use merchant-configured placeholders.
- [x] Production debug logs are removed.
- [x] Tests are updated or added for collection handle payload.
- [x] Existing fitment tests still pass.

## Completion Notes

- `syncStorefrontConfig` now hydrates collection attachment handles from Admin GraphQL before writing storefront metafields.
- Storefront JS no longer calls browser GraphQL to resolve collection handles.
- Storefront JS now handles `SELECT` and `RANGE` fields according to the backend row model.
- Product redirect tags now use the same slug behavior as backend product tags.
- Liquid initialization now passes block-scoped field, row, and suggestion payloads to the JS event.
- Verification completed with focused tests, targeted lint, and production build.

## History And Load Safety Addendum

- `search-widget.liquid` now defines `enable_history` and passes it to storefront JS.
- Widget state is restored from URL params first, then `sessionStorage`.
- Widget state is persisted into URL params like `autofit_brand=FORD` and path-scoped `sessionStorage`.
- Clear filters removes stored history and the URL params.
- The Liquid initializer now runs immediately when the DOM is already ready, or waits for `DOMContentLoaded` only when needed.
- Widget config is registered on `window.autoFitSearchWidgets` so `script.js` can initialize even if the custom event was dispatched before the external script loaded.

## Multi Widget And Multi Page History Addendum

- History storage is now keyed by the visible field structure, not only by the source page path.
- The old path/block scoped storage key is still read as a legacy fallback.
- Search redirects now carry history query params to the target product or collection URL.
- Same-page widgets with the same field structure receive `autoFitSearch:historyChanged` updates, so repeated widgets stay in sync.
- Widgets with different field structures use different storage scopes, so unrelated widgets do not overwrite each other.
- Restoring history on page load now updates only the form state and storage/same-page sync; it does not write query params into the current URL.
- Query params are added only to the explicit search destination URL.
- Clear/reset now also broadcasts a global reset signal, so injected widgets and section widgets reset together even if their storage scopes differ.

## Injectable Widget Addendum

- `app-embed.liquid` stays as the original lightweight head embed: it only enables AutoFit and loads CSS/JS.
- `injectable-widget.liquid` is a separate head block dedicated to injection.
- `injectable-widget.liquid` does not include CSS/JS assets again; the initial `app-embed.liquid` block owns asset loading.
- `injectable-widget.liquid` does not overwrite global field/row/suggestion variables; it registers only its own injection config.
- `AutoFit Search Inject` accepts an injection selector such as `#fitment-search` or `.fitment-search`.
- Every matched element receives a child AutoFit Search widget.
- The app also tries both ID and class when a plain selector name is entered.
- Injected widgets use the same storefront engine, history sync, product tag redirects, and collection handle redirects as section widgets.
- `script.js` is minified so the theme app block JavaScript asset stays below Shopify's 10KB theme-check threshold.
