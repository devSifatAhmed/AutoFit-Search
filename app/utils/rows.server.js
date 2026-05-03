// import defaultRows from "../data/rows.json";
import prisma from "../db.server";
const defaultRows = [];
export async function getRows({ admin, shopId }) {
    return [];
    const prismaRows = await prisma.rows.findFirst(
        {
            where: {
                shop: shopId,
            },
        }
    );
    const rows = prismaRows?.rows || defaultRows;
    return rows;
}
