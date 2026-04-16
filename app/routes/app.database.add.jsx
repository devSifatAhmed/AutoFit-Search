import { useNavigation } from "react-router"
import Loader from '../components/essentials/Loader'
import Text from '../components/essentials/Text'
import Section from "../components/essentials/Section";
import { useState } from "react";
export default function DatabaseEdit() {
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    if (isLoading) {
        return (
            <Loader />
        )
    }
    const yearsMap = { start: 1970, end: 2026 };
    const [addingRole, setAddingRole] = useState("product");
    const [products, setProducts] = useState([]);
    const [collections, setCollections] = useState([]);
    const handleAddButton = async (role) => {
        if (role === "product") {
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
                setProducts(selected)
            } else {
                setProducts(products);
            }
        } else if (role === "collection") {
            const selected = await shopify.resourcePicker({
                type: 'collection',
                multiple: true,
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
                console.log(selected);
            } else {
                setCollections(collections);
            }
        } else {
            console.log("Selection method error.");
        }
    }
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
                            <s-button variant="secondary">Cancel</s-button>
                            <s-button variant="primary">Save</s-button>
                            <s-button variant="primary">Save & add next</s-button>
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
                        <s-grid gridTemplateColumns="2fr 2fr 1fr 1fr" gap="small base">
                            <s-grid-item>
                                <s-text-field label="Brand" />
                            </s-grid-item>
                            <s-grid-item>
                                <s-text-field label="Model" />
                            </s-grid-item>
                            <s-grid-item>
                                <s-select label="Year From" placeholder=" ">
                                    {Array.from(
                                        { length: yearsMap.end - yearsMap.start + 1 },
                                        (_, i) => yearsMap.start + i
                                    ).reverse().map((year) => (
                                        <s-option key={year} value={year}>
                                            {year}
                                        </s-option>
                                    ))}
                                </s-select>
                            </s-grid-item>
                            <s-grid-item>
                                <s-select label="Year From" placeholder=" ">
                                    {Array.from(
                                        { length: yearsMap.end - yearsMap.start + 1 },
                                        (_, i) => yearsMap.start + i
                                    ).reverse().map((year) => (
                                        <s-option key={year} value={year}>
                                            {year}
                                        </s-option>
                                    ))}
                                </s-select>
                            </s-grid-item>
                        </s-grid>
                    </s-stack>
                </Section>
            </s-stack>
            <s-stack paddingBlock="large">
                <Section>
                    <s-stack padding="base">
                        <s-grid gridTemplateColumns="repeat(2, 160px)" gap="small base">
                            <s-stack>
                                <s-clickable onClick={() => { setAddingRole("product") }} background={addingRole === "product" ? "strong" : "subdued"} borderRadius="base" overflow="hidden" border={addingRole === "product" ? "large strong" : "base base"}>
                                    <s-stack direction="inline" justifyContent="center" padding="small">
                                        <s-icon type="product" />
                                    </s-stack>
                                </s-clickable>
                                <s-clickable onClick={() => { setAddingRole("product") }}>
                                    <div style={{ textAlign: "center", paddingTop: "5px" }}>
                                        Products
                                    </div>
                                </s-clickable>
                            </s-stack>
                            <s-stack>
                                <s-clickable onClick={() => { setAddingRole("collection") }} background={addingRole === "collection" ? "strong" : "subdued"} borderRadius="base" overflow="hidden" border={addingRole === "collection" ? "large strong" : "base base"}>
                                    <s-stack direction="inline" justifyContent="center" padding="small">
                                        <s-icon type="collection" />
                                    </s-stack>
                                </s-clickable>
                                <s-clickable onClick={() => { setAddingRole("collection") }}>
                                    <div style={{ textAlign: "center", paddingTop: "5px" }}>
                                        Collections
                                    </div>
                                </s-clickable>
                            </s-stack>
                        </s-grid>
                    </s-stack>
                    <s-divider />
                    <s-stack padding="base" direction="inline" justifyContent="space-between" alignItems="center">
                        {addingRole === "product" ? (
                            products.length > 0 ? (
                                <s-checkbox />
                            ) : (
                                <s-paragraph color="subdued">No products associated with the search rule</s-paragraph>
                            )
                        ) : (
                            collections.length > 0 ? (
                                <s-checkbox />
                            ) : (
                                <s-paragraph color="subdued">No collections associated with the search rule</s-paragraph>
                            )
                        )}
                        <s-button variant="primary" onClick={() => { handleAddButton(addingRole) }}>
                            Add {addingRole === "product" ? 'Products' : 'Collections'}
                        </s-button>
                    </s-stack>

                    {addingRole === "product" ? (
                        <>
                            {products.map((product) => {
                                return (
                                    <>
                                        {console.log(typeof product, product)}
                                        <s-stack key={product?.id} border="base base" borderWidth="base none none" paddingInline="base">
                                            <div style={{ padding: "5px 0" }}>
                                                <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                                    <s-checkbox />
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
                                                    <s-button variant="tertiary" icon="delete" />
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
                                        {console.log(typeof collection, collection)}
                                        <s-stack key={collection?.id} border="base base" borderWidth="base none none" paddingInline="base">
                                            <div style={{ padding: "5px 0" }}>
                                                <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
                                                    <s-checkbox />
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
                                                    <s-button variant="tertiary" icon="delete" />
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