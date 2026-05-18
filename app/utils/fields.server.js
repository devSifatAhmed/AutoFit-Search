import prisma from "../db.server.js";
import { rebuildProductTagsForShop, rebuildRowFilterSignatures } from "./rows.server.js";
import { validateShop } from "./validate_shop.server.js";

const DEFAULT_RANGE_FIELD_LIMIT = 1;

function slugifyKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_") || "field";
}

function normalizeField(field) {
    const type = field?.type || "SELECT";
    const normalizedLabel = String(field?.label || "Field").trim() || "Field";
    const normalizedRangeStart = type === "RANGE" ? Number(field?.rangeStart ?? 1970) : null;
    const normalizedRangeEnd = type === "RANGE" ? Number(field?.rangeEnd ?? 2026) : null;

    return {
        type,
        label: normalizedLabel,
        placeholder: field?.placeholder || null,
        visibility: field?.visibility || field?.labelVisibility || "VISIBLE",
        sortOrder: field?.sortOrder || field?.sortby || "A_Z",
        rangeStart: normalizedRangeStart,
        rangeEnd: normalizedRangeEnd,
    };
}

export function getRangeFieldLimit() {
    const configuredLimit = Number(process.env.AUTO_FIT_RANGE_FIELD_LIMIT || DEFAULT_RANGE_FIELD_LIMIT);

    return Number.isInteger(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_RANGE_FIELD_LIMIT;
}

async function validateFieldInput({
    shopId,
    field,
    existingFieldId = null,
    rangeFieldLimit = getRangeFieldLimit(),
}) {
    const normalizedField = normalizeField(field);
    const fieldKey = field?.key || slugifyKey(normalizedField.label);

    if (!normalizedField.label) {
        throw new Error("Field label is required");
    }

    const existingKeyField = await prisma.field.findFirst({
        where: {
            shopId,
            key: fieldKey,
            ...(existingFieldId ? { id: { not: existingFieldId } } : {}),
        },
        select: {
            id: true,
        },
    });

    if (existingKeyField) {
        throw new Error("Field key already exists for this shop");
    }

    if (normalizedField.type === "RANGE") {
        if (!Number.isInteger(normalizedField.rangeStart) || !Number.isInteger(normalizedField.rangeEnd)) {
            throw new Error("Range fields must use valid integer bounds");
        }

        if (normalizedField.rangeStart > normalizedField.rangeEnd) {
            throw new Error("Range start must be less than or equal to range end");
        }

        const currentRangeCount = await prisma.field.count({
            where: {
                shopId,
                type: "RANGE",
                ...(existingFieldId ? { id: { not: existingFieldId } } : {}),
            },
        });

        if (currentRangeCount >= rangeFieldLimit) {
            throw new Error(rangeFieldLimit <= 1
                ? "Range fields are available with a premium subscription"
                : `Range field limit reached for this shop (${rangeFieldLimit})`);
        }
    }

    if (existingFieldId && normalizedField.type === "RANGE") {
        const outOfBoundsRangeValue = await prisma.rowRangeValue.findFirst({
            where: {
                fieldId: existingFieldId,
                OR: [
                    { minValue: { lt: normalizedField.rangeStart } },
                    { maxValue: { gt: normalizedField.rangeEnd } },
                ],
            },
            select: {
                id: true,
            },
        });

        if (outOfBoundsRangeValue) {
            throw new Error("Range bounds cannot exclude existing search entry values");
        }
    }

    return {
        ...normalizedField,
        key: fieldKey,
    };
}

async function listFields({ shopId, suggestions }) {
    return prisma.field.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { position: "asc" },
        ],
        include: {
            suggestions: suggestions ? true : false,
        },
    });
}

async function normalizeFieldPositions(shopId) {
    const fields = await listFields({ shopId });

    await prisma.$transaction(async (tx) => {
        for (const [index, field] of fields.entries()) {
            await tx.field.update({
                where: {
                    id: field.id,
                },
                data: {
                    position: index + fields.length + 1000,
                },
            });
        }

        for (const [index, field] of fields.entries()) {
            await tx.field.update({
                where: {
                    id: field.id,
                },
                data: {
                    position: index,
                },
            });
        }
    });

    return listFields({ shopId });
}

async function backfillRangeValuesForField({ field, client = prisma }) {
    if (field.type !== "RANGE") {
        return 0;
    }

    const rows = await client.searchRow.findMany({
        where: {
            shopId: field.shopId,
        },
        select: {
            id: true,
        },
    });

    if (rows.length === 0) {
        return 0;
    }

    await client.rowRangeValue.createMany({
        data: rows.map((row) => ({
            rowId: row.id,
            fieldId: field.id,
            minValue: field.rangeStart,
            maxValue: field.rangeEnd,
        })),
        skipDuplicates: true,
    });

    return rows.length;
}

async function assertFieldCanBeDeleted({ shopId, fieldId }) {
    const field = await prisma.field.findFirst({
        where: {
            id: fieldId,
            shopId,
        },
        select: {
            id: true,
            type: true,
            label: true,
        },
    });

    if (!field) {
        throw new Error("Field not found");
    }

    const usageCount = field.type === "RANGE"
        ? await prisma.rowRangeValue.count({
            where: {
                fieldId,
            },
        })
        : await prisma.rowValue.count({
            where: {
                fieldId,
            },
        });

    if (usageCount > 0) {
        throw new Error(`${field.label} cannot be deleted while search entries use it`);
    }
}

export async function getFields({ admin, shopId, suggestions }) {
    let fields = await listFields({ shopId, suggestions });

    if (fields.length === 0 && admin) {
        await validateShop(admin);
        fields = await listFields({ shopId, suggestions });
    }
    return fields;
}

export async function createField({
    admin,
    shopId,
    field,
    rangeFieldLimit = getRangeFieldLimit(),
}) {
    if (admin) {
        await validateShop(admin);
    }

    const normalizedField = await validateFieldInput({ shopId, field, rangeFieldLimit });
    const fields = await normalizeFieldPositions(shopId);

    const createdField = await prisma.$transaction(async (tx) => {
        const nextField = await tx.field.create({
            data: {
                ...normalizedField,
                shopId,
                position: fields.length,
            },
        });

        await backfillRangeValuesForField({ field: nextField, client: tx });

        return nextField;
    });

    if (createdField.type === "RANGE") {
        await rebuildProductTagsForShop({ admin, shopId });
    }

    return listFields({ shopId });
}

export async function editField({
    shopId,
    field,
    rangeFieldLimit = getRangeFieldLimit(),
}) {
    const existingField = await prisma.field.findUnique({
        where: {
            id: field.id,
        },
        select: {
            key: true,
            type: true,
        },
    });

    if (!existingField) {
        throw new Error("Field not found");
    }

    if (field.type && field.type !== existingField.type) {
        throw new Error("Field type cannot be changed");
    }

    const normalizedField = await validateFieldInput({
        shopId,
        field: {
            ...field,
            key: existingField.key,
            type: existingField.type,
        },
        existingFieldId: field.id,
        rangeFieldLimit,
    });

    await prisma.field.update({
        where: {
            id: field.id,
        },
        data: normalizedField,
    });

    return listFields({ shopId });
}

export async function deleteField({ shopId, field }) {
    await assertFieldCanBeDeleted({ shopId, fieldId: field });

    await prisma.field.delete({
        where: {
            id: field,
        },
    });

    return normalizeFieldPositions(shopId);
}

export async function reorderFields({ shopId, fieldIds }) {
    if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
        return listFields({ shopId });
    }

    const fields = await listFields({ shopId });
    const existingFieldIds = fields.map((field) => field.id);
    const hasSameFields = existingFieldIds.length === fieldIds.length
        && existingFieldIds.every((fieldId) => fieldIds.includes(fieldId));

    if (!hasSameFields) {
        throw new Error("Invalid field order");
    }

    await prisma.$transaction(async (tx) => {
        for (const [index, fieldId] of fieldIds.entries()) {
            await tx.field.update({
                where: {
                    id: fieldId,
                },
                data: {
                    position: index + fieldIds.length + 1000,
                },
            });
        }

        for (const [index, fieldId] of fieldIds.entries()) {
            await tx.field.update({
                where: {
                    id: fieldId,
                },
                data: {
                    position: index,
                },
            });
        }

        await rebuildRowFilterSignatures(shopId, tx);
    });

    return listFields({ shopId });
}
