import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../app/db.server.js";
import { createField } from "../app/utils/fields.server.js";
import { createRow, deleteRow, getRows } from "../app/utils/rows.server.js";

function uniqueShopId() {
    return `gid://shopify/Shop/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("field validation allows only one range field per shop", async () => {
    const shopId = uniqueShopId();

    await prisma.shop.create({
        data: {
            shopifyGid: shopId,
            name: "Integration Test Shop",
            domain: "https://example.test",
        },
    });

    try {
        await createField({
            admin: null,
            shopId,
            field: {
                type: "RANGE",
                label: "Year",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                rangeStart: 2010,
                rangeEnd: 2025,
            },
        });

        await assert.rejects(
            createField({
                admin: null,
                shopId,
                field: {
                    type: "RANGE",
                    label: "Second Year",
                    visibility: "VISIBLE",
                    sortOrder: "A_Z",
                    rangeStart: 2010,
                    rangeEnd: 2025,
                },
            }),
            /Only one range field is allowed per shop/,
        );
    } finally {
        await prisma.shop.delete({
            where: {
                shopifyGid: shopId,
            },
        });
    }
});

test("row creation persists data and rejects overlapping year ranges", async () => {
    const shopId = uniqueShopId();

    await prisma.shop.create({
        data: {
            shopifyGid: shopId,
            name: "Integration Test Shop",
            domain: "https://example.test",
        },
    });

    try {
        const makeField = await prisma.field.create({
            data: {
                shopId,
                key: "make",
                type: "SELECT",
                label: "Make",
                placeholder: "Select make",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                position: 0,
            },
        });

        const modelField = await prisma.field.create({
            data: {
                shopId,
                key: "model",
                type: "SELECT",
                label: "Model",
                placeholder: "Select model",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                position: 1,
            },
        });

        const yearField = await prisma.field.create({
            data: {
                shopId,
                key: "year",
                type: "RANGE",
                label: "Year",
                placeholder: "Select year",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                rangeStart: 2010,
                rangeEnd: 2030,
                position: 2,
            },
        });

        const firstRow = await createRow({
            admin: null,
            data: {
                shopId,
                type: "PRODUCT",
                fields: JSON.stringify([
                    { fieldId: makeField.id, value: "Toyota" },
                    { fieldId: modelField.id, value: "Corolla" },
                    { fieldId: yearField.id, minValue: 2018, maxValue: 2020 },
                ]),
                attachments: JSON.stringify([
                    { id: "gid://shopify/Product/111" },
                ]),
            },
        });

        assert.equal(firstRow.success, true);

        const rows = await getRows({ shopId });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].columns[makeField.id], "Toyota");
        assert.equal(rows[0].columns[modelField.id], "Corolla");
        assert.equal(rows[0].columns[yearField.id], "2018-2020");

        await assert.rejects(
            createRow({
                admin: null,
                data: {
                    shopId,
                    type: "PRODUCT",
                    fields: JSON.stringify([
                        { fieldId: makeField.id, value: "Toyota" },
                        { fieldId: modelField.id, value: "Corolla" },
                        { fieldId: yearField.id, minValue: 2020, maxValue: 2022 },
                    ]),
                    attachments: JSON.stringify([
                        { id: "gid://shopify/Product/222" },
                    ]),
                },
            }),
            /overlapping year range/i,
        );

        await deleteRow({
            admin: null,
            shopId,
            rowId: firstRow.row.id,
        });

        const rowsAfterDelete = await getRows({ shopId });
        assert.equal(rowsAfterDelete.length, 0);
    } finally {
        await prisma.shop.delete({
            where: {
                shopifyGid: shopId,
            },
        });
    }
});

test.after(async () => {
    await prisma.$disconnect();
});
