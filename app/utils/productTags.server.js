export const MAX_PRODUCT_TAG_RANGE_VALUES = 500;

function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function getRangeValueMap(row) {
    return new Map((row.rangeValues || []).map((rangeValue) => [
        rangeValue.fieldId,
        {
            minValue: Number(rangeValue.minValue),
            maxValue: Number(rangeValue.maxValue),
        },
    ]));
}

function getLegacyRangeValue(row) {
    if (row.startYear === null || row.startYear === undefined || row.endYear === null || row.endYear === undefined) {
        return null;
    }

    return {
        minValue: Number(row.startYear),
        maxValue: Number(row.endYear),
    };
}

function assertRangeSpanIsTaggable(field, rangeValue) {
    const span = rangeValue.maxValue - rangeValue.minValue + 1;

    if (span > MAX_PRODUCT_TAG_RANGE_VALUES) {
        throw new Error(`${field.label} range is too large for product tag search. Keep product range spans at ${MAX_PRODUCT_TAG_RANGE_VALUES} values or less.`);
    }
}

export function buildProductTags({ fields, row }) {
    const tags = [];
    const valueMap = new Map((row.values || []).map((value) => [value.fieldId, value.value]));
    const rangeValueMap = getRangeValueMap(row);
    const legacyRangeValue = rangeValueMap.size === 0 ? getLegacyRangeValue(row) : null;

    for (const field of fields) {
        const fieldKey = field.key || slugify(field.label) || field.id;

        if (field.type === "RANGE") {
            const rangeValue = rangeValueMap.get(field.id) || legacyRangeValue;

            if (!rangeValue) {
                continue;
            }

            assertRangeSpanIsTaggable(field, rangeValue);

            for (let value = rangeValue.minValue; value <= rangeValue.maxValue; value += 1) {
                tags.push(`autofit_${fieldKey}_${value}`);
            }
            continue;
        }

        const rawValue = valueMap.get(field.id);

        if (!rawValue) {
            continue;
        }

        const normalizedValue = slugify(rawValue);

        if (normalizedValue) {
            tags.push(`autofit_${fieldKey}_${normalizedValue}`);
        }
    }

    return Array.from(new Set(tags));
}

async function runTagsMutation(admin, mutation, ids, tags) {
    if (!ids.length || !tags.length) {
        return;
    }

    for (const id of ids) {
        const response = await admin.graphql(
            `#graphql
            mutation ManageProductTags($id: ID!, $tags: [String!]!) {
              ${mutation}(id: $id, tags: $tags) {
                node {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
                variables: {
                    id,
                    tags,
                },
            },
        );

        const json = await response.json();
        const userErrors = json?.data?.[mutation]?.userErrors || [];

        if (userErrors.length > 0) {
            throw new Error(userErrors[0].message || "Unable to update product tags");
        }
    }
}

export async function addTagsToProducts(admin, productIds, tags) {
    await runTagsMutation(admin, "tagsAdd", productIds, tags);
}

export async function removeTagsFromProducts(admin, productIds, tags) {
    await runTagsMutation(admin, "tagsRemove", productIds, tags);
}
