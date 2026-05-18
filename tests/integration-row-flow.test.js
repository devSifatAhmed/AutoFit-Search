import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../app/db.server.js";
import { createField, reorderFields } from "../app/utils/fields.server.js";
import { createRow, deleteRow, getRows } from "../app/utils/rows.server.js";
import { validateShop } from "../app/utils/validate_shop.server.js";

function uniqueShopId() {
    return `gid://shopify/Shop/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAdminMock({ shopId, metafields }) {
    return {
        graphql: async (query, options = {}) => {
            if (query.includes("shop {")) {
                return {
                    json: async () => ({
                        data: {
                            shop: {
                                id: shopId,
                                name: "Integration Test Shop",
                                email: "test@example.com",
                                url: "https://example.test",
                            },
                        },
                    }),
                };
            }

            if (query.includes("currentAppInstallation")) {
                return {
                    json: async () => ({
                        data: {
                            currentAppInstallation: {
                                id: "gid://shopify/AppInstallation/123",
                            },
                        },
                    }),
                };
            }

            if (query.includes("metafieldsSet")) {
                metafields.push(...options.variables.metafields);

                return {
                    json: async () => ({
                        data: {
                            metafieldsSet: {
                                metafields: options.variables.metafields.map((metafield, index) => ({
                                    id: `gid://shopify/Metafield/${index}`,
                                    key: metafield.key,
                                    namespace: metafield.namespace,
                                })),
                                userErrors: [],
                            },
                        },
                    }),
                };
            }

            throw new Error(`Unexpected GraphQL operation: ${query}`);
        },
    };
}

function parseMetafieldValues(metafields) {
    return Object.fromEntries(
        metafields.map((metafield) => [metafield.key, JSON.parse(metafield.value)]),
    );
}

test("shop validation seeds new shops and syncs split storefront metafields", async () => {
    const shopId = uniqueShopId();
    const metafields = [];
    const admin = createAdminMock({ shopId, metafields });

    try {
        await validateShop(admin, { syncStorefront: true });

        const fields = await prisma.field.findMany({
            where: { shopId },
            orderBy: [{ position: "asc" }],
        });
        const valuesByKey = parseMetafieldValues(metafields);

        assert.equal(fields.length, 3);
        assert.deepEqual(metafields.map((metafield) => metafield.key), ["fields", "rows", "suggestions"]);
        assert.deepEqual(valuesByKey.fields.map((field) => field.key), ["brand", "model", "year"]);
        assert.deepEqual(valuesByKey.rows, []);
        assert.deepEqual(valuesByKey.suggestions, []);
    } finally {
        await prisma.shop.deleteMany({
            where: {
                shopifyGid: shopId,
            },
        });
    }
});

test("shop validation syncs existing shop data without replacing it with defaults", async () => {
    const shopId = uniqueShopId();
    const metafields = [];
    const admin = createAdminMock({ shopId, metafields });

    await prisma.shop.create({
        data: {
            shopifyGid: shopId,
            name: "Existing Shop",
            domain: "https://old.example.test",
            fields: {
                create: {
                    key: "make",
                    type: "SELECT",
                    label: "Make",
                    placeholder: "Select make",
                    visibility: "VISIBLE",
                    sortOrder: "A_Z",
                    position: 0,
                },
            },
        },
    });

    try {
        await validateShop(admin, { syncStorefront: true });

        const fields = await prisma.field.findMany({
            where: { shopId },
            orderBy: [{ position: "asc" }],
        });
        const valuesByKey = parseMetafieldValues(metafields);

        assert.equal(fields.length, 1);
        assert.equal(fields[0].key, "make");
        assert.deepEqual(valuesByKey.fields.map((field) => field.key), ["make"]);
        assert.deepEqual(valuesByKey.rows, []);
        assert.deepEqual(valuesByKey.suggestions, []);
    } finally {
        await prisma.shop.deleteMany({
            where: {
                shopifyGid: shopId,
            },
        });
    }
});

test("field validation gates range fields by the configured limit", async () => {
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
            /premium subscription/,
        );

        await createField({
            admin: null,
            shopId,
            rangeFieldLimit: 2,
            field: {
                type: "RANGE",
                label: "Mileage",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                rangeStart: 0,
                rangeEnd: 10,
            },
        });

        const rangeFieldCount = await prisma.field.count({
            where: {
                shopId,
                type: "RANGE",
            },
        });

        assert.equal(rangeFieldCount, 2);
    } finally {
        await prisma.shop.delete({
            where: {
                shopifyGid: shopId,
            },
        });
    }
});

test("row creation persists multiple range values and rejects full range overlaps", async () => {
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

        const mileageField = await prisma.field.create({
            data: {
                shopId,
                key: "mileage",
                type: "RANGE",
                label: "Mileage",
                placeholder: "Select mileage",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                rangeStart: 0,
                rangeEnd: 10,
                position: 3,
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
                    { fieldId: mileageField.id, minValue: 0, maxValue: 3 },
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
        assert.equal(rows[0].columns[mileageField.id], "0-3");

        const storedRangeValues = await prisma.rowRangeValue.findMany({
            where: {
                rowId: firstRow.row.id,
            },
            orderBy: {
                minValue: "asc",
            },
        });

        assert.equal(storedRangeValues.length, 2);

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
                        { fieldId: mileageField.id, minValue: 2, maxValue: 5 },
                    ]),
                    attachments: JSON.stringify([
                        { id: "gid://shopify/Product/222" },
                    ]),
                },
            }),
            /overlapping range/i,
        );

        const secondRow = await createRow({
            admin: null,
            data: {
                shopId,
                type: "PRODUCT",
                fields: JSON.stringify([
                    { fieldId: makeField.id, value: "Toyota" },
                    { fieldId: modelField.id, value: "Corolla" },
                    { fieldId: yearField.id, minValue: 2020, maxValue: 2022 },
                    { fieldId: mileageField.id, minValue: 6, maxValue: 8 },
                ]),
                attachments: JSON.stringify([
                    { id: "gid://shopify/Product/333" },
                ]),
            },
        });

        assert.equal(secondRow.success, true);

        await deleteRow({
            admin: null,
            shopId,
            rowId: secondRow.row.id,
        });

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

test("adding a premium range field backfills existing rows", async () => {
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
                position: 1,
            },
        });

        const createdRow = await createRow({
            admin: null,
            data: {
                shopId,
                type: "PRODUCT",
                fields: JSON.stringify([
                    { fieldId: makeField.id, value: "Toyota" },
                    { fieldId: yearField.id, minValue: 2018, maxValue: 2020 },
                ]),
                attachments: JSON.stringify([
                    { id: "gid://shopify/Product/111" },
                ]),
            },
        });

        await createField({
            admin: null,
            shopId,
            rangeFieldLimit: 2,
            field: {
                type: "RANGE",
                label: "Mileage",
                visibility: "VISIBLE",
                sortOrder: "A_Z",
                rangeStart: 0,
                rangeEnd: 10,
            },
        });

        const mileageField = await prisma.field.findFirst({
            where: {
                shopId,
                key: "mileage",
            },
        });
        const backfilledRange = await prisma.rowRangeValue.findUnique({
            where: {
                rowId_fieldId: {
                    rowId: createdRow.row.id,
                    fieldId: mileageField.id,
                },
            },
        });

        assert.deepEqual(
            {
                minValue: backfilledRange.minValue,
                maxValue: backfilledRange.maxValue,
            },
            {
                minValue: 0,
                maxValue: 10,
            },
        );

        await deleteRow({
            admin: null,
            shopId,
            rowId: createdRow.row.id,
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

test("field reorder rebuilds row filter signatures with the new field order", async () => {
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

        const createdRow = await createRow({
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

        assert.equal(createdRow.row.filterSignature, "make:toyota|model:corolla");

        await reorderFields({
            shopId,
            fieldIds: [modelField.id, makeField.id, yearField.id],
        });

        const updatedRow = await prisma.searchRow.findUnique({
            where: {
                id: createdRow.row.id,
            },
        });

        assert.equal(updatedRow.filterSignature, "model:corolla|make:toyota");
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
