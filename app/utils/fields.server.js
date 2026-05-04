import prisma from "../db.server.js";
import { validateShop } from "./validate_shop.server.js";

function normalizeField(field) {
    const type = field?.type || "SELECT";

    return {
        type,
        label: field?.label || "Field",
        placeholder: field?.placeholder || null,
        visibility: field?.visibility || field?.labelVisibility || "VISIBLE",
        sortOrder: field?.sortOrder || field?.sortby || "A_Z",
        rangeStart: type === "RANGE" ? Number(field?.rangeStart || 1970) : null,
        rangeEnd: type === "RANGE" ? Number(field?.rangeEnd || 2026) : null,
    };
}

async function listFields(shopId) {
    return prisma.field.findMany({
        where: {
            shopId,
        },
        orderBy: [
            { position: "asc" },
            { createdAt: "asc" },
        ],
    });
}

async function normalizeFieldPositions(shopId) {
    const fields = await listFields(shopId);

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

    return listFields(shopId);
}

export async function getFields({ admin, shopId }) {
    let fields = await listFields(shopId);

    if (fields.length === 0 && admin) {
        await validateShop(admin);
        fields = await listFields(shopId);
    }

    return normalizeFieldPositions(shopId);
}

export async function createField({ admin, shopId, field }) {
    if (admin) {
        await validateShop(admin);
    }

    const fields = await normalizeFieldPositions(shopId);

    await prisma.field.create({
        data: {
            ...normalizeField(field),
            shopId,
            position: fields.length,
        },
    });

    return listFields(shopId);
}

export async function editField({ shopId, field }) {
    await prisma.field.update({
        where: {
            id: field.id,
        },
        data: normalizeField(field),
    });

    return listFields(shopId);
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
        return listFields(shopId);
    }

    const fields = await listFields(shopId);
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

    return listFields(shopId);
}