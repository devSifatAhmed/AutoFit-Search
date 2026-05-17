import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../app/db.server.js";
import { buildProductTags } from "../app/utils/productTags.server.js";
import { hasYearRangeOverlap } from "../app/utils/rows.server.js";
import { buildStorefrontMetafields, hydrateCollectionAttachmentHandles } from "../app/utils/storefrontConfig.server.js";
import { getAvailableOptions, getMatchingRows, getSearchResults } from "../app/utils/storefrontSearch.server.js";

test("buildProductTags creates one tag per field value and one tag per year", () => {
    const tags = buildProductTags({
        fields: [
            { id: "f1", key: "make", label: "Make", type: "SELECT" },
            { id: "f2", key: "model", label: "Model", type: "SELECT" },
            { id: "f3", key: "year", label: "Year", type: "RANGE" },
        ],
        row: {
            startYear: 2020,
            endYear: 2022,
            values: [
                { fieldId: "f1", value: "Toyota" },
                { fieldId: "f2", value: "Corolla Cross" },
            ],
        },
    });

    assert.deepEqual(tags, [
        "autofit_make_toyota",
        "autofit_model_corolla_cross",
        "autofit_year_2020",
        "autofit_year_2021",
        "autofit_year_2022",
    ]);
});

test("hasYearRangeOverlap detects intersecting ranges", () => {
    assert.equal(hasYearRangeOverlap({ startYear: 2018, endYear: 2020 }, { startYear: 2020, endYear: 2022 }), true);
    assert.equal(hasYearRangeOverlap({ startYear: 2018, endYear: 2020 }, { startYear: 2021, endYear: 2022 }), false);
});

test("storefront search utilities return matching rows and cascading options", () => {
    const config = {
        fields: [
            { key: "make", type: "SELECT", position: 0 },
            { key: "model", type: "SELECT", position: 1 },
            { key: "year", type: "RANGE", position: 2 },
        ],
        rows: [
            {
                id: "row-1",
                attachmentMode: "PRODUCT",
                startYear: 2018,
                endYear: 2021,
                values: [
                    { key: "make", value: "Toyota" },
                    { key: "model", value: "Corolla" },
                ],
                attachments: [{ id: "gid://shopify/Product/1" }],
            },
            {
                id: "row-2",
                attachmentMode: "PRODUCT",
                startYear: 2020,
                endYear: 2023,
                values: [
                    { key: "make", value: "Toyota" },
                    { key: "model", value: "Camry" },
                ],
                attachments: [{ id: "gid://shopify/Product/2" }],
            },
        ],
    };

    const matchingRows = getMatchingRows(config, {
        year: 2020,
        filters: { make: "Toyota", model: "Camry" },
    });

    assert.equal(matchingRows.length, 1);
    assert.equal(matchingRows[0].id, "row-2");

    const availableOptions = getAvailableOptions(config, {
        year: 2020,
        filters: { make: "Toyota" },
    });

    assert.deepEqual(availableOptions, {
        make: ["Toyota"],
        model: ["Camry", "Corolla"],
    });

    const results = getSearchResults(config, {
        year: 2020,
        filters: { make: "Toyota", model: "Corolla" },
    });

    assert.deepEqual(results, [
        {
            rowId: "row-1",
            attachmentMode: "PRODUCT",
            attachments: [{ id: "gid://shopify/Product/1" }],
        },
    ]);
});

test("storefront sync writes fields, rows, and suggestions into separate metafields", () => {
    const ownerId = "gid://shopify/AppInstallation/123";
    const storefrontConfig = {
        fields: [{ id: "field-1", key: "brand" }],
        rows: [{ id: "row-1", filterSignature: "brand:ford" }],
        suggestions: [{ id: "suggestion-1", key: "brand", value: "FORD" }],
        updatedAt: "2026-05-17T00:00:00.000Z",
    };

    const metafields = buildStorefrontMetafields(ownerId, storefrontConfig);
    const valuesByKey = Object.fromEntries(
        metafields.map((metafield) => [metafield.key, JSON.parse(metafield.value)]),
    );

    assert.deepEqual(metafields.map((metafield) => metafield.key), ["fields", "rows", "suggestions"]);
    assert.equal(metafields.every((metafield) => metafield.ownerId === ownerId), true);
    assert.equal(metafields.every((metafield) => metafield.namespace === "autofit_search"), true);
    assert.deepEqual(valuesByKey.fields, storefrontConfig.fields);
    assert.deepEqual(valuesByKey.rows, storefrontConfig.rows);
    assert.deepEqual(valuesByKey.suggestions, storefrontConfig.suggestions);
});

test("storefront config hydration adds collection handles to collection attachments", async () => {
    const admin = {
        graphql: async (query, options) => {
            assert.match(query, /CollectionAttachmentHandles/);
            assert.deepEqual(options.variables.ids, ["gid://shopify/Collection/1"]);

            return {
                json: async () => ({
                    data: {
                        nodes: [
                            {
                                id: "gid://shopify/Collection/1",
                                handle: "ford-edge-fitments",
                                title: "Ford Edge Fitments",
                            },
                        ],
                    },
                }),
            };
        },
    };
    const storefrontConfig = {
        fields: [],
        rows: [
            {
                id: "row-1",
                attachmentMode: "COLLECTION",
                attachments: [{ id: "gid://shopify/Collection/1" }],
            },
            {
                id: "row-2",
                attachmentMode: "PRODUCT",
                attachments: [{ id: "gid://shopify/Product/1" }],
            },
        ],
        suggestions: [],
        updatedAt: "2026-05-17T00:00:00.000Z",
    };

    const hydratedConfig = await hydrateCollectionAttachmentHandles(admin, storefrontConfig);

    assert.deepEqual(hydratedConfig.rows[0].attachments, [
        {
            id: "gid://shopify/Collection/1",
            handle: "ford-edge-fitments",
            title: "Ford Edge Fitments",
        },
    ]);
    assert.deepEqual(hydratedConfig.rows[1].attachments, storefrontConfig.rows[1].attachments);
});

test.after(async () => {
    await prisma.$disconnect();
});
