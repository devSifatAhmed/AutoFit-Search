// import defaultRows from "../data/rows.json";
import prisma from "../db.server";
const defaultRows = [];

async function listRows(shopId) {
    return prisma.SearchRow.findMany({
        where: {
            shopId
        },
        orderBy: [
            { createdAt: "asc" }
        ],
        values: true,
        attachments: true
    })
}

export async function getRows({ admin, shopId }) {
    // const rows = await listRows(shopId);
    // console.log("Rows from server console: ", rows);
    return [];
}