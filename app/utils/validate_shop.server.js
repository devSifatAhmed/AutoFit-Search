import defaultFields from "../data/fields.json";
import prisma from "../db.server.js";
import { getShopData } from "../utils/shopData.server.js";
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
                    position: index
                }))
            }
        }
    })
    return prismaShop;
}
