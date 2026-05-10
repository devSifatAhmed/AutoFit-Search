import { useLoaderData, useNavigation } from "react-router"
import Loader from '../components/essentials/Loader'
import Text from '../components/essentials/Text'
import Section from "../components/essentials/Section";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import CustomClickable from "../components/essentials/CustomClickable";
import { useFetcher } from "react-router";
export async function action({ request }) {
    await authenticate.admin(request);
    const formData = await request.formData();
    console.log("Form Data: ", formData);
    // const shopId = formData.get("shopId");
    // const type = formData.get("type");
    return null;
}

export async function loader({ request }) {
    const { admin } = await authenticate.admin(request);
    const { getFields } = await import("../utils/fields.server");
    const { getShopData } = await import("../utils/shopData.server");
    const shopData = await getShopData(admin);
    const fields = await getFields({ admin, shopId: shopData.id, suggestions: true });
    return { fields, shopData };
}

export default function DatabaseEdit() {
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    if (isLoading) {
        return (
            <Loader />
        )
    }
    const fetcher = useFetcher();
    const { fields, shopData } = useLoaderData();
    const [addingRole, setAddingRole] = useState("PRODUCT");
    const [products, setProducts] = useState([]);
    const [collections, setCollections] = useState([]);
    const [isSaving, setIsSaving] = useState(null);
    const [isChanged, setIsChanged] = useState(false);
    const [fieldData, setFieldData] = useState([]);
    useEffect(() => {
        const fieldsData = fields.map((field) => {
            if(field.type === "SELECT") {
                return {
                    fieldId: field.id,
                    value: null
                }
            }else {
                return {
                    fieldId: field.id,
                    minValue: null,
                    maxValue: null
                }
            }
        });
        setFieldData(fieldsData);
    }, [fields]);
    const handleChangeStatus = () => {
        if(addingRole === "PRODUCT") {
            if(products.length > 0) {
                setIsChanged(true);
            }else {
                setIsChanged(false);
            }
        }else if(addingRole === "COLLECTION") {
            if(collections.length > 0) {
                setIsChanged(true);
            }else{
                setIsChanged(false);
            }
        }
    }
    useEffect(() => {
        handleChangeStatus();
    }, [addingRole, products, collections]);
    const handleAddingRole = (role) => {
        setAddingRole(role);
    }
    const handleAddButton = async (role) => {
        if (role === "PRODUCT") {
            const selected = await shopify.resourcePicker({
                type: 'product',
                multiple: true,
                filter: { variants: false },
                selectionIds: [
                    ...products.map((product) => (
                        {
                            id: product.id
                        }
                    ))
                ]
            });
            if (selected) {
                setProducts(selected);
                handleChangeStatus();
            } else {
                setProducts(products);
                handleChangeStatus();
            }
        } else if (role === "COLLECTION") {
            const selected = await shopify.resourcePicker({
                type: 'collection',
                multiple: false,
                selectionIds: [
                    ...collections.map((collection) => (
                        {
                            id: collection.id
                        }
                    ))
                ]
            });
            if (selected) {
                setCollections(selected)
                handleChangeStatus();
            } else {
                setCollections(collections);
                handleChangeStatus();
            }
        } else {
            console.log("Selection method error.");
        }
    }
    const [isDeleting, setIsDeleting] = useState(null);
    const handleDeleteProduct = (e) => {
        setIsDeleting(e.id);
        const id = e.id;
        const newProducts = products.filter((product) => product.id !== id);
        setProducts(newProducts);
        setIsDeleting(null);
    }
    const handleDeleteCollection = (e) => {
        setIsDeleting(e.id);
        const id = e.id;
        const newCollections = collections.filter((collection) => collection.id !== id);
        setCollections(newCollections);
        setIsDeleting(null);
    }
    const [isCheckedAllProduct, setIsCheckedAllProduct] = useState(false);
    const handleMarkAllProduct = (e) => {
        const value = e.target.checked;
        if(value) {
            setIsCheckedAllProduct(true);
        } else {
            setIsCheckedAllProduct(false);
        }
    }
    const [isCheckedAllCollection, setIsCheckedAllCollection] = useState(false);
    const handleMarkAllCollection = (e) => {
        const value = e.target.checked;
        if(value) {
            setIsCheckedAllCollection(true);
        } else {
            setIsCheckedAllCollection(false);
        }
    }

    const handleTextFieldData = (e) => {
        const id = e.id;
        const value = e.value;
        const newFieldData = fieldData.map((field) => field.fieldId === id ? { ...field, value } : field);
        setFieldData(newFieldData);
    }
    const handleNumberFieldData = (e) => {
        const id = e.id;
        if(e.minValue) {
            const minValue = e.minValue;
            const newFieldData = fieldData.map((field) => field.fieldId === id ? { ...field, minValue } : field);
            setFieldData(newFieldData);
        }
        if(e.maxValue) {
            const maxValue = e.maxValue;
            const newFieldData = fieldData.map((field) => field.fieldId === id ? { ...field, maxValue } : field);
            setFieldData(newFieldData);
        }
    }


    const saveSuccessToat = () => {
        shopify.toast.show("Row added successfully");
    }
    const validateSubmitData = () => {
        if(addingRole === "PRODUCT" && products.length === 0) {
            shopify.toast.show("Please select at least one product", {
                isError: true
            });
            setIsSaving(null);
            return;
        }
        if(addingRole === "COLLECTION" && collections.length === 0) {
            shopify.toast.show("Please select a collection", {
                isError: true
            });
            setIsSaving(null);
            return;
        }
        for (const field of fieldData) {
            const fieldMeta = fields?.find((f) => f.id === field.fieldId);

            if ("value" in field && (field.value === null || field.value === "")) {
                shopify.toast.show(`Please fill the ${fieldMeta?.label} field`, {
                    isError: true,
                });
                setIsSaving(null);
                return;
            }

            if ("minValue" in field && (field.minValue === null || field.minValue === "")) {
                shopify.toast.show(`Please select the ${fieldMeta?.label} field start from`, {
                    isError: true,
                });
                setIsSaving(null);
                return;
            }

            if ("maxValue" in field && (field.maxValue === null || field.maxValue === "")) {
                shopify.toast.show(`Please select the ${fieldMeta?.label} field end to`, {
                    isError: true,
                });
                setIsSaving(null);
                return;
            }
        }
    }
    const handleSave = () => {
        setIsSaving("save");
        if(validateSubmitData()) return;
        const formData = new FormData();
        formData.append('target', 'add');
        formData.append('type', addingRole);
        formData.append('data', JSON.stringify(fieldData));
        formData.append('attachments', addingRole === "PRODUCT" ? JSON.stringify(products) : JSON.stringify(collections));
        formData.append('shopId', shopData.id);
        fetcher.submit(formData, {
            method: "post",
            action: "/app/database/add",
        });
        setIsSaving(null);
    }
    const handleSaveNext = () => {
        setIsSaving("saveNext");
        validateSubmitData();
    }

    console.clear();
    console.log("fieldData", fieldData);
    return (
        <s-page>
            <s-stack paddingBlock="base large">
                <s-grid gridTemplateColumns="auto 1fr">
                    <s-box>
                        <s-grid gridTemplateColumns="auto 1fr" gap="base">
                            <s-button variant="secondary" icon="arrow-left" href="/app/database" />
                            <Text as="h2">Add search entry</Text>
                        </s-grid>
                    </s-box>
                    <s-box>
                        <s-stack direction="inline" alignItems="center" justifyContent="end" gap="small">
                            <s-button variant="secondary" href="/app/database" disabled={isSaving !== null}>Cancel</s-button>
                            <s-button variant="primary" onClick={handleSave} disabled={!isChanged || isSaving === "saveNext"} loading={isSaving === "save"}>Save</s-button>
                            <s-button variant="primary" onClick={handleSaveNext} disabled={!isChanged || isSaving === "save" } loading={isSaving === "saveNext"}>Save & add next</s-button>
                        </s-stack>
                    </s-box>
                </s-grid>
            </s-stack>
            <s-stack>
                <Section>
                    <s-stack padding="small base">
                        <s-heading>Search from preview</s-heading>
                    </s-stack>
                    <s-divider />
                    <s-stack padding="small base base">
                        <s-query-container containerName="container">
                            <s-grid gridTemplateColumns="@container container (inline-size > 600px) 'repeat(3, 1fr)', 'repeat(1, 1fr)'" gap="small base">
                                {fields.map((field) => {
                                    if(field?.type === 'SELECT'){
                                        const suggestions = field?.suggestions;
                                        const isSuggestion = suggestions?.length > 0;
                                        return (
                                            <>
                                                <s-grid-item>
                                                    <s-clickable {...isSuggestion && {commandFor: field?.id}} command='--show'>
                                                        <div style={{background: '#fff', cursor: "text"}}>
                                                            <s-text-field
                                                                label={field?.label}
                                                                placeholder={`Enter ${field?.label?.toLowerCase()}`}
                                                                autocomplete="off"
                                                                onChange={(e)=> {handleTextFieldData({id: field?.id, value: e.target.value})}}
                                                                value={fieldData?.find((item) => item.fieldId === field?.id)?.value || ""}
                                                            />
                                                        </div>
                                                    </s-clickable>
                                                    {isSuggestion && (
                                                        <s-popover id={field?.id} inlineSize="300px">
                                                            <div style={{
                                                                padding: '7px'
                                                            }}>
                                                                {suggestions?.map((suggestion, key) => (
                                                                    <CustomClickable
                                                                        key={key}
                                                                        borderRadius="4px"
                                                                        padding="4px 13px"
                                                                        background="strong"
                                                                        onClick={()=> {handleTextFieldData({id: field?.id, value: suggestion?.value})}}
                                                                    >
                                                                        {suggestion?.value}
                                                                    </CustomClickable>
                                                                ))}
                                                            </div>
                                                        </s-popover>
                                                    )}
                                                </s-grid-item>
                                            </>
                                        )
                                    }else if (field?.type === 'RANGE'){
                                        return (
                                            <>
                                                <s-grid-item>
                                                    <s-grid gridTemplateColumns="1fr 1fr" gap="small base">
                                                        <s-grid-item>
                                                            <s-select
                                                                label={`${field?.label} From`}
                                                                placeholder={`Select ${field?.label?.toLowerCase()} from`}
                                                                onChange={(e)=> {handleNumberFieldData({id: field?.id, minValue: e.currentTarget.value})}}
                                                                >
                                                                {Array.from({ length: field?.rangeEnd - field?.rangeStart }, (_, index) => field?.rangeStart + index).map((year) => (
                                                                    <s-option key={year} value={year}>{year}</s-option>
                                                                ))}
                                                            </s-select>
                                                        </s-grid-item>
                                                        <s-grid-item>
                                                            <s-select
                                                                label={`${field?.label} To`}
                                                                placeholder={`Select ${field?.label?.toLowerCase()} to`}
                                                                onChange={(e)=> {handleNumberFieldData({id: field?.id, maxValue: e.currentTarget.value})}}
                                                            >
                                                                {Array.from({ length: field?.rangeEnd - field?.rangeStart }, (_, index) => field?.rangeStart + index).reverse().map((year) => (
                                                                    <s-option key={year} value={year}>{year}</s-option>
                                                                ))}
                                                            </s-select>
                                                        </s-grid-item>
                                                    </s-grid>
                                                </s-grid-item>
                                            </>
                                        )
                                    }
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
                        {addingRole === "PRODUCT" ? (
                            products.length > 0 ? (
                                <s-checkbox checked={isCheckedAllProduct} onChange={handleMarkAllProduct} />
                            ) : (
                                <s-paragraph color="subdued">No products associated with the search rule</s-paragraph>
                            )
                        ) : (
                            collections.length > 0 ? (
                                <s-checkbox checked={isCheckedAllCollection} onChange={handleMarkAllCollection} />
                            ) : (
                                <s-paragraph color="subdued">No collection associated with the search rule</s-paragraph>
                            )
                        )}
                        <s-button variant="primary" onClick={() => { handleAddButton(addingRole) }}>
                            {/* Add {addingRole === "PRODUCT" ? 'Products' : 'Collections'} */}
                            {addingRole === "PRODUCT" ? 'Add Products' : (
                                collections.length > 0 ? 'Change Collection' : 'Add Collection'
                            )}
                        </s-button>
                    </s-stack>

                    {addingRole === "PRODUCT" ? (
                        <>
                            {products.map((product) => {
                                return (
                                    <>
                                        <s-stack key={product?.id} border="base base" borderWidth="base none none" paddingInline="base">
                                            <div style={{ padding: "5px 0" }}>
                                                <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                                    <s-checkbox checked={isCheckedAllProduct} />
                                                    <s-clickable>
                                                        <div style={{ background: "#fff" }}>
                                                            <s-grid gridTemplateColumns="30px 1fr" gap="small" alignItems="center">
                                                                <img style={{ width: "100%" }} src={product?.images?.[0]?.originalSrc ? product?.images?.[0]?.originalSrc : '/no-image-product.svg'} />
                                                                <span style={{ textDecoration: "underline", color: "#0094d5" }}>
                                                                    {product?.title}
                                                                </span>
                                                            </s-grid>
                                                        </div>
                                                    </s-clickable>
                                                    <s-button variant="tertiary" icon="delete" onClick={()=> handleDeleteProduct({id: product?.id})} loading={isDeleting === product?.id} />
                                                </s-grid>
                                            </div>
                                        </s-stack>
                                    </>
                                )
                            })}
                        </>
                    ) : (
                        <>
                            {collections.map((collection) => {
                                return (
                                    <>
                                        <s-stack key={collection?.id} border="base base" borderWidth="base none none" paddingInline="base">
                                            <div style={{ padding: "5px 0" }}>
                                                <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                                    <s-checkbox checked={isCheckedAllCollection} />
                                                    <s-clickable>
                                                        <div style={{ background: "#fff" }}>
                                                            <s-grid gridTemplateColumns="30px 1fr" gap="small" alignItems="center">
                                                                <img style={{ width: "100%" }} src={collection?.image ? collection?.image : '/no-image-collection.svg'} />
                                                                <span style={{ textDecoration: "underline", color: "#0094d5" }}>
                                                                    {collection?.title}
                                                                </span>
                                                            </s-grid>
                                                        </div>
                                                    </s-clickable>
                                                    <s-button variant="tertiary" icon="delete" onClick={()=> handleDeleteCollection({id: collection?.id})} loading={isDeleting === collection?.id} />
                                                </s-grid>
                                            </div>
                                        </s-stack>
                                    </>
                                )
                            })}
                        </>
                    )}
                </Section>
            </s-stack>
        </s-page>
    )
}
