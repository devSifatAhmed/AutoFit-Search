import prisma from "../db.server.js";
import { validateShop } from "./validate_shop.server.js";

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

async function validateFieldInput({ shopId, field, existingFieldId = null }) {
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

        const existingRangeField = await prisma.field.findFirst({
            where: {
                shopId,
                type: "RANGE",
                ...(existingFieldId ? { id: { not: existingFieldId } } : {}),
            },
            select: {
                id: true,
            },
        });

        if (existingRangeField) {
            throw new Error("Only one range field is allowed per shop");
        }
    }

    return {
        ...normalizedField,
        key: fieldKey,
    };
}

async function listFields({shopId, suggestions}) {

    return prisma.field.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { position: "asc" }
        ],
        include: {
            suggestions: suggestions ? true : false
        }
    });
}

async function normalizeFieldPositions(shopId) {
    const fields = await listFields({shopId});

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

    return listFields({shopId});
}

export async function getFields({ admin, shopId, suggestions }) {
    let fields = await listFields({shopId, suggestions});

    if (fields.length === 0 && admin) {
        await validateShop(admin);
        fields = await listFields({shopId, suggestions});
    }
    return fields;
}

export async function createField({ admin, shopId, field }) {
    if (admin) {
        await validateShop(admin);
    }

    const normalizedField = await validateFieldInput({ shopId, field });
    const fields = await normalizeFieldPositions(shopId);

    await prisma.field.create({
        data: {
            ...normalizedField,
            shopId,
            position: fields.length,
        },
    });

    return listFields({shopId});
}

export async function editField({ shopId, field }) {
    const existingField = await prisma.field.findUnique({
        where: {
            id: field.id,
        },
        select: {
            key: true,
        },
    });

    const normalizedField = await validateFieldInput({
        shopId,
        field: {
            ...field,
            key: existingField?.key,
        },
        existingFieldId: field.id,
    });

    await prisma.field.update({
        where: {
            id: field.id,
        },
        data: normalizedField,
    });

    return listFields({shopId});
}

export async function deleteField({ shopId, field }) {
    await prisma.field.delete({
        where: {
            id: field,
        },
    });

    return normalizeFieldPositions(shopId);
}

export async function reorderFields({ shopId, fieldIds }) {
    if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
        return listFields({shopId});
    }

    const fields = await listFields({shopId});
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
    });

    return listFields({shopId});
}
