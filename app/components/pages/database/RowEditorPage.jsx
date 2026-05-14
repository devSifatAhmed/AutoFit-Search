/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import Loader from "../../essentials/Loader";
import Section from "../../essentials/Section";
import Text from "../../essentials/Text";
import CustomClickable from "../../essentials/CustomClickable";

function buildInitialFieldData(fields) {
    return fields.map((field) => {
        if (field.type === "SELECT") {
            return {
                fieldId: field.id,
                value: "",
            };
        }

        return {
            fieldId: field.id,
            minValue: "",
            maxValue: "",
        };
    });
}

export default function RowEditorPage({
    mode,
    fields,
    shopData,
    initialAttachments,
    initialAttachmentMode,
    initialFieldData,
    isLoading,
    submitPath,
    rowId = null,
}) {
    const navigate = useNavigate();
    const fetcher = useFetcher();
    const [addingRole, setAddingRole] = useState(initialAttachmentMode || "PRODUCT");
    const [products, setProducts] = useState(initialAttachmentMode === "PRODUCT" ? (initialAttachments || []) : []);
    const [collections, setCollections] = useState(initialAttachmentMode === "COLLECTION" ? (initialAttachments || []) : []);
    const [isSaving, setIsSaving] = useState(null);
    const [isChanged, setIsChanged] = useState(false);
    const [fieldData, setFieldData] = useState(initialFieldData || buildInitialFieldData(fields));
    const [isDeleting, setIsDeleting] = useState(null);
    const [isCheckedAllProduct, setIsCheckedAllProduct] = useState(false);
    const [isCheckedAllCollection, setIsCheckedAllCollection] = useState(false);

    useEffect(() => {
        setFieldData(initialFieldData || buildInitialFieldData(fields));
        setAddingRole(initialAttachmentMode || "PRODUCT");
        setProducts(initialAttachmentMode === "PRODUCT" ? (initialAttachments || []) : []);
        setCollections(initialAttachmentMode === "COLLECTION" ? (initialAttachments || []) : []);
    }, [fields, initialFieldData, initialAttachments, initialAttachmentMode]);

    useEffect(() => {
        if (addingRole === "PRODUCT") {
            setIsChanged(products.length > 0);
            return;
        }

        setIsChanged(collections.length > 0);
    }, [addingRole, products, collections]);

    const handleAddingRole = (role) => {
        setAddingRole(role);
    };

    const handleAddButton = async (role) => {
        if (role === "PRODUCT") {
            const selected = await shopify.resourcePicker({
                type: "product",
                multiple: true,
                filter: { variants: false },
                selectionIds: products.map((product) => ({ id: product.id })),
            });

            if (selected) {
                setProducts(selected.map((product) => ({
                    id: product.id,
                    title: product.title,
                    image: product.images?.[0]?.originalSrc || null,
                })));
            }

            return;
        }

        const selected = await shopify.resourcePicker({
            type: "collection",
            multiple: false,
            selectionIds: collections.map((collection) => ({ id: collection.id })),
        });

        if (selected) {
            setCollections(selected.map((collection) => ({
                id: collection.id,
                title: collection.title,
                image: collection?.image?.originalSrc || null,
            })));
        }
    };

    const handleDeleteProduct = ({ id }) => {
        setIsDeleting(id);
        setProducts((currentProducts) => currentProducts.filter((product) => product.id !== id));
        setIsDeleting(null);
    };

    const handleDeleteCollection = ({ id }) => {
        setIsDeleting(id);
        setCollections((currentCollections) => currentCollections.filter((collection) => collection.id !== id));
        setIsDeleting(null);
    };

    const handleTextFieldData = ({ id, value }) => {
        setFieldData((currentFieldData) => currentFieldData.map((field) => (
            field.fieldId === id ? { ...field, value } : field
        )));
    };

    const handleNumberFieldData = ({ id, minValue, maxValue }) => {
        setFieldData((currentFieldData) => currentFieldData.map((field) => {
            if (field.fieldId !== id) {
                return field;
            }

            return {
                ...field,
                ...(minValue !== undefined ? { minValue } : {}),
                ...(maxValue !== undefined ? { maxValue } : {}),
            };
        }));
    };

    const validateSubmitData = () => {
        if (addingRole === "PRODUCT" && products.length === 0) {
            shopify.toast.show("Please select at least one product", { isError: true });
            return false;
        }

        if (addingRole === "COLLECTION" && collections.length === 0) {
            shopify.toast.show("Please select a collection", { isError: true });
            return false;
        }

        for (const field of fieldData) {
            const fieldMeta = fields.find((item) => item.id === field.fieldId);

            if ("value" in field && !field.value) {
                shopify.toast.show(`Please fill the ${fieldMeta?.label} field`, { isError: true });
                return false;
            }

            if ("minValue" in field && (field.minValue === "" || field.minValue === null)) {
                shopify.toast.show(`Please select the ${fieldMeta?.label} field start from`, { isError: true });
                return false;
            }

            if ("maxValue" in field && (field.maxValue === "" || field.maxValue === null)) {
                shopify.toast.show(`Please select the ${fieldMeta?.label} field end to`, { isError: true });
                return false;
            }

            if ("minValue" in field && "maxValue" in field && Number(field.minValue) > Number(field.maxValue)) {
                shopify.toast.show(`${fieldMeta?.label} start year cannot be greater than end year`, { isError: true });
                return false;
            }
        }

        return true;
    };

    const submitRow = (saveMode) => {
        setIsSaving(saveMode);

        if (!validateSubmitData()) {
            setIsSaving(null);
            return;
        }

        const formData = new FormData();
        formData.append("type", addingRole);
        formData.append("fields", JSON.stringify(fieldData));
        formData.append("attachments", addingRole === "PRODUCT" ? JSON.stringify(products) : JSON.stringify(collections));
        formData.append("shopId", shopData.id);

        if (rowId) {
            formData.append("rowId", rowId);
        }

        fetcher.submit(formData, {
            method: "post",
            action: submitPath,
        });
    };

    useEffect(() => {
        if (fetcher.state !== "idle" || !fetcher.data || isSaving === null) {
            return;
        }

        if (fetcher.data?.success) {
            shopify.toast.show(mode === "edit" ? "Row updated successfully" : "Row added successfully");

            if (mode === "edit" || isSaving === "save") {
                setTimeout(() => {
                    navigate("/app/database");
                }, 500)
            } else {
                setFieldData(buildInitialFieldData(fields));
                setProducts([]);
                setCollections([]);
                setIsCheckedAllProduct(false);
                setIsCheckedAllCollection(false);
                setIsChanged(false);
            }

            setIsSaving(null);
            return;
        }

        if (fetcher.data?.error) {
            shopify.toast.show(fetcher.data.error, { isError: true });
        }

        setIsSaving(null);
    }, [fetcher.state, fetcher.data, isSaving, mode, fields]);

    if (isLoading) {
        return <Loader />;
    }

    return (
        <s-page>
            <s-stack paddingBlock="base large">
                <s-grid gridTemplateColumns="auto 1fr">
                    <s-box>
                        <s-grid gridTemplateColumns="auto 1fr" gap="base">
                            <s-button variant="secondary" icon="arrow-left" href="/app/database" />
                            <Text as="h2">{mode === "edit" ? "Edit search entry" : "Add search entry"}</Text>
                        </s-grid>
                    </s-box>
                    <s-box>
                        <s-stack direction="inline" alignItems="center" justifyContent="end" gap="small">
                            <s-button variant="secondary" href="/app/database" disabled={isSaving !== null}>Cancel</s-button>
                            <s-button variant="primary" onClick={() => submitRow("save")} disabled={!isChanged || isSaving === "saveNext"} loading={isSaving === "save"}>
                                {mode === "edit" ? "Save changes" : "Save"}
                            </s-button>
                            {mode === "add" && (
                                <s-button variant="primary" onClick={() => submitRow("saveNext")} disabled={!isChanged || isSaving === "save"} loading={isSaving === "saveNext"}>
                                    Save & add next
                                </s-button>
                            )}
                        </s-stack>
                    </s-box>
                </s-grid>
            </s-stack>
            <s-stack>
                <Section>
                    <s-stack padding="small base">
                        <s-heading>Search form preview</s-heading>
                    </s-stack>
                    <s-divider />
                    <s-stack padding="small base base">
                        <s-query-container containerName="container">
                            <s-grid gridTemplateColumns="@container container (inline-size > 600px) 'repeat(3, 1fr)', 'repeat(1, 1fr)'" gap="small base">
                                {fields.map((field) => {
                                    if (field.type === "SELECT") {
                                        const suggestions = field.suggestions;
                                        const isSuggestion = suggestions?.length > 0;

                                        return (
                                            <s-grid-item key={field.id}>
                                                <s-clickable {...isSuggestion && { commandFor: field.id }} command="--show">
                                                    <div style={{ background: "#fff", cursor: "text" }}>
                                                        <s-text-field
                                                            label={field.label}
                                                            placeholder={`Enter ${field.label?.toLowerCase()}`}
                                                            autocomplete="off"
                                                            onChange={(e) => handleTextFieldData({ id: field.id, value: e.target.value })}
                                                            value={fieldData.find((item) => item.fieldId === field.id)?.value || ""}
                                                        />
                                                    </div>
                                                </s-clickable>
                                                {isSuggestion && (
                                                    <s-popover id={field.id} inlineSize="300px">
                                                        <div style={{ padding: "7px" }}>
                                                            {suggestions.map((suggestion) => (
                                                                <CustomClickable
                                                                    key={suggestion.id}
                                                                    borderRadius="4px"
                                                                    padding="4px 13px"
                                                                    background="strong"
                                                                    onClick={() => handleTextFieldData({ id: field.id, value: suggestion.value })}
                                                                >
                                                                    {suggestion.value}
                                                                </CustomClickable>
                                                            ))}
                                                        </div>
                                                    </s-popover>
                                                )}
                                            </s-grid-item>
                                        );
                                    }

                                    return (
                                        <s-grid-item key={field.id}>
                                            <s-grid gridTemplateColumns="1fr 1fr" gap="small base">
                                                <s-grid-item>
                                                    <s-select
                                                        label={`${field.label} From`}
                                                        placeholder={`Select ${field.label?.toLowerCase()} from`}
                                                        onChange={(e) => handleNumberFieldData({ id: field.id, minValue: parseInt(e.currentTarget.value, 10) })}
                                                        value={fieldData.find((item) => item.fieldId === field.id)?.minValue || ""}
                                                    >
                                                        {Array.from({ length: (field.rangeEnd - field.rangeStart) + 1 }, (_, index) => field.rangeStart + index)
                                                            .filter((year) => {
                                                                const selectedMaxValue = Number(fieldData.find((item) => item.fieldId === field.id)?.maxValue || 0);
                                                                return !selectedMaxValue || year <= selectedMaxValue;
                                                            })
                                                            .map((year) => (
                                                                <s-option key={year} value={year}>{year}</s-option>
                                                            ))}
                                                    </s-select>
                                                </s-grid-item>
                                                <s-grid-item>
                                                    <s-select
                                                        label={`${field.label} To`}
                                                        placeholder={`Select ${field.label?.toLowerCase()} to`}
                                                        onChange={(e) => handleNumberFieldData({ id: field.id, maxValue: parseInt(e.currentTarget.value, 10) })}
                                                        value={fieldData.find((item) => item.fieldId === field.id)?.maxValue || ""}
                                                    >
                                                        {Array.from({ length: (field.rangeEnd - field.rangeStart) + 1 }, (_, index) => field.rangeStart + index)
                                                            .filter((year) => {
                                                                const selectedMinValue = Number(fieldData.find((item) => item.fieldId === field.id)?.minValue || 0);
                                                                return !selectedMinValue || year >= selectedMinValue;
                                                            })
                                                            .reverse()
                                                            .map((year) => (
                                                                <s-option key={year} value={year}>{year}</s-option>
                                                            ))}
                                                    </s-select>
                                                </s-grid-item>
                                            </s-grid>
                                        </s-grid-item>
                                    );
                                })}
                            </s-grid>
                        </s-query-container>
                    </s-stack>
                </Section>
            </s-stack>
            <s-stack paddingBlock="large">
                <Section>
                    <s-stack padding="base">
                        <s-grid gridTemplateColumns="repeat(2, 160px)" gap="small base">
                            <s-stack>
                                <s-clickable onClick={() => handleAddingRole("PRODUCT")} background={addingRole === "PRODUCT" ? "strong" : "subdued"} borderRadius="base" overflow="hidden" border={addingRole === "PRODUCT" ? "large strong" : "base base"}>
                                    <s-stack direction="inline" justifyContent="center" padding="small">
                                        <s-icon type="product" />
                                    </s-stack>
                                </s-clickable>
                                <s-clickable onClick={() => handleAddingRole("PRODUCT")}>
                                    <div style={{ textAlign: "center", paddingTop: "5px", background: "#fff" }}>
                                        Products
                                    </div>
                                </s-clickable>
                            </s-stack>
                            <s-stack>
                                <s-clickable onClick={() => handleAddingRole("COLLECTION")} background={addingRole === "COLLECTION" ? "strong" : "subdued"} borderRadius="base" overflow="hidden" border={addingRole === "COLLECTION" ? "large strong" : "base base"}>
                                    <s-stack direction="inline" justifyContent="center" padding="small">
                                        <s-icon type="collection" />
                                    </s-stack>
                                </s-clickable>
                                <s-clickable onClick={() => handleAddingRole("COLLECTION")}>
                                    <div style={{ textAlign: "center", paddingTop: "5px", background: "#fff" }}>
                                        Collection
                                    </div>
                                </s-clickable>
                            </s-stack>
                        </s-grid>
                    </s-stack>
                    <s-divider />
                    <s-stack padding="base" direction="inline" justifyContent="space-between" alignItems="center">
                        {addingRole === "PRODUCT"
                            ? (products.length > 0
                                ? <s-checkbox checked={isCheckedAllProduct} onChange={(e) => setIsCheckedAllProduct(e.target.checked)} />
                                : <s-paragraph color="subdued">No products associated with the search rule</s-paragraph>)
                            : (collections.length > 0
                                ? <s-checkbox checked={isCheckedAllCollection} onChange={(e) => setIsCheckedAllCollection(e.target.checked)} />
                                : <s-paragraph color="subdued">No collection associated with the search rule</s-paragraph>)}
                        <s-button variant="primary" onClick={() => handleAddButton(addingRole)}>
                            {addingRole === "PRODUCT" ? "Add Products" : (collections.length > 0 ? "Change Collection" : "Add Collection")}
                        </s-button>
                    </s-stack>

                    {addingRole === "PRODUCT"
                        ? products.map((product) => (
                            <s-stack key={product.id} border="base base" borderWidth="base none none" paddingInline="base">
                                <div style={{ padding: "5px 0" }}>
                                    <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                        <s-checkbox checked={isCheckedAllProduct} />
                                        <s-clickable>
                                            <div style={{ background: "#fff" }}>
                                                <s-grid gridTemplateColumns="30px 1fr" gap="small" alignItems="center">
                                                    <img style={{ width: "100%" }} src={product.image || "/no-image-product.svg"} alt="" />
                                                    <span style={{ textDecoration: "underline", color: "#0094d5" }}>
                                                        {product.title || product.id}
                                                    </span>
                                                </s-grid>
                                            </div>
                                        </s-clickable>
                                        <s-button variant="tertiary" icon="delete" onClick={() => handleDeleteProduct({ id: product.id })} loading={isDeleting === product.id} />
                                    </s-grid>
                                </div>
                            </s-stack>
                        ))
                        : collections.map((collection) => (
                            <s-stack key={collection.id} border="base base" borderWidth="base none none" paddingInline="base">
                                <div style={{ padding: "5px 0" }}>
                                    <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                        <s-checkbox checked={isCheckedAllCollection} />
                                        <s-clickable>
                                            <div style={{ background: "#fff" }}>
                                                <s-grid gridTemplateColumns="30px 1fr" gap="small" alignItems="center">
                                                    <img style={{ width: "100%" }} src={collection.image || "/no-image-collection.svg"} alt="" />
                                                    <span style={{ textDecoration: "underline", color: "#0094d5" }}>
                                                        {collection.title || collection.id}
                                                    </span>
                                                </s-grid>
                                            </div>
                                        </s-clickable>
                                        <s-button variant="tertiary" icon="delete" onClick={() => handleDeleteCollection({ id: collection.id })} loading={isDeleting === collection.id} />
                                    </s-grid>
                                </div>
                            </s-stack>
                        ))}
                </Section>
            </s-stack>
        </s-page>
    );
}
