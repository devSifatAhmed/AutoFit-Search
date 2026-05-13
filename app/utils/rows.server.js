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

export function hasYearRangeOverlap(existingRange, nextRange) {
    return existingRange.startYear <= nextRange.endYear
        && existingRange.endYear >= nextRange.startYear;
}

function buildFilterSignature(selectValues, fieldMap) {
    return selectValues
        .map(({ fieldId, value }) => `${resolveFieldKey(fieldMap.get(fieldId))}:${normalizeSignatureValue(value)}`)
        .join("|");
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
            attachments: true,
        },
    });
}

function formatRangeLabel(startYear, endYear) {
    return startYear === endYear
        ? String(startYear)
        : `${startYear}-${endYear}`;
}

function mapRowToAdminShape(row, fieldDefinitions) {
    const columns = {};
    const rangeField = fieldDefinitions.find((field) => field.type === "RANGE");

    if (rangeField) {
        columns[rangeField.id] = formatRangeLabel(row.startYear, row.endYear);
    }

    for (const value of row.values) {
        columns[value.fieldId] = value.value;
    }

    return {
        id: row.id,
        columns,
        role: row.attachmentMode.toLowerCase(),
        attachmentMode: row.attachmentMode,
        attachments: row.attachments,
        startYear: row.startYear,
        endYear: row.endYear,
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
            attachments: true,
        },
    });

    if (!row) {
        throw new Error("Row not found");
    }

    return row;
}

function extractRangeValue(fieldEntry, rangeFieldId) {
    if (fieldEntry.fieldId !== rangeFieldId) {
        return null;
    }

    const startYear = Number(fieldEntry.minValue);
    const endYear = Number(fieldEntry.maxValue);

    if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
        throw new Error("Year range must use valid integer values");
    }

    if (startYear > endYear) {
        throw new Error("Year range start must be less than or equal to end");
    }

    return {
        startYear,
        endYear,
    };
}

function extractSelectValue(fieldEntry, fieldMeta) {
    if (fieldMeta.type !== "SELECT") {
        return null;
    }

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

    const rangeFields = fieldDefinitions.filter((field) => field.type === "RANGE");

    if (rangeFields.length !== 1) {
        throw new Error("Exactly one range field must exist before creating a row");
    }

    return {
        fieldDefinitions,
        rangeField: rangeFields[0],
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

function buildEditorPayload(parsedFields, fieldDefinitions, rangeField, fieldMap) {
    const submittedFieldIds = new Set(parsedFields.map((field) => field.fieldId));

    if (submittedFieldIds.size !== fieldDefinitions.length || fieldDefinitions.some((field) => !submittedFieldIds.has(field.id))) {
        throw new Error("Submitted fields do not match the current field configuration");
    }

    let rangeValue = null;
    const selectValues = [];

    for (const fieldEntry of parsedFields) {
        const fieldMeta = fieldMap.get(fieldEntry.fieldId);

        if (!fieldMeta) {
            throw new Error("Submitted field is no longer valid");
        }

        if (fieldMeta.type === "RANGE") {
            const extractedRange = extractRangeValue(fieldEntry, rangeField.id);

            if (!extractedRange) {
                throw new Error("A valid year range is required");
            }

            rangeValue = extractedRange;
            continue;
        }

        const selectValue = extractSelectValue(fieldEntry, fieldMeta);

        if (selectValue) {
            selectValues.push(selectValue);
        }
    }

    if (!rangeValue) {
        throw new Error("A valid year range is required");
    }

    if (rangeValue.startYear < rangeField.rangeStart || rangeValue.endYear > rangeField.rangeEnd) {
        throw new Error(`Year range must stay within ${rangeField.rangeStart}-${rangeField.rangeEnd}`);
    }

    const normalizedSelectValues = fieldDefinitions
        .filter((field) => field.type === "SELECT")
        .map((field) => {
            const selectValue = selectValues.find((item) => item.fieldId === field.id);

            if (!selectValue) {
                throw new Error(`${field.label} is required`);
            }

            return selectValue;
        });

    return {
        rangeValue,
        normalizedSelectValues,
    };
}

function buildEditFieldData(fieldDefinitions, row) {
    const rowValueMap = new Map(row.values.map((value) => [value.fieldId, value.value]));

    return fieldDefinitions.map((field) => {
        if (field.type === "RANGE") {
            return {
                fieldId: field.id,
                minValue: row.startYear,
                maxValue: row.endYear,
            };
        }

        return {
            fieldId: field.id,
            value: rowValueMap.get(field.id) || "",
        };
    });
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

export async function createRow({ admin, data }) {
    const { fields, attachments, type, shopId } = data;
    const parsedFields = parseJsonArray(fields, "fields");
    const parsedAttachments = parseJsonArray(attachments, "attachments");

    if (!shopId) {
        throw new Error("Shop id is required");
    }

    const { fieldDefinitions, fieldMap, rangeField } = await getFieldContext(shopId);
    const { rangeValue, normalizedSelectValues } = buildEditorPayload(parsedFields, fieldDefinitions, rangeField, fieldMap);
    const validatedAttachments = validateAttachments(type, parsedAttachments);
    const filterSignature = buildFilterSignature(normalizedSelectValues, fieldMap);

    const overlappingRow = await prisma.searchRow.findFirst({
        where: {
            shopId,
            filterSignature,
            startYear: { lte: rangeValue.endYear },
            endYear: { gte: rangeValue.startYear },
        },
        select: {
            id: true,
        },
    });

    if (overlappingRow) {
        throw new Error("An overlapping year range already exists for this filter combination");
    }

    const productTags = type === "PRODUCT"
        ? buildProductTags({
            fields: fieldDefinitions,
            row: {
                startYear: rangeValue.startYear,
                endYear: rangeValue.endYear,
                values: normalizedSelectValues,
            },
        })
        : [];

    const createdRow = await prisma.$transaction(async (tx) => {
        const row = await tx.searchRow.create({
            data: {
                shopId,
                startYear: rangeValue.startYear,
                endYear: rangeValue.endYear,
                attachmentMode: type,
                filterSignature,
                productTags,
                values: {
                    create: normalizedSelectValues,
                },
                attachments: {
                    create: validatedAttachments,
                },
            },
            include: {
                values: true,
                attachments: true,
            },
        });

        return row;
    });

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
            attachments: true,
        },
    });

    if (!previousRow) {
        throw new Error("Row not found");
    }

    const { fieldDefinitions, fieldMap, rangeField } = await getFieldContext(shopId);
    const { rangeValue, normalizedSelectValues } = buildEditorPayload(parsedFields, fieldDefinitions, rangeField, fieldMap);
    const validatedAttachments = validateAttachments(type, parsedAttachments);
    const filterSignature = buildFilterSignature(normalizedSelectValues, fieldMap);

    const overlappingRow = await prisma.searchRow.findFirst({
        where: {
            shopId,
            id: {
                not: rowId,
            },
            filterSignature,
            startYear: { lte: rangeValue.endYear },
            endYear: { gte: rangeValue.startYear },
        },
        select: {
            id: true,
        },
    });

    if (overlappingRow) {
        throw new Error("An overlapping year range already exists for this filter combination");
    }

    const productTags = type === "PRODUCT"
        ? buildProductTags({
            fields: fieldDefinitions,
            row: {
                startYear: rangeValue.startYear,
                endYear: rangeValue.endYear,
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

        await tx.rowAttachment.deleteMany({
            where: {
                rowId,
            },
        });

        const row = await tx.searchRow.update({
            where: {
                id: rowId,
            },
            data: {
                startYear: rangeValue.startYear,
                endYear: rangeValue.endYear,
                attachmentMode: type,
                filterSignature,
                productTags,
                values: {
                    create: normalizedSelectValues,
                },
                attachments: {
                    create: validatedAttachments,
                },
            },
            include: {
                values: true,
                attachments: true,
            },
        });

        return row;
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
