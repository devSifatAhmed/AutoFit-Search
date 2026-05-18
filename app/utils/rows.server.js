import prisma from "../db.server.js";
import { addTagsToProducts, buildProductTags, removeTagsFromProducts } from "./productTags.server.js";

function parseJsonArray(value, fieldName) {
    try {
        const parsedValue = JSON.parse(value || "[]");

        if (!Array.isArray(parsedValue)) {
            throw new Error();
        }

        return parsedValue;
    } catch {
        throw new Error(`Invalid ${fieldName} payload`);
    }
}

function normalizeTextValue(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSignatureValue(value) {
    return normalizeTextValue(value).toLowerCase();
}

function resolveFieldKey(field) {
    return field?.key || field?.label?.trim()?.toLowerCase()?.replace(/[^a-z0-9]+/g, "_")?.replace(/^_+|_+$/g, "") || field?.id;
}

function getSelectFields(fieldDefinitions) {
    return fieldDefinitions.filter((field) => field.type === "SELECT");
}

function getRangeFields(fieldDefinitions) {
    return fieldDefinitions.filter((field) => field.type === "RANGE");
}

function rangeValueFromRowValue(rowRangeValue) {
    return {
        fieldId: rowRangeValue.fieldId,
        minValue: Number(rowRangeValue.minValue),
        maxValue: Number(rowRangeValue.maxValue),
    };
}

function getRangeValueMap(row, rangeFields = []) {
    const rangeValueMap = new Map(
        (row.rangeValues || []).map((rangeValue) => [
            rangeValue.fieldId,
            rangeValueFromRowValue(rangeValue),
        ]),
    );

    if (rangeValueMap.size === 0 && row.startYear !== null && row.startYear !== undefined && row.endYear !== null && row.endYear !== undefined && rangeFields.length > 0) {
        rangeValueMap.set(rangeFields[0].id, {
            fieldId: rangeFields[0].id,
            minValue: Number(row.startYear),
            maxValue: Number(row.endYear),
        });
    }

    return rangeValueMap;
}

function getOrderedRangeValues(row, rangeFields = []) {
    const rangeValueMap = getRangeValueMap(row, rangeFields);

    return rangeFields
        .map((field) => rangeValueMap.get(field.id))
        .filter(Boolean);
}

export function rangesOverlap(existingRange, nextRange) {
    return Number(existingRange.minValue) <= Number(nextRange.maxValue)
        && Number(existingRange.maxValue) >= Number(nextRange.minValue);
}

export function hasYearRangeOverlap(existingRange, nextRange) {
    return rangesOverlap(
        {
            minValue: existingRange.startYear,
            maxValue: existingRange.endYear,
        },
        {
            minValue: nextRange.startYear,
            maxValue: nextRange.endYear,
        },
    );
}

export function rangeSetsOverlap(existingRangeValues, nextRangeValues, rangeFields) {
    const existingRangeMap = new Map(existingRangeValues.map((rangeValue) => [rangeValue.fieldId, rangeValue]));
    const nextRangeMap = new Map(nextRangeValues.map((rangeValue) => [rangeValue.fieldId, rangeValue]));

    return rangeFields.every((field) => {
        const existingRange = existingRangeMap.get(field.id);
        const nextRange = nextRangeMap.get(field.id);

        if (!existingRange || !nextRange) {
            return false;
        }

        return rangesOverlap(existingRange, nextRange);
    });
}

export function buildFilterSignature(selectValues, fieldMap) {
    return selectValues
        .map(({ fieldId, value }) => `${resolveFieldKey(fieldMap.get(fieldId))}:${normalizeSignatureValue(value)}`)
        .join("|");
}

export async function rebuildRowFilterSignatures(shopId, client = prisma) {
    const fields = await client.field.findMany({
        where: {
            shopId,
            type: "SELECT",
        },
        orderBy: [
            { position: "asc" },
        ],
    });
    const fieldMap = new Map(fields.map((field) => [field.id, field]));
    const rows = await client.searchRow.findMany({
        where: {
            shopId,
        },
        include: {
            values: true,
        },
    });

    let updatedCount = 0;

    for (const row of rows) {
        const valueMap = new Map(row.values.map((value) => [value.fieldId, value.value]));
        const orderedSelectValues = fields
            .map((field) => {
                const value = valueMap.get(field.id);

                if (!value) {
                    return null;
                }

                return {
                    fieldId: field.id,
                    value,
                };
            })
            .filter(Boolean);
        const nextSignature = buildFilterSignature(orderedSelectValues, fieldMap);

        if (row.filterSignature === nextSignature) {
            continue;
        }

        await client.searchRow.update({
            where: {
                id: row.id,
            },
            data: {
                filterSignature: nextSignature,
            },
        });
        updatedCount += 1;
    }

    return updatedCount;
}

async function listRows(shopId) {
    return prisma.searchRow.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { createdAt: "asc" },
        ],
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
    });
}

function formatRangeLabel(minValue, maxValue) {
    return Number(minValue) === Number(maxValue)
        ? String(minValue)
        : `${minValue}-${maxValue}`;
}

function mapRowToAdminShape(row, fieldDefinitions) {
    const columns = {};
    const rangeFields = getRangeFields(fieldDefinitions);
    const rangeValueMap = getRangeValueMap(row, rangeFields);

    for (const field of rangeFields) {
        const rangeValue = rangeValueMap.get(field.id);

        if (rangeValue) {
            columns[field.id] = formatRangeLabel(rangeValue.minValue, rangeValue.maxValue);
        }
    }

    for (const value of row.values) {
        columns[value.fieldId] = value.value;
    }

    const firstRangeValue = getOrderedRangeValues(row, rangeFields)[0] || null;

    return {
        id: row.id,
        columns,
        role: row.attachmentMode.toLowerCase(),
        attachmentMode: row.attachmentMode,
        attachments: row.attachments,
        startYear: firstRangeValue?.minValue ?? row.startYear,
        endYear: firstRangeValue?.maxValue ?? row.endYear,
        rangeValues: getOrderedRangeValues(row, rangeFields),
        filterSignature: row.filterSignature,
        tag: row.tag,
        productTags: row.productTags,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function getRows({ shopId }) {
    const [fieldDefinitions, rows] = await Promise.all([
        prisma.field.findMany({
            where: {
                shopId,
            },
            orderBy: [
                { position: "asc" },
            ],
        }),
        listRows(shopId),
    ]);

    return rows.map((row) => mapRowToAdminShape(row, fieldDefinitions));
}

export async function getRowById({ shopId, rowId }) {
    const row = await prisma.searchRow.findFirst({
        where: {
            id: rowId,
            shopId,
        },
        include: {
            values: true,
            rangeValues: true,
            attachments: true,
        },
    });

    if (!row) {
        throw new Error("Row not found");
    }

    return row;
}

function extractRangeValue(fieldEntry, fieldMeta) {
    const minValue = Number(fieldEntry.minValue);
    const maxValue = Number(fieldEntry.maxValue);

    if (!Number.isInteger(minValue) || !Number.isInteger(maxValue)) {
        throw new Error(`${fieldMeta.label} range must use valid integer values`);
    }

    if (minValue > maxValue) {
        throw new Error(`${fieldMeta.label} range start must be less than or equal to end`);
    }

    if (minValue < fieldMeta.rangeStart || maxValue > fieldMeta.rangeEnd) {
        throw new Error(`${fieldMeta.label} range must stay within ${fieldMeta.rangeStart}-${fieldMeta.rangeEnd}`);
    }

    return {
        fieldId: fieldMeta.id,
        minValue,
        maxValue,
    };
}

function extractSelectValue(fieldEntry, fieldMeta) {
    const value = normalizeTextValue(fieldEntry.value);

    if (!value) {
        throw new Error(`${fieldMeta.label} is required`);
    }

    return {
        fieldId: fieldMeta.id,
        value,
    };
}

function validateAttachments(attachmentMode, attachments) {
    if (!["PRODUCT", "COLLECTION"].includes(attachmentMode)) {
        throw new Error("Invalid attachment mode");
    }

    if (attachmentMode === "PRODUCT" && attachments.length === 0) {
        throw new Error("At least one product must be selected");
    }

    if (attachmentMode === "COLLECTION" && attachments.length !== 1) {
        throw new Error("Exactly one collection must be selected");
    }

    const uniqueIds = new Set();

    return attachments.map((attachment) => {
        const shopifyGid = String(attachment?.id || "").trim();

        if (!shopifyGid) {
            throw new Error("Attachment id is required");
        }

        if (uniqueIds.has(shopifyGid)) {
            return null;
        }

        uniqueIds.add(shopifyGid);

        return {
            shopifyGid,
        };
    }).filter(Boolean);
}

async function getFieldContext(shopId) {
    const fieldDefinitions = await prisma.field.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { position: "asc" },
        ],
    });

    if (fieldDefinitions.length === 0) {
        throw new Error("Create fields before adding search entries");
    }

    const rangeFields = getRangeFields(fieldDefinitions);

    if (rangeFields.length === 0) {
        throw new Error("At least one range field must exist before creating a row");
    }

    return {
        fieldDefinitions,
        selectFields: getSelectFields(fieldDefinitions),
        rangeFields,
        fieldMap: new Map(fieldDefinitions.map((field) => [field.id, field])),
    };
}

async function rebuildFilterSuggestions(shopId) {
    const rowValues = await prisma.rowValue.findMany({
        where: {
            row: {
                shopId,
            },
        },
        include: {
            field: true,
        },
    });

    const uniqueSuggestions = Array.from(new Map(
        rowValues.map((rowValue) => [
            `${rowValue.fieldId}::${rowValue.value}`,
            {
                shopId,
                fieldId: rowValue.fieldId,
                value: rowValue.value,
            },
        ]),
    ).values());

    await prisma.$transaction(async (tx) => {
        await tx.filterSuggestion.deleteMany({
            where: {
                shopId,
            },
        });

        if (uniqueSuggestions.length > 0) {
            await tx.filterSuggestion.createMany({
                data: uniqueSuggestions,
            });
        }
    });
}

function buildEditorPayload(parsedFields, fieldDefinitions, selectFields, rangeFields, fieldMap) {
    const submittedFieldIds = new Set(parsedFields.map((field) => field.fieldId));

    if (
        parsedFields.length !== fieldDefinitions.length
        || submittedFieldIds.size !== fieldDefinitions.length
        || fieldDefinitions.some((field) => !submittedFieldIds.has(field.id))
    ) {
        throw new Error("Submitted fields do not match the current field configuration");
    }

    const selectValues = [];
    const rangeValues = [];

    for (const fieldEntry of parsedFields) {
        const fieldMeta = fieldMap.get(fieldEntry.fieldId);

        if (!fieldMeta) {
            throw new Error("Submitted field is no longer valid");
        }

        if (fieldMeta.type === "RANGE") {
            rangeValues.push(extractRangeValue(fieldEntry, fieldMeta));
            continue;
        }

        selectValues.push(extractSelectValue(fieldEntry, fieldMeta));
    }

    const normalizedSelectValues = selectFields.map((field) => {
        const selectValue = selectValues.find((item) => item.fieldId === field.id);

        if (!selectValue) {
            throw new Error(`${field.label} is required`);
        }

        return selectValue;
    });

    const normalizedRangeValues = rangeFields.map((field) => {
        const rangeValue = rangeValues.find((item) => item.fieldId === field.id);

        if (!rangeValue) {
            throw new Error(`${field.label} range is required`);
        }

        return rangeValue;
    });

    return {
        normalizedRangeValues,
        normalizedSelectValues,
    };
}

function buildEditFieldData(fieldDefinitions, row) {
    const rowValueMap = new Map(row.values.map((value) => [value.fieldId, value.value]));
    const rangeFields = getRangeFields(fieldDefinitions);
    const rowRangeValueMap = getRangeValueMap(row, rangeFields);

    return fieldDefinitions.map((field) => {
        if (field.type === "RANGE") {
            const rangeValue = rowRangeValueMap.get(field.id);

            return {
                fieldId: field.id,
                minValue: rangeValue?.minValue ?? "",
                maxValue: rangeValue?.maxValue ?? "",
            };
        }

        return {
            fieldId: field.id,
            value: rowValueMap.get(field.id) || "",
        };
    });
}

async function findOverlappingRow({
    shopId,
    filterSignature,
    rangeFields,
    rangeValues,
    excludeRowId = null,
}) {
    const candidateRows = await prisma.searchRow.findMany({
        where: {
            shopId,
            filterSignature,
            ...(excludeRowId ? { id: { not: excludeRowId } } : {}),
        },
        include: {
            rangeValues: true,
        },
    });

    return candidateRows.find((row) => rangeSetsOverlap(
        getOrderedRangeValues(row, rangeFields),
        rangeValues,
        rangeFields,
    ));
}

async function syncProductTagsForCreateOrUpdate({
    admin,
    previousRow,
    nextRow,
    fields,
}) {
    if (!admin) {
        return;
    }

    if (previousRow?.attachmentMode === "PRODUCT" && previousRow.attachments.length > 0 && previousRow.productTags.length > 0) {
        await removeTagsFromProducts(
            admin,
            previousRow.attachments.map((attachment) => attachment.shopifyGid),
            previousRow.productTags,
        );
    }

    if (nextRow.attachmentMode !== "PRODUCT") {
        return;
    }

    const nextTags = buildProductTags({
        fields,
        row: nextRow,
    });

    if (nextTags.length > 0) {
        await addTagsToProducts(
            admin,
            nextRow.attachments.map((attachment) => attachment.shopifyGid),
            nextTags,
        );
    }
}

export async function rebuildProductTagsForShop({ admin = null, shopId }) {
    const fields = await prisma.field.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { position: "asc" },
        ],
    });
    const rows = await prisma.searchRow.findMany({
        where: {
            shopId,
            attachmentMode: "PRODUCT",
        },
        include: {
            values: true,
            rangeValues: true,
            attachments: true,
        },
    });

    let updatedCount = 0;

    for (const row of rows) {
        const nextTags = buildProductTags({ fields, row });

        if (admin && row.attachments.length > 0 && row.productTags.length > 0) {
            await removeTagsFromProducts(
                admin,
                row.attachments.map((attachment) => attachment.shopifyGid),
                row.productTags,
            );
        }

        if (admin && row.attachments.length > 0 && nextTags.length > 0) {
            await addTagsToProducts(
                admin,
                row.attachments.map((attachment) => attachment.shopifyGid),
                nextTags,
            );
        }

        await prisma.searchRow.update({
            where: {
                id: row.id,
            },
            data: {
                productTags: nextTags,
            },
        });
        updatedCount += 1;
    }

    return updatedCount;
}

export async function createRow({ admin, data }) {
    const { fields, attachments, type, shopId } = data;
    const parsedFields = parseJsonArray(fields, "fields");
    const parsedAttachments = parseJsonArray(attachments, "attachments");

    if (!shopId) {
        throw new Error("Shop id is required");
    }

    const { fieldDefinitions, selectFields, rangeFields, fieldMap } = await getFieldContext(shopId);
    const { normalizedRangeValues, normalizedSelectValues } = buildEditorPayload(
        parsedFields,
        fieldDefinitions,
        selectFields,
        rangeFields,
        fieldMap,
    );
    const validatedAttachments = validateAttachments(type, parsedAttachments);
    const filterSignature = buildFilterSignature(normalizedSelectValues, fieldMap);

    const overlappingRow = await findOverlappingRow({
        shopId,
        filterSignature,
        rangeFields,
        rangeValues: normalizedRangeValues,
    });

    if (overlappingRow) {
        throw new Error("An overlapping range already exists for this filter combination");
    }

    const legacyRangeMirror = normalizedRangeValues[0];
    const productTags = type === "PRODUCT"
        ? buildProductTags({
            fields: fieldDefinitions,
            row: {
                rangeValues: normalizedRangeValues,
                values: normalizedSelectValues,
            },
        })
        : [];

    const createdRow = await prisma.$transaction(async (tx) => tx.searchRow.create({
        data: {
            shopId,
            startYear: legacyRangeMirror?.minValue ?? null,
            endYear: legacyRangeMirror?.maxValue ?? null,
            attachmentMode: type,
            filterSignature,
            productTags,
            values: {
                create: normalizedSelectValues,
            },
            rangeValues: {
                create: normalizedRangeValues,
            },
            attachments: {
                create: validatedAttachments,
            },
        },
        include: {
            values: true,
            rangeValues: true,
            attachments: true,
        },
    }));

    await rebuildFilterSuggestions(shopId);

    await syncProductTagsForCreateOrUpdate({
        admin,
        nextRow: createdRow,
        fields: fieldDefinitions,
    });

    return {
        success: true,
        row: createdRow,
    };
}

export async function updateRow({ admin, data }) {
    const { rowId, fields, attachments, type, shopId } = data;
    const parsedFields = parseJsonArray(fields, "fields");
    const parsedAttachments = parseJsonArray(attachments, "attachments");

    if (!rowId) {
        throw new Error("Row id is required");
    }

    const previousRow = await prisma.searchRow.findFirst({
        where: {
            id: rowId,
            shopId,
        },
        include: {
            values: true,
            rangeValues: true,
            attachments: true,
        },
    });

    if (!previousRow) {
        throw new Error("Row not found");
    }

    const { fieldDefinitions, selectFields, rangeFields, fieldMap } = await getFieldContext(shopId);
    const { normalizedRangeValues, normalizedSelectValues } = buildEditorPayload(
        parsedFields,
        fieldDefinitions,
        selectFields,
        rangeFields,
        fieldMap,
    );
    const validatedAttachments = validateAttachments(type, parsedAttachments);
    const filterSignature = buildFilterSignature(normalizedSelectValues, fieldMap);

    const overlappingRow = await findOverlappingRow({
        shopId,
        filterSignature,
        rangeFields,
        rangeValues: normalizedRangeValues,
        excludeRowId: rowId,
    });

    if (overlappingRow) {
        throw new Error("An overlapping range already exists for this filter combination");
    }

    const legacyRangeMirror = normalizedRangeValues[0];
    const productTags = type === "PRODUCT"
        ? buildProductTags({
            fields: fieldDefinitions,
            row: {
                rangeValues: normalizedRangeValues,
                values: normalizedSelectValues,
            },
        })
        : [];

    const updatedRow = await prisma.$transaction(async (tx) => {
        await tx.rowValue.deleteMany({
            where: {
                rowId,
            },
        });

        await tx.rowRangeValue.deleteMany({
            where: {
                rowId,
            },
        });

        await tx.rowAttachment.deleteMany({
            where: {
                rowId,
            },
        });

        return tx.searchRow.update({
            where: {
                id: rowId,
            },
            data: {
                startYear: legacyRangeMirror?.minValue ?? null,
                endYear: legacyRangeMirror?.maxValue ?? null,
                attachmentMode: type,
                filterSignature,
                productTags,
                values: {
                    create: normalizedSelectValues,
                },
                rangeValues: {
                    create: normalizedRangeValues,
                },
                attachments: {
                    create: validatedAttachments,
                },
            },
            include: {
                values: true,
                rangeValues: true,
                attachments: true,
            },
        });
    });

    await rebuildFilterSuggestions(shopId);

    await syncProductTagsForCreateOrUpdate({
        admin,
        previousRow,
        nextRow: updatedRow,
        fields: fieldDefinitions,
    });

    return {
        success: true,
        row: updatedRow,
    };
}

export async function deleteRow({ admin, shopId, rowId }) {
    const row = await prisma.searchRow.findFirst({
        where: {
            id: rowId,
            shopId,
        },
        include: {
            attachments: true,
        },
    });

    if (!row) {
        throw new Error("Row not found");
    }

    if (admin && row.attachmentMode === "PRODUCT" && row.attachments.length > 0 && row.productTags.length > 0) {
        await removeTagsFromProducts(
            admin,
            row.attachments.map((attachment) => attachment.shopifyGid),
            row.productTags,
        );
    }

    await prisma.searchRow.delete({
        where: {
            id: rowId,
        },
    });

    await rebuildFilterSuggestions(shopId);

    return {
        success: true,
    };
}

export async function getRowEditorData({ shopId, rowId }) {
    const [fieldDefinitions, row] = await Promise.all([
        prisma.field.findMany({
            where: { shopId },
            orderBy: [{ position: "asc" }],
            include: {
                suggestions: true,
            },
        }),
        getRowById({ shopId, rowId }),
    ]);

    return {
        row,
        fieldData: buildEditFieldData(fieldDefinitions, row),
        attachmentMode: row.attachmentMode,
        attachments: row.attachments.map((attachment) => ({
            id: attachment.shopifyGid,
        })),
    };
}

export async function hydrateEditorAttachments(admin, attachmentMode, attachments) {
    if (!attachments.length) {
        return [];
    }

    const response = await admin.graphql(
        `#graphql
        query AttachmentNodes($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage {
                url
              }
            }
            ... on Collection {
              id
              title
              image {
                url
              }
            }
          }
        }`,
        {
            variables: {
                ids: attachments.map((attachment) => attachment.id),
            },
        },
    );

    const json = await response.json();
    const nodes = json?.data?.nodes || [];

    return nodes
        .filter(Boolean)
        .map((node) => ({
            id: node.id,
            title: node.title,
            image: attachmentMode === "PRODUCT" ? node.featuredImage?.url || null : node.image?.url || null,
        }));
}
