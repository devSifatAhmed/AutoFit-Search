# AutoFit Search Relational Data Implementation Plan

This file is the working checklist for moving AutoFit Search from JSON-blob data storage to a cleaner relational SaaS pattern.

## Goals

- Keep Shopify embedded app behavior working.
- Replace shop-level JSON blob CRUD with relational Prisma models.
- Keep utilities small and focused so future updates are easy.
- Support field CRUD, row creation, storefront filter config, and product tagging.
- For now, implement creation flow first; edit/update will be handled later in a dedicated edit route.

## Business Rules

- A shop owns all fields, search rows, row values, attachments, and filter suggestions.
- Each search row can attach either products or a collection, never both.
- If a row attaches a collection, only one collection can be selected.
- If a row attaches products, multiple products can be selected.
- Product rows generate a fitment tag from ordered field values.
- Generated tag is added to every attached product.
- Collection rows do not need generated product tags.
- Attachment records store only Shopify GIDs. Product/collection title, image, and link are hydrated from Shopify when needed.
- Field IDs and keys must stay stable. Editing a label must not break existing row values.
- Every server query must be scoped by shop.

## Target Data Shape

```text
Shop
  Field[]
  SearchRow[]
    RowValue[]
    RowAttachment[]
  FilterSuggestion[]
```

## Prisma Models To Add

### Shop

Stores one tenant per installed Shopify shop.

Important fields:

- `id`
- `shopifyGid`
- `name`
- `domain`

### Field

Stores dynamic database/search structure.

Important fields:

- `id`
- `shopId`
- `key`
- `label`
- `type`
- `placeholder`
- `labelVisibility`
- `sortOrder`
- `position`
- `rangeStart`
- `rangeEnd`
- `isRequired`
- `isLocked`

### SearchRow

Stores one fitment/search rule.

Important fields:

- `id`
- `shopId`
- `attachmentType`
- `generatedTag`
- `isActive`

### RowValue

Stores field values for a search row.

Important fields:

- `rowId`
- `fieldId`
- `value`
- `numberStart`
- `numberEnd`

Field type mapping:

- `SELECT`: store in `value`
- `TEXT`: store in `value`
- `NUMBER`: store in `numberStart`
- `RANGE`: store in `numberStart` and `numberEnd`

### RowAttachment

Stores only Shopify IDs for attached products or collection.

Important fields:

- `rowId`
- `shopifyGid`

The attachment type lives on `SearchRow.attachmentType`, because a row cannot mix product and collection attachments.

### FilterSuggestion

Stores optional cached suggestions for admin/storefront use.

Important fields:

- `shopId`
- `fieldId`
- `value`
- `usageCount`
- `isPinned`
- `isHidden`

## Utility File Boundaries

Keep utilities small and single-purpose:

- `app/utils/shops.server.js`
  - `ensureShop`
  - shop lookup helpers

- `app/utils/metafields.server.js`
  - `getCurrentAppInstallationId`
  - `setAppJsonMetafield`

- `app/utils/storefrontConfig.server.js`
  - `buildStorefrontConfig`
  - `syncStorefrontConfig`

- `app/utils/fields.server.js`
  - `getFields`
  - `createField`
  - `editField`
  - `deleteField`
  - field normalization/mapping

- `app/utils/rows.server.js`
  - `getRows`
  - `createRow`
  - row value mapping
  - attachment validation

- `app/utils/productTags.server.js`
  - `buildFitmentTag`
  - `addTagToProducts`

## Field CRUD Flow

### Get Fields

1. Ensure shop exists.
2. If no relational fields exist, seed from `app/data/fields.json`.
3. Return fields sorted by `position`.

### Create Field

1. Validate type.
2. Generate stable key from label.
3. Ensure key unique per shop.
4. Create field with next `position`.
5. Sync storefront config.
6. Return updated fields.

### Edit Field

1. Update editable metadata only.
2. Do not change `id`.
3. Do not change `key` automatically.
4. Sync storefront config.
5. Return updated fields.

### Delete Field

1. Prevent delete if `isLocked`.
2. Delete field.
3. Related `RowValue` and `FilterSuggestion` are cascade deleted.
4. Sync storefront config.
5. Return updated fields.

## Row Creation Flow

1. Load shop and fields.
2. Validate submitted values against field type.
3. Validate attachment rule:
   - `PRODUCT`: one or more product IDs.
   - `COLLECTION`: exactly one collection ID.
4. If `PRODUCT`, build generated tag from ordered field values.
5. Create `SearchRow`.
6. Create related `RowValue` records.
7. Create related `RowAttachment` records.
8. If `PRODUCT`, add generated tag to every attached product with Shopify Admin GraphQL.
9. Sync storefront config.
10. Return updated rows.

## Product Tagging

Generated tag is based on ordered field values:

```text
Brand = Honda
Model = Civic
Year = 2015-2020

tag = honda_civic_2015_2020
```

Tag normalization:

- lowercase
- trim whitespace
- spaces to underscores
- remove/replace unsafe characters
- collapse duplicate underscores
- no leading/trailing underscores

## Storefront Cascading Filter Logic

Storefront config should contain compact JSON:

```js
{
  fields: [],
  rows: [],
  suggestions: [],
  updatedAt: "ISO_DATE"
}
```

Storefront filter behavior:

1. Show first field options from all rows.
2. When first field selected, filter matching rows.
3. Build second field options from matching rows.
4. Repeat for third/fourth/etc. fields.
5. Final matches return product or collection GIDs.

## Migration Strategy

Initial implementation can create new relational tables while leaving old JSON tables in place temporarily.

Later cleanup can remove old models:

- `fields`
- `rows`
- `suggestions`
- `keywords`

This avoids a risky one-step conversion while development is still moving.

## Verification Checklist

- `prisma validate` passes.
- Prisma migration applies.
- Prisma client generates.
- Database page loads existing/seeded fields.
- Field add/edit/delete still works using relational tables.
- Add search entry can save product rows.
- Product row adds generated tag to selected products.
- Add search entry can save one collection row.
- Collection row rejects multiple collections server-side.
- Product row rejects empty product selection server-side.
- Database table displays relational rows.
- Storefront config metafield syncs after field/row updates.

## Current Implementation Status

- [x] Added relational Prisma models while keeping legacy JSON models temporarily.
- [x] Added focused utility modules for shops, metafields, storefront config, product tags, fields, and rows.
- [x] Moved field CRUD to relational `Field` records.
- [x] Added first-time relational field seeding from legacy JSON/default fields.
- [x] Added row creation with `PRODUCT`/`COLLECTION` attachment validation.
- [x] Added generated product tag creation from ordered field values.
- [x] Added Shopify Admin GraphQL `tagsAdd` for product rows.
- [x] Added compact storefront config metafield sync after field/row updates.
- [x] Wired `/app/database/add` creation submit flow.
- [x] Wired `/app/database` row listing to relational rows.
- [x] Ran `prisma validate`.
- [x] Synced database schema with `prisma db push`.
- [x] Generated Prisma Client using `PRISMA_CLIENT_ENGINE_TYPE=binary`.
- [x] Ran targeted ESLint.
- [x] Ran production build.

## Migration Note

`prisma migrate dev --name relational_data_model` could not be used because Prisma detected that the previously applied migration `20260502023131_add_shop_to_keywords` was modified after it had been applied, and requested a database reset. I did not reset the database because that can delete data.

For this implementation pass, the schema was applied with:

```shell
npx prisma db push
```

Before production deployment, clean migration history should be restored. The safest options are:

- create a fresh baseline migration for the current schema in a disposable/dev database, or
- reconcile the modified applied migration checksum/history, then generate a normal migration.

Do not run `prisma migrate reset` against a database that contains data you want to keep.
