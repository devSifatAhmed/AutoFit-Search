import { createRequire } from "node:module";
import prisma from "../db.server.js";
import { getShopData } from "../utils/shopData.server.js";

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

export async function validateShop(admin) {
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
                create: defaultFields.map((field, index) => ({
                    ...field,
                    key: buildFieldKey(field.label),
                    position: index
                }))
            }
        }
    })
    return prismaShop;
}
