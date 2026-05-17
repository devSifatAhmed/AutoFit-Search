import { createRequire } from "node:module";
import prisma from "../db.server.js";
import { getShopData } from "../utils/shopData.server.js";
import { syncStorefrontConfig } from "./storefrontConfig.server.js";

const require = createRequire(import.meta.url);
const defaultFields = require("../data/fields.json");

function buildFieldKey(label) {
    return String(label || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_") || "field";
}

function buildDefaultFields() {
    return defaultFields.map((field, index) => ({
        ...field,
        key: buildFieldKey(field.label),
        position: index,
    }));
}

async function ensureDefaultFields(shopId) {
    const fieldCount = await prisma.field.count({
        where: {
            shopId,
        },
    });

    if (fieldCount > 0) {
        return false;
    }

    await prisma.field.createMany({
        data: buildDefaultFields().map((field) => ({
            ...field,
            shopId,
        })),
        skipDuplicates: true,
    });

    return true;
}

export async function validateShop(admin, { syncStorefront = false } = {}) {
    const shop = await getShopData(admin);
    const prismaShop = await prisma.shop.upsert({
        where: {
            shopifyGid: shop.id,
        },
        update: {
            name: shop.name,
            domain: shop.url,
        },
        create: {
            shopifyGid: shop.id,
            name: shop.name,
            domain: shop.url,
            fields: {
                create: buildDefaultFields(),
            }
        }
    });

    await ensureDefaultFields(shop.id);

    if (syncStorefront) {
        await syncStorefrontConfig(admin, shop.id);
    }

    return prismaShop;
}
