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

export async function createRow({ data }) {
    const { fields, attachments, type, shopId } = data;
    const parsedFields = JSON.parse(fields);
    const parsedAttachments = JSON.parse(attachments);

    await prisma.SearchRow.create({
        data: {
            shopId,
            values: {
                create: parsedFields.map((field) => ({
                    ...field
                }))
            },
            attachments: {
                create: parsedAttachments.map((attachment) => ({
                    type,
                    shopifyGid: attachment.id,
                }))
            }
        },
        include: {
            values: true,
            attachments: true
        }
    });

    return { success: true }
}