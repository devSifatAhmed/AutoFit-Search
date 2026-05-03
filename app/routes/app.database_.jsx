/* eslint-disable react/prop-types */
import { useLoaderData, useNavigation, useFetcher } from "react-router"
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    defaultAnimateLayoutChanges,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Loader from '../components/essentials/Loader'
import Text from '../components/essentials/Text'
import Section from '../components/essentials/Section'
import { useEffect, useState } from "react";
import { getRows } from "../utils/rows.server";
import { getShopData } from "../utils/shopData.server";
import { authenticate } from "../shopify.server";
import { capitalizeFirstLetter} from "../func/capitalizeFirstLetter";
import ButtonTertiary from "../components/essentials/ButtonTertiary";

// import page compononents start
import FieldModal from "../components/pages/database/home/FieldModal";
// import page compononents end

const restrictToVerticalAxis = ({ transform }) => ({
    ...transform,
    x: 0,
});

export async function action({request}) {
    const { admin } = await authenticate.admin(request);
    const { createField, editField, deleteField, reorderFields} = await import("../utils/fields.server");
    const formData = await request.formData();
    const target = formData.get('target');
    const shopId = formData.get('shopId');
    if(target === 'field'){
        const type = formData.get('type');
        const field = formData.get('field');
        if(type === 'add'){
            const newField = JSON.parse(field);
            const fields = await createField({admin, shopId, field: newField});
            console.log("Successfully added a new field...", fields);
            return { fields };
        }else if(type === 'edit'){
            const newField = JSON.parse(field);
            const fields = await editField({admin, shopId, field: newField});
            console.log("Successfully edited a field...", fields);
            return { fields };
        }else if(type === 'delete'){
            const fields = await deleteField({admin, shopId, field });
            console.log("Successfully deleted a field...", fields);
            return { fields };
        }else if(type === 'reorder'){
            const fieldIds = JSON.parse(field);
            const fields = await reorderFields({shopId, fieldIds});
            console.log("Successfully reordered fields...", fields);
            return { fields };
        }else{
            console.log("Wrong type submitted to field target...");
        }
    }else{
        console.log("Wrong target submitted...");
    }
    return null;
}

function SortableFieldRow({
    field,
    pendingFieldAction,
    fetcherState,
    handleOpenModal,
    handleUpdate,
    isDropTarget,
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({
        id: field.id,
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges({
            ...args,
            wasDragging: true,
        }),
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 1 : "auto",
        background: isOver && !isDragging ? "#f1f8ff" : "#fff",
        boxShadow: isDragging ? "0 8px 24px rgba(0, 0, 0, 0.16)" : undefined,
        position: "relative",
    };
    const cellStyle = {
        background: isDropTarget ? "#eef6ff" : undefined,
        boxShadow: isDropTarget ? "inset 0 2px 0 #2c6ecb" : undefined,
        transition: "background 140ms ease, box-shadow 140ms ease",
    };

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 160px 104px",
                alignItems: "center",
                minHeight: "46px",
                borderTop: "1px solid #e3e3e3",
            }}
        >
            <div style={{ ...cellStyle, padding: "8px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    <ButtonTertiary
                        {...attributes}
                        {...listeners}
                        isDragging={isDragging}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {field.label}
                    </span>
                </div>
            </div>
            <div style={{ ...cellStyle, padding: "8px 16px" }}>
                {capitalizeFirstLetter(field.type.toLowerCase())}
            </div>
            <div style={{ ...cellStyle, padding: "8px 16px" }}>
                <div style={{ display: "flex", justifyContent: "end", gap: "4px" }}>
                    <s-button variant="tertiary" icon="edit" onClick={() => handleOpenModal({ type: "edit", data: field })} />
                    <s-button
                        variant="tertiary"
                        icon="delete"
                        tone="critical"
                        loading={pendingFieldAction?.type === "delete" && pendingFieldAction?.fieldId === field.id && fetcherState !== "idle"}
                        onClick={() => handleUpdate({ target: "field", value: { type: "delete", data: field.id } })}
                    />
                </div>
            </div>
        </div>
    );
}

function FieldDragPreview({ field }) {
    if (!field) {
        return null;
    }

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 160px 96px",
            alignItems: "center",
            width: "560px",
            minHeight: "46px",
            padding: "0 16px",
            background: "#ffffff",
            border: "1px solid #d7d7d7",
            borderRadius: "8px",
            boxShadow: "0 18px 45px rgba(0, 0, 0, 0.22)",
            transform: "scale(1.02)",
            cursor: "grabbing",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 500 }}>
                <s-icon type="drag-handle" />
                {field.label}
            </div>
            <div>{capitalizeFirstLetter(field.type.toLowerCase())}</div>
            <div style={{ display: "flex", justifyContent: "end", color: "#6b7280" }}>Drop to reorder</div>
        </div>
    );
}

export async function loader({request}) {
    const { admin } = await authenticate.admin(request);
    const { getFields } = await import("../utils/fields.server");

    const shopData = await getShopData(admin);

    const fields = await getFields({admin, shopId: shopData.id});
    const rows = await getRows({admin, shopId: shopData.id});

    return { fields, rows, shopData };
}

export default function Database() {
    // default page loading spinner start
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    // default page loading spinner end

    // managing data from loader start 
    const { fields: loadedFields, rows: loadedRows, shopData } = useLoaderData();
    const [fields, setFields] = useState(loadedFields);
    const [rows] = useState(loadedRows);
    // managing data from loader end

    const fetcher = useFetcher();
    // fetcher effect for fields data update after add/edit field start
    const [saveProgress, setSaveProgress] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(false);
    const [editableField, setEditableField] = useState(null);
    const [modalType, setModalType] = useState(null);
    const [pendingFieldAction, setPendingFieldAction] = useState(null);
    const [activeFieldId, setActiveFieldId] = useState(null);
    const [overFieldId, setOverFieldId] = useState(null);
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
    const handleOpenModal = ({type, data}) => {
        setLoadingProgress(true);
        setModalType(type);
        if (type === "edit") {
            setEditableField(data);
        } else {
            setEditableField(null);
        }
        setTimeout(() => {
            shopify.modal.show("field-modal");
        }, 500);
        setTimeout(() => {
            setLoadingProgress(false);
        }, 1500);
    };
    // fetcher effect for fields data update after add/edit field end

    // handling callback response from field modal & updating start
    const handleUpdate = (event) => {
        // events about field add, edit & delete start
        if(event.target === 'field') {
            const type = event.value.type;
            const value = event.value.data;

            if(["add", "edit", "delete"].includes(type)) {
                setSaveProgress(true);
                setPendingFieldAction({
                    type,
                    fieldId: type === "delete" ? value : value?.id,
                });

                const formData = new FormData();
                formData.append('target', 'field');
                formData.append('type', type);
                formData.append('field', type === "delete" ? value || "" : JSON.stringify(value));
                formData.append('shopId', shopData.id);

                fetcher.submit(formData, {
                    method: "post",
                    action: "/app/database",
                });
            }
        }
        // events about field add, edit & delete end
    }
    const handleFieldDragStart = (event) => {
        setActiveFieldId(event.active.id);
    };
    const handleFieldDragOver = (event) => {
        setOverFieldId(event.over?.id || null);
    };
    const handleFieldDragEnd = (event) => {
        const { active, over } = event;
        setActiveFieldId(null);
        setOverFieldId(null);
        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = fields.findIndex((field) => field.id === active.id);
        const newIndex = fields.findIndex((field) => field.id === over.id);
        const reorderedFields = arrayMove(fields, oldIndex, newIndex);

        setFields(reorderedFields);
        setPendingFieldAction({
            type: "reorder",
            fieldId: active.id,
        });

        const formData = new FormData();
        formData.append('target', 'field');
        formData.append('type', 'reorder');
        formData.append('field', JSON.stringify(reorderedFields.map((field) => field.id)));
        formData.append('shopId', shopData.id);

        fetcher.submit(formData, {
            method: "post",
            action: "/app/database",
        });
    };
    const handleFieldDragCancel = () => {
        setActiveFieldId(null);
        setOverFieldId(null);
    };
    const activeField = fields.find((field) => field.id === activeFieldId);
    // handling callback response from field modal & updating end
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data) {
            if (fetcher.data.fields) {
                setFields(fetcher.data.fields);
            }
            if (pendingFieldAction) {
                setSaveProgress(false);

                if (!["delete", "reorder"].includes(pendingFieldAction.type)) {
                    shopify.modal.hide("field-modal");
                }

                const message = pendingFieldAction.type === "add"
                    ? "Field saved successfully"
                    : pendingFieldAction.type === "edit"
                        ? "Field updated successfully"
                        : pendingFieldAction.type === "delete"
                            ? "Field deleted successfully"
                            : "Field order updated successfully";

                shopify.toast.show(message, { duration: 3000 });
                setPendingFieldAction(null);
            }
        }
    }, [fetcher.state, fetcher.data, pendingFieldAction]);
    if (isLoading) {
        return (
            <Loader />
        )
    }
    return (
        <s-page>
            <FieldModal
                data={editableField} 
                type={modalType} 
                saveProgress={saveProgress} 
                handleUpdate={handleUpdate}
                loadingProgress={loadingProgress}
            />
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
                                <div>
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0, 1fr) 160px 104px",
                                        alignItems: "center",
                                        minHeight: "46px",
                                        background: "#f7f7f7",
                                        borderBottom: "1px solid #e3e3e3",
                                        fontWeight: 600,
                                    }}>
                                        <div style={{ padding: "8px 16px 8px 52px" }}>Data column / Form field</div>
                                        <div style={{ padding: "8px 16px" }}>Type</div>
                                        <div />
                                    </div>
                                        <DndContext
                                            sensors={sensors}
                                            collisionDetection={closestCenter}
                                            modifiers={[restrictToVerticalAxis]}
                                            onDragStart={handleFieldDragStart}
                                        onDragOver={handleFieldDragOver}
                                        onDragEnd={handleFieldDragEnd}
                                        onDragCancel={handleFieldDragCancel}
                                    >
                                        <SortableContext
                                            items={fields.map((field) => field.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {fields.map((field) => (
                                                <SortableFieldRow
                                                    key={field.id}
                                                    field={field}
                                                    pendingFieldAction={pendingFieldAction}
                                                    fetcherState={fetcher.state}
                                                    handleOpenModal={handleOpenModal}
                                                    handleUpdate={handleUpdate}
                                                    isDropTarget={activeFieldId && overFieldId === field.id && activeFieldId !== field.id}
                                                />
                                            ))}
                                        </SortableContext>
                                        <DragOverlay dropAnimation={{
                                            duration: 180,
                                            easing: "cubic-bezier(0.2, 0, 0, 1)",
                                        }}>
                                            <FieldDragPreview field={activeField} />
                                        </DragOverlay>
                                    </DndContext>
                                </div>
                                <s-stack padding="base">
                                    <s-button variant="secondary" icon="plus" onClick={()=>handleOpenModal({ type: "add", data: null })}>Add new field</s-button>
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
                                {fields.map((field, index) => (
                                    <s-table-header key={index}>
                                        {field.label}
                                    </s-table-header>
                                ))}
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
                                {rows?.map((row, index) => (
                                    <s-table-row key={index}>
                                        <s-table-cell>
                                            <s-grid gridTemplateColumns="30px 1fr">
                                                <div style={{ padding: "0 5px" }}>{index+1}</div>
                                                <s-checkbox value={row?.id} />
                                            </s-grid>
                                        </s-table-cell>
                                        {fields.map((field, index) => (
                                            <s-table-cell key={index}>
                                                {row?.columns?.[field.id] || ""}
                                            </s-table-cell>
                                        ))}
                                        <s-table-cell>
                                            <s-clickable href="#">
                                                <div style={{ display: "flex", alignItems: "center", color: "#0094d5", gap: "4px" }}>
                                                    <s-icon type={row?.role} tone="info" />
                                                    {row?.attachments?.length + ` `}
                                                    {row?.attachments?.length > 1 ? row?.role + "s" : row?.role }
                                                </div>
                                            </s-clickable>
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-stack alignItems="end">
                                                <s-button commandFor={`customer-menu__${row.id}`} icon="menu-vertical" variant="tertiary"></s-button>

                                                <s-menu id={`customer-menu__${row.id}`} accessibilityLabel="Customer actions">
                                                    <s-section heading="Actions">
                                                        <s-button icon="edit">Edit row</s-button>
                                                        {/* <s-button icon="duplicate">Duplicate row</s-button> */}
                                                    </s-section>
                                                    <s-button tone="critical" icon="delete">Delete customer</s-button>
                                                </s-menu>
                                            </s-stack>
                                        </s-table-cell>
                                    </s-table-row>
                                ))}
                            </s-table-body>
                        </s-table>
                        {rows?.length === 0 && (
                            <div style={{background: "#fff"}}>
                                <s-stack padding="small" alignItems="center">
                                    No entries
                                </s-stack>
                            </div>
                        )}
                    </s-stack>
                </s-stack>
            </s-stack>
        </s-page>
    )
}
