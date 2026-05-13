import prisma from "../db.server.js";
import { getCurrentAppInstallation } from "./currentAppInstallation.server.js";

const METAFIELD_NAMESPACE = "autofit_search";
const PRIMARY_METAFIELD_KEY = "fields";
const SUGGESTIONS_METAFIELD_KEY = "suggestions";

function resolveFieldKey(field) {
    return field.key || String(field.label || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_") || field.id;
}

function mapField(field) {
    return {
        id: field.id,
        key: resolveFieldKey(field),
        type: field.type,
        label: field.label,
        placeholder: field.placeholder,
        visibility: field.visibility,
        sortOrder: field.sortOrder,
        position: field.position,
        rangeStart: field.rangeStart,
        rangeEnd: field.rangeEnd,
    };
}

function mapRow(row) {
    return {
        id: row.id,
        attachmentMode: row.attachmentMode,
        startYear: row.startYear,
        endYear: row.endYear,
        filterSignature: row.filterSignature,
        values: row.values.map((value) => ({
            fieldId: value.fieldId,
            key: resolveFieldKey(value.field),
            value: value.value,
        })),
        attachments: row.attachments.map((attachment) => ({
            id: attachment.shopifyGid,
        })),
    };
}

function mapSuggestion(suggestion) {
    return {
        id: suggestion.id,
        fieldId: suggestion.fieldId,
        key: resolveFieldKey(suggestion.field),
        value: suggestion.value,
    };
}

export async function buildStorefrontConfig(shopId) {
    const [fields, rows, suggestions] = await Promise.all([
        prisma.field.findMany({
            where: { shopId },
            orderBy: [{ position: "asc" }],
        }),
        prisma.searchRow.findMany({
            where: { shopId },
            orderBy: [{ createdAt: "asc" }],
            include: {
                values: {
                    include: {
                        field: true,
                    },
                },
                attachments: true,
            },
        }),
        prisma.filterSuggestion.findMany({
            where: { shopId },
            orderBy: [{ value: "asc" }],
            include: {
                field: true,
            },
        }),
    ]);

    return {
        fields: fields.map(mapField),
        rows: rows.map(mapRow),
        suggestions: suggestions.map(mapSuggestion),
        updatedAt: new Date().toISOString(),
    };
}

export async function syncStorefrontConfig(admin, shopId) {
    const ownerId = await getCurrentAppInstallation(admin);
    const storefrontConfig = await buildStorefrontConfig(shopId);
    const serializedConfig = JSON.stringify(storefrontConfig);
    const serializedSuggestions = JSON.stringify(storefrontConfig.suggestions);

    const response = await admin.graphql(
        `#graphql
        mutation SetAppMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              namespace
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
            variables: {
                metafields: [
                    {
                        ownerId,
                        namespace: METAFIELD_NAMESPACE,
                        key: PRIMARY_METAFIELD_KEY,
                        type: "json",
                        value: serializedConfig,
                    },
                    {
                        ownerId,
                        namespace: METAFIELD_NAMESPACE,
                        key: SUGGESTIONS_METAFIELD_KEY,
                        type: "json",
                        value: serializedSuggestions,
                    },
                ],
            },
        },
    );

    const json = await response.json();
    const userErrors = json?.data?.metafieldsSet?.userErrors || [];

    if (userErrors.length > 0) {
        throw new Error(userErrors[0].message || "Unable to sync storefront config");
    }

    return storefrontConfig;
}
