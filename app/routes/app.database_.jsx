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
import { useEffect, useMemo, useState } from "react";
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

const ROWS_PER_PAGE = 15;

function normalizeFilterText(value) {
    return String(value || "").trim().toLowerCase();
}

function parseRangeColumn(value) {
    const match = String(value || "")
        .trim()
        .match(/^(-?\d+)\s*(?:(?:-|\u2013|\u2014)\s*(-?\d+))?$/);

    if (!match) {
        return null;
    }

    const startValue = Number(match[1]);
    const endValue = Number(match[2] || match[1]);

    if (!Number.isInteger(startValue) || !Number.isInteger(endValue)) {
        return null;
    }

    return {
        minValue: Math.min(startValue, endValue),
        maxValue: Math.max(startValue, endValue),
    };
}

function isSingleInteger(value) {
    return /^-?\d+$/.test(String(value || "").trim());
}

function isRangeLikeValue(value) {
    return /^-?\d+\s*(?:(?:-|\u2013|\u2014)\s*-?\d+)?$/.test(String(value || "").trim());
}

function isRangeColumnValue({ field, value }) {
    return field.type === "RANGE" || /^-?\d+\s*(?:-|\u2013|\u2014)\s*-?\d+$/.test(String(value || "").trim());
}

function rangesOverlap(existingRange, nextRange) {
    return existingRange.minValue <= nextRange.maxValue
        && existingRange.maxValue >= nextRange.minValue;
}

function valueMatchesFieldFilter({ field, value, filterValue }) {
    const normalizedFilter = normalizeFilterText(filterValue);

    if (!normalizedFilter) {
        return true;
    }

    const normalizedValue = normalizeFilterText(value);
    const shouldUseRangeMatch = isRangeColumnValue({ field, value: normalizedValue });

    if (shouldUseRangeMatch && isSingleInteger(normalizedFilter)) {
        const rangeValue = parseRangeColumn(value);
        const numericFilter = Number(normalizedFilter);

        return Boolean(rangeValue)
            && rangeValue.minValue <= numericFilter
            && rangeValue.maxValue >= numericFilter;
    }

    if (shouldUseRangeMatch && isRangeLikeValue(normalizedFilter)) {
        const rangeValue = parseRangeColumn(value);
        const filterRange = parseRangeColumn(normalizedFilter);

        return Boolean(rangeValue && filterRange) && rangesOverlap(rangeValue, filterRange);
    }

    return normalizedValue.includes(normalizedFilter);
}

function getInputValue(event) {
    return event?.currentTarget?.value ?? event?.target?.value ?? "";
}

function getChoiceListValue(event) {
    const values = event?.currentTarget?.values
        ?? event?.target?.values
        ?? event?.detail?.values
        ?? event?.detail?.value
        ?? event?.currentTarget?.value
        ?? event?.target?.value
        ?? [];

    return Array.isArray(values) ? values[0] || "" : values;
}

function normalizeAttachmentMode(value) {
    const normalizedValue = normalizeFilterText(value);

    if (["product", "products"].includes(normalizedValue)) {
        return "PRODUCT";
    }

    if (["collection", "collections"].includes(normalizedValue)) {
        return "COLLECTION";
    }

    return "";
}

export async function action({request}) {
    const { admin } = await authenticate.admin(request);
    const { createField, editField, deleteField, reorderFields} = await import("../utils/fields.server");
    const { deleteRow, getRows } = await import("../utils/rows.server");
    const { syncStorefrontConfig } = await import("../utils/storefrontConfig.server");
    const prisma = (await import("../db.server.js")).default;
    const formData = await request.formData();
    const target = formData.get('target');
    const shopId = formData.get('shopId');

    try {
        if(target === 'field'){
            const type = formData.get('type');
            const field = formData.get('field');
            let fields;

            if(type === 'add'){
                const newField = JSON.parse(field);
                fields = await createField({admin, shopId, field: newField});
            }else if(type === 'edit'){
                const newField = JSON.parse(field);
                fields = await editField({admin, shopId, field: newField});
            }else if(type === 'delete'){
                fields = await deleteField({admin, shopId, field });
            }else if(type === 'reorder'){
                const fieldIds = JSON.parse(field);
                fields = await reorderFields({shopId, fieldIds});
            } else {
                throw new Error("Wrong type submitted to field target");
            }

            await syncStorefrontConfig(admin, shopId);
            const rows = await getRows({ shopId });
            return { success: true, fields, rows };
        }

        if (target === "row") {
            const type = formData.get("type");

            if (type === "delete") {
                const rowId = formData.get("rowId");
                await deleteRow({ admin, shopId, rowId });
                await syncStorefrontConfig(admin, shopId);

                return { success: true, deletedRowId: rowId };
            }

            if (type === "clear") {
                const rows = await prisma.searchRow.findMany({
                    where: { shopId },
                    include: { attachments: true },
                });

                for (const row of rows) {
                    await deleteRow({ admin, shopId, rowId: row.id });
                }

                await syncStorefrontConfig(admin, shopId);
                return { success: true, cleared: true };
            }

            throw new Error("Wrong type submitted to row target");
        }

        throw new Error("Wrong target submitted");
    } catch (error) {
        console.error("Database action failed", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Something went wrong",
        };
    }
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
    const { getFields, getRangeFieldLimit } = await import("../utils/fields.server");

    const shopData = await getShopData(admin);

    const fields = await getFields({admin, shopId: shopData.id});
    const rows = await getRows({admin, shopId: shopData.id});
    const rangeFieldLimit = getRangeFieldLimit();
    const currentRangeFieldCount = fields.filter((field) => field.type === "RANGE").length;

    return {
        fields,
        rows,
        shopData,
        rangeFieldLimit,
        currentRangeFieldCount,
    };
}

export default function Database() {
    // default page loading spinner start
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    // default page loading spinner end

    // managing data from loader start 
    const {
        fields: loadedFields,
        rows: loadedRows,
        shopData,
        rangeFieldLimit,
        currentRangeFieldCount,
    } = useLoaderData();
    const [fields, setFields] = useState(loadedFields);
    const [rows, setRows] = useState(loadedRows);
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
    const [fieldFilters, setFieldFilters] = useState({});
    const [attachmentFilter, setAttachmentFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
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
        if (event.target === "row") {
            const type = event.value.type;
            const rowId = event.value.data;

            setPendingFieldAction({
                type: `row-${type}`,
                fieldId: rowId,
            });

            const formData = new FormData();
            formData.append("target", "row");
            formData.append("type", type);
            formData.append("shopId", shopData.id);

            if (rowId) {
                formData.append("rowId", rowId);
            }

            fetcher.submit(formData, {
                method: "post",
                action: "/app/database",
            });
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
    const filteredRows = useMemo(() => (rows || []).filter((row) => {
        const fieldsMatch = fields.every((field) => valueMatchesFieldFilter({
            field,
            value: row?.columns?.[field.id] || "",
            filterValue: fieldFilters[field.id],
        }));

        if (!fieldsMatch) {
            return false;
        }

        const selectedAttachmentMode = normalizeAttachmentMode(attachmentFilter);

        return !selectedAttachmentMode
            || normalizeAttachmentMode(row?.attachmentMode || row?.role) === selectedAttachmentMode;
    }), [rows, fields, fieldFilters, attachmentFilter]);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
    const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const paginatedRows = filteredRows.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
    const visibleStart = filteredRows.length > 0 ? pageStartIndex + 1 : 0;
    const visibleEnd = Math.min(pageStartIndex + paginatedRows.length, filteredRows.length);
    const normalizedAttachmentFilter = normalizeAttachmentMode(attachmentFilter);
    const hasAttachmentFilter = Boolean(normalizedAttachmentFilter);
    const hasFilters = Boolean(
        hasAttachmentFilter
        || Object.values(fieldFilters).some((filterValue) => normalizeFilterText(filterValue)),
    );
    const handleFieldFilterChange = ({ fieldId, value }) => {
        setFieldFilters((currentFilters) => {
            const nextFilters = { ...currentFilters };

            if (normalizeFilterText(value)) {
                nextFilters[fieldId] = value;
            } else {
                delete nextFilters[fieldId];
            }

            return nextFilters;
        });
        setCurrentPage(1);
    };
    const clearFieldFilter = (fieldId) => {
        setFieldFilters((currentFilters) => {
            const nextFilters = { ...currentFilters };
            delete nextFilters[fieldId];
            return nextFilters;
        });
        setCurrentPage(1);
    };
    const handleAttachmentFilterChange = (value) => {
        setAttachmentFilter(normalizeAttachmentMode(value));
        setCurrentPage(1);
    };
    const clearAttachmentFilter = () => {
        setAttachmentFilter("");
        setCurrentPage(1);
    };
    const clearAllTableFilters = () => {
        setFieldFilters({});
        setAttachmentFilter("");
        setCurrentPage(1);
    };
    const handlePreviousPage = () => {
        setCurrentPage((page) => Math.max(1, page - 1));
    };
    const handleNextPage = () => {
        setCurrentPage((page) => Math.min(totalPages, page + 1));
    };
    // handling callback response from field modal & updating end
    useEffect(() => {
        const fieldIds = new Set(fields.map((field) => field.id));

        setFieldFilters((currentFilters) => {
            const nextFilters = Object.fromEntries(
                Object.entries(currentFilters).filter(([fieldId]) => fieldIds.has(fieldId)),
            );

            return Object.keys(nextFilters).length === Object.keys(currentFilters).length
                ? currentFilters
                : nextFilters;
        });
    }, [fields]);
    useEffect(() => {
        setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
    }, [totalPages]);
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data) {
            if (fetcher.data.error) {
                shopify.toast.show(fetcher.data.error, {
                    isError: true,
                    duration: 4000,
                });
                setPendingFieldAction(null);
                setSaveProgress(false);
                return;
            }

            if (fetcher.data.fields) {
                setFields(fetcher.data.fields);
            }
            if (fetcher.data.rows) {
                setRows(fetcher.data.rows);
            }
            if (fetcher.data.deletedRowId) {
                setRows((currentRows) => currentRows.filter((row) => row.id !== fetcher.data.deletedRowId));
            }
            if (fetcher.data.cleared) {
                setRows([]);
            }
            if (pendingFieldAction) {
                setSaveProgress(false);

                if (!["delete", "reorder", "row-delete", "row-clear"].includes(pendingFieldAction.type)) {
                    shopify.modal.hide("field-modal");
                }

                const message = pendingFieldAction.type === "add"
                    ? "Field saved successfully"
                    : pendingFieldAction.type === "edit"
                        ? "Field updated successfully"
                        : pendingFieldAction.type === "delete"
                            ? "Field deleted successfully"
                            : pendingFieldAction.type === "row-delete"
                                ? "Row deleted successfully"
                                : pendingFieldAction.type === "row-clear"
                                    ? "Database cleared successfully"
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
                rangeFieldLimit={rangeFieldLimit}
                currentRangeFieldCount={fields.filter((field) => field.type === "RANGE").length || currentRangeFieldCount}
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
                                <s-button icon="plus-circle" href="/app/database/add">Add search entry</s-button>
                                <s-button icon="delete" tone="critical" onClick={() => handleUpdate({ target: "row", value: { type: "clear", data: null } })}>Clear database</s-button>
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
                                <s-divider/>
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
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-button variant="primary" tone="critical">Delete selected</s-button>
                        <s-button variant="primary" href="/app/database/add">Add search entry</s-button>
                    </s-stack>
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
                                {fields.map((field) => {
                                    const filterValue = fieldFilters[field.id] || "";
                                    const hasFieldFilter = Boolean(normalizeFilterText(filterValue));

                                    return (
                                    <s-table-header key={field.id}>
                                        <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                            {field.label}
                                            <s-button
                                                variant="tertiary"
                                                icon={hasFieldFilter ? "filter-active" : "filter"}
                                                commandFor={`filter_${field.id}`}
                                                command="--toggle"
                                            />
                                            <s-popover id={`filter_${field.id}`} inlineSize="220px">
                                                <s-grid padding="base" gap="small" gridTemplateColumns="170px">
                                                    <s-text-field
                                                        label=""
                                                        placeholder={`Filter ${field.label}...`}
                                                        autocomplete="off"
                                                        value={filterValue}
                                                        onInput={(event) => handleFieldFilterChange({ fieldId: field.id, value: getInputValue(event) })}
                                                        onChange={(event) => handleFieldFilterChange({ fieldId: field.id, value: getInputValue(event) })}
                                                    />
                                                    <s-button
                                                        variant="secondary"
                                                        disabled={!hasFieldFilter}
                                                        onClick={() => clearFieldFilter(field.id)}
                                                    >
                                                        <div style={{width: "146px", textAlign: "center"}}>Clear filter</div>
                                                    </s-button>
                                                </s-grid>
                                            </s-popover>
                                        </s-grid>
                                    </s-table-header>
                                    );
                                })}
                                <s-table-header>
                                    <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                        Attachment
                                        <s-button
                                            variant="tertiary"
                                            icon={hasAttachmentFilter ? "filter-active" : "filter"}
                                            commandFor="filter_attachment"
                                            command="--toggle"
                                        />
                                        <s-popover id="filter_attachment" inlineSize="220px">
                                            <s-grid padding="base" gap="small" gridTemplateColumns="170px">
                                                <s-choice-list
                                                    label="Attachment type"
                                                    name="attachment-filter"
                                                    values={normalizedAttachmentFilter ? [normalizedAttachmentFilter] : []}
                                                    onInput={(event) => handleAttachmentFilterChange(getChoiceListValue(event))}
                                                    onChange={(event) => handleAttachmentFilterChange(getChoiceListValue(event))}
                                                >
                                                    <s-choice
                                                        value="PRODUCT"
                                                        selected={normalizedAttachmentFilter === "PRODUCT"}
                                                        onClick={() => handleAttachmentFilterChange("PRODUCT")}
                                                    >
                                                        Products
                                                    </s-choice>
                                                    <s-choice
                                                        value="COLLECTION"
                                                        selected={normalizedAttachmentFilter === "COLLECTION"}
                                                        onClick={() => handleAttachmentFilterChange("COLLECTION")}
                                                    >
                                                        Collections
                                                    </s-choice>
                                                </s-choice-list>
                                                <s-button
                                                    variant="secondary"
                                                    disabled={!hasAttachmentFilter}
                                                    onClick={clearAttachmentFilter}
                                                >
                                                    <div style={{width: "146px", textAlign: "center"}}>Clear filter</div>
                                                </s-button>
                                            </s-grid>
                                        </s-popover>
                                    </s-grid>
                                </s-table-header>
                                <s-table-header>
                                    <s-stack alignItems="end">
                                        <s-icon type="menu" />
                                    </s-stack>
                                </s-table-header>
                            </s-table-header-row>

                            <s-table-body>
                                {paginatedRows.map((row, index) => (
                                    <s-table-row key={row.id}>
                                        <s-table-cell>
                                            <s-grid gridTemplateColumns="30px 1fr">
                                                <div style={{ padding: "0 5px" }}>{pageStartIndex + index + 1}</div>
                                                <s-checkbox value={row?.id} />
                                            </s-grid>
                                        </s-table-cell>
                                        {fields.map((field) => (
                                            <s-table-cell key={field.id}>
                                                {row?.columns?.[field.id] || ""}
                                            </s-table-cell>
                                        ))}
                                        <s-table-cell>
                                            <s-clickable href={`/app/database/edit/${row.id}`}>
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
                                                        <s-button icon="edit" href={`/app/database/edit/${row.id}`}>Edit row</s-button>
                                                        {/* <s-button icon="duplicate">Duplicate row</s-button> */}
                                                    </s-section>
                                                    <s-button tone="critical" icon="delete" onClick={() => handleUpdate({ target: "row", value: { type: "delete", data: row.id } })}>Delete row</s-button>
                                                </s-menu>
                                            </s-stack>
                                        </s-table-cell>
                                    </s-table-row>
                                ))}
                            </s-table-body>
                        </s-table>
                        <s-stack background="subdued" border="base" borderWidth="base none none none" direction="inline" justifyContent="center" alignItems="center" gap="small" padding="small">
                            <s-button
                                variant="secondary"
                                icon="arrow-left"
                                disabled={currentPage <= 1}
                                onClick={handlePreviousPage}
                            />
                            <s-text>Page {currentPage} of {totalPages}</s-text> /
                            <s-text>{visibleStart}-{visibleEnd} of {filteredRows.length}</s-text>
                            {hasFilters && (
                                <s-button variant="tertiary" onClick={clearAllTableFilters}>
                                    Clear filters
                                </s-button>
                            )}
                            <s-button
                                variant="secondary"
                                icon="arrow-right"
                                disabled={currentPage >= totalPages || filteredRows.length === 0}
                                onClick={handleNextPage}
                            />
                        </s-stack>
                        {rows?.length === 0 && (
                            <div style={{background: "#fff"}}>
                                <s-stack padding="small" alignItems="center">
                                    No entries
                                </s-stack>
                            </div>
                        )}
                        {rows?.length > 0 && filteredRows.length === 0 && (
                            <div style={{background: "#fff"}}>
                                <s-stack padding="small" alignItems="center">
                                    No matching entries
                                </s-stack>
                            </div>
                        )}
                    </s-stack>
                </s-stack>
            </s-stack>
        </s-page>
    )
}
