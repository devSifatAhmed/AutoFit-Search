function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

export function buildProductTags({ fields, row }) {
    const tags = [];
    const valueMap = new Map(row.values.map((value) => [value.fieldId, value.value]));

    for (const field of fields) {
        const fieldKey = field.key || slugify(field.label) || field.id;

        if (field.type === "RANGE") {
            for (let year = row.startYear; year <= row.endYear; year += 1) {
                tags.push(`autofit_${fieldKey}_${year}`);
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
