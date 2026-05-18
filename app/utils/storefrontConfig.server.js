import prisma from "../db.server.js";
import { getCurrentAppInstallation } from "./currentAppInstallation.server.js";

const METAFIELD_NAMESPACE = "autofit_search";
const FIELDS_METAFIELD_KEY = "fields";
const ROWS_METAFIELD_KEY = "rows";
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

function getRangeValues(row, fields) {
    if (row.rangeValues?.length > 0) {
        return row.rangeValues.map((rangeValue) => ({
            fieldId: rangeValue.fieldId,
            key: resolveFieldKey(rangeValue.field),
            minValue: rangeValue.minValue,
            maxValue: rangeValue.maxValue,
        }));
    }

    const legacyRangeField = fields.find((field) => field.type === "RANGE");

    if (!legacyRangeField || row.startYear === null || row.startYear === undefined || row.endYear === null || row.endYear === undefined) {
        return [];
    }

    return [
        {
            fieldId: legacyRangeField.id,
            key: resolveFieldKey(legacyRangeField),
            minValue: row.startYear,
            maxValue: row.endYear,
        },
    ];
}

function mapRow(row, fields) {
    const rangeValues = getRangeValues(row, fields);
    const firstRangeValue = rangeValues[0] || null;

    return {
        id: row.id,
        attachmentMode: row.attachmentMode,
        startYear: firstRangeValue?.minValue ?? row.startYear,
        endYear: firstRangeValue?.maxValue ?? row.endYear,
        filterSignature: row.filterSignature,
        values: row.values.map((value) => ({
            fieldId: value.fieldId,
            key: resolveFieldKey(value.field),
            value: value.value,
        })),
        rangeValues,
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

function getCollectionAttachmentIds(storefrontConfig) {
    return Array.from(new Set(
        (storefrontConfig?.rows || [])
            .filter((row) => row.attachmentMode === "COLLECTION")
            .flatMap((row) => row.attachments || [])
            .map((attachment) => attachment.id)
            .filter(Boolean),
    ));
}

async function fetchCollectionAttachmentHandles(admin, collectionIds) {
    if (!admin || collectionIds.length === 0) {
        return new Map();
    }

    const response = await admin.graphql(
        `#graphql
        query CollectionAttachmentHandles($ids: [ID!]!) {
          nodes(ids: $ids) {
            id
            ... on Collection {
              handle
              title
            }
          }
        }`,
        {
            variables: {
                ids: collectionIds,
            },
        },
    );

    const json = await response.json();
    const errors = json?.errors || [];

    if (errors.length > 0) {
        throw new Error(errors[0].message || "Unable to load collection handles");
    }

    return new Map(
        (json?.data?.nodes || [])
            .filter((node) => node?.id && node?.handle)
            .map((node) => [
                node.id,
                {
                    handle: node.handle,
                    title: node.title || null,
                },
            ]),
    );
}

export async function hydrateCollectionAttachmentHandles(admin, storefrontConfig) {
    const collectionIds = getCollectionAttachmentIds(storefrontConfig);
    const collectionsById = await fetchCollectionAttachmentHandles(admin, collectionIds);

    if (collectionsById.size === 0) {
        return storefrontConfig;
    }

    return {
        ...storefrontConfig,
        rows: storefrontConfig.rows.map((row) => {
            if (row.attachmentMode !== "COLLECTION") {
                return row;
            }

            return {
                ...row,
                attachments: row.attachments.map((attachment) => {
                    const collection = collectionsById.get(attachment.id);

                    if (!collection) {
                        return attachment;
                    }

                    return {
                        ...attachment,
                        handle: collection.handle,
                        title: collection.title,
                    };
                }),
            };
        }),
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
                rangeValues: {
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
        rows: rows.map((row) => mapRow(row, fields)),
        suggestions: suggestions.map(mapSuggestion),
        updatedAt: new Date().toISOString(),
    };
}

export function buildStorefrontMetafields(ownerId, storefrontConfig) {
    return [
        {
            ownerId,
            namespace: METAFIELD_NAMESPACE,
            key: FIELDS_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(storefrontConfig.fields),
        },
        {
            ownerId,
            namespace: METAFIELD_NAMESPACE,
            key: ROWS_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(storefrontConfig.rows),
        },
        {
            ownerId,
            namespace: METAFIELD_NAMESPACE,
            key: SUGGESTIONS_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(storefrontConfig.suggestions),
        },
    ];
}

export async function syncStorefrontConfig(admin, shopId) {
    const ownerId = await getCurrentAppInstallation(admin);
    const storefrontConfig = await hydrateCollectionAttachmentHandles(
        admin,
        await buildStorefrontConfig(shopId),
    );

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
                metafields: buildStorefrontMetafields(ownerId, storefrontConfig),
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
