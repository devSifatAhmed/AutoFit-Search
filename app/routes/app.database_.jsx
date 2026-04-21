import { useLoaderData, useNavigation} from "react-router"
import Loader from '../components/essentials/Loader'
import Text from '../components/essentials/Text'
import Section from '../components/essentials/Section'
import { useEffect, useState } from "react";
import { getFields } from "../utils/fields.server";
import { authenticate } from "../shopify.server";
import { capitalizeFirstLetter } from "../func/capitalizeFirstLetter";

// import page compononents start
import FieldModal from "../components/pages/database/home/FieldModal";
// import page compononents end

export async function loader({request}) {
    const { admin } = await authenticate.admin(request);
    const fields = await getFields(admin);
    return { fields };
}

export default function Database() {
    const { fields: loadedFields } = useLoaderData();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    if (isLoading) {
        return (
            <Loader />
        )
    }
    const [fields, setFields] = useState(loadedFields);
    const [fieldModalOpenType, setFieldModalOpenType] = useState(null);
    const [editableFieldData, setEditableFieldData] = useState(null);
    // handle update after field edit or add
    const handleUpdate = (event) => {
        if(event.target === "field"){
            const fieldEventData = event.data;
            if(fieldEventData.type === "add"){
                setFields(prev => [...prev, fieldEventData.field]);
            }else if(fieldEventData.type === "edit"){
                setFields(prev => prev.map(field => field.id === fieldEventData.field.id ? fieldEventData.field : field));
            }
        }else if(event.target === "entry"){
            const entryEventData = event.data;
            if(entryEventData.type === "duplicate"){
                console.log("Entry duplicated");
            }else if(entryEventData.type === "delete"){
                console.log("Entry deleted");
            }
        }else{
            console.log("Unknown event target");
        }
    }
    // field modal handlers
    const handleFieldModal = ({type, field}) => {
        setFieldModalOpenType(type);
        if (type === "add") {
            setEditableFieldData(null);
        } else if (type === "edit") {
            setEditableFieldData(field);
        }
    }
    return (
        <s-page>
            <FieldModal type={fieldModalOpenType} data={editableFieldData} handleUpdate={handleUpdate} />
            <s-stack paddingBlock='small large'>
                <s-grid gridTemplateColumns="1fr 2fr" gap="base large">
                    <s-grid-item>
                        <s-stack gap="large">
                            <s-stack>
                                <Text>Database</Text>
                            </s-stack>
                            <s-stack>
                                <Text as="h3">Database structure</Text>
                                <s-paragraph color="subdued">
                                    Configure your database structure, value type and order. Search form and fitment widget fields reflect database structure.
                                </s-paragraph>
                            </s-stack>
                        </s-stack>
                    </s-grid-item>
                    <s-grid-item>
                        <s-stack direction="inline" gap="small" justifyContent="end" alignItems="center">
                            <s-button commandFor="more-action-menu" variant="secondary">More actions</s-button>
                            <s-menu id="more-action-menu" accessibilityLabel="More actions">
                                <s-button icon="plus-circle">Add search entry</s-button>
                                <s-button icon="delete">Clear database</s-button>
                            </s-menu>

                            <s-button variant="secondary" icon="download">Download data backup</s-button>
                            <s-button variant="primary" icon="upload">Import database</s-button>
                        </s-stack>
                        <s-stack paddingBlockStart="base">
                            <Section>
                                <s-table>
                                    <s-table-header-row>
                                        <s-table-header>
                                            <s-stack paddingInlineStart="large">
                                                <s-stack paddingInlineStart="large">
                                                    <div style={{ padding: "4px 0" }}>Data column / Form field</div>
                                                </s-stack>
                                            </s-stack>
                                        </s-table-header>
                                        <s-table-header>
                                            Type
                                        </s-table-header>
                                        <s-table-header>

                                        </s-table-header>
                                    </s-table-header-row>
                                    <s-table-body>
                                        {fields.map((field, index) => (
                                            <s-table-row key={index}>
                                                <s-table-cell>
                                                    <s-stack direction="inline" gap="small" alignItems="center">
                                                        <s-button variant="tertiary" icon="drag-handle" />
                                                        {field.label}
                                                    </s-stack>
                                                </s-table-cell>
                                                <s-table-cell>
                                                    {capitalizeFirstLetter(field.type)}
                                                </s-table-cell>
                                                <s-table-cell>
                                                    <s-stack direction="inline" justifyContent="end">
                                                        <s-button variant="tertiary" icon="edit" commandFor="field-modal" onClick={() => {handleFieldModal({type: "edit", field: field})}} />
                                                        <s-button variant="tertiary" icon="delete" tone="critical" />
                                                    </s-stack>
                                                </s-table-cell>
                                            </s-table-row>
                                        ))}
                                    </s-table-body>
                                </s-table>
                                <s-stack padding="none base base">
                                    <s-button variant="ghost" icon="plus" commandFor="field-modal" onClick={() => {handleFieldModal({type: "add", field: null})}}>Add new field</s-button>
                                </s-stack>
                            </Section>
                        </s-stack>
                    </s-grid-item>
                </s-grid>
            </s-stack>

            <s-stack paddingBlockStart="large">
                <s-stack direction="inline" gap="small base" justifyContent="space-between" alignItems="end">
                    <s-box maxInlineSize="470px">
                        <s-grid>
                            <Text as="h3">Search entries & results</Text>
                            <s-paragraph color="subdued">
                                Add search entries according to the database structure or import database. Next specify search results for these entries.
                            </s-paragraph>
                        </s-grid>
                    </s-box>
                    <s-box>
                        <s-button variant="primary" href="/app/database/add">Add search entry</s-button>
                    </s-box>
                </s-stack>

                <s-stack paddingBlockStart="large">
                    <s-stack borderRadius="base" overflow="hidden" border="base">
                        <s-table>
                            <s-table-header-row>
                                <s-table-header>
                                    <s-grid gridTemplateColumns="30px 1fr" alignItems="center">
                                        <div style={{ height: "25px" }}></div>
                                        <s-checkbox />
                                    </s-grid>
                                </s-table-header>
                                <s-table-header>
                                    Brand
                                </s-table-header>
                                <s-table-header>
                                    Model
                                </s-table-header>
                                <s-table-header>
                                    Year
                                </s-table-header>
                                <s-table-header>
                                    Attachment
                                </s-table-header>
                                <s-table-header>
                                    <s-stack alignItems="end">
                                        <s-icon type="menu" />
                                    </s-stack>
                                </s-table-header>
                            </s-table-header-row>

                            <s-table-body>
                                <s-table-row>
                                    <s-table-cell>
                                        <s-grid gridTemplateColumns="30px 1fr">
                                            <div style={{ padding: "0 5px" }}>1</div>
                                            <s-checkbox />
                                        </s-grid>
                                    </s-table-cell>
                                    <s-table-cell>
                                        Toyota
                                    </s-table-cell>
                                    <s-table-cell>
                                        FJ Cruiser
                                    </s-table-cell>
                                    <s-table-cell>
                                        2010-2014
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-clickable href="#">
                                            <div style={{ display: "flex", alignItems: "center", color: "#0094d5", gap: "4px" }}>
                                                <s-icon type="product" tone="info" />
                                                1 product
                                            </div>
                                        </s-clickable>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-stack alignItems="end">
                                            <s-button commandFor="customer-menu" icon="menu-vertical" variant="tertiary"></s-button>

                                            <s-menu id="customer-menu" accessibilityLabel="Customer actions">
                                                <s-section heading="Actions">
                                                    <s-button icon="edit">Edit row</s-button>
                                                    <s-button icon="duplicate">Duplicate row</s-button>
                                                </s-section>
                                                <s-button tone="critical" icon="delete">Delete customer</s-button>
                                            </s-menu>
                                        </s-stack>
                                    </s-table-cell>
                                </s-table-row>
                            </s-table-body>
                        </s-table>
                    </s-stack>
                </s-stack>
            </s-stack>
        </s-page>
    )
}