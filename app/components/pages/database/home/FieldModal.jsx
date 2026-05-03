/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Select, Range } from "../../../../func/fields";
import { Modal, TitleBar } from "@shopify/app-bridge-react";
import { motion } from "framer-motion";

const cloneField = (template) => structuredClone(template);

const getDefaultField = (type) => cloneField(type === "SELECT" ? Select : Range);

const normalizeField = (rawField) => {
    if (!rawField) {
        return null;
    }

    const normalizedField = cloneField(rawField);

    if (!normalizedField.visibility && normalizedField.labelVisibility) {
        normalizedField.visibility = normalizedField.labelVisibility;
    }

    if (!normalizedField.sortOrder && normalizedField.sortby) {
        normalizedField.sortOrder = normalizedField.sortby;
    }

    if (normalizedField.type === "RANGE" && !normalizedField.rangeStart) {
        normalizedField.rangeStart = cloneField(Range.rangeStart);
    }

    if (normalizedField.type === "RANGE" && !normalizedField.rangeEnd) {
        normalizedField.rangeEnd = cloneField(Range.rangeEnd);
    }

    delete normalizedField.labelVisibility;
    delete normalizedField.sortby;
    delete normalizedField.values;

    return normalizedField;
};

export default function FieldModal({
    type,
    data,
    handleUpdate,
    saveProgress,
    loadingProgress
}) {
    const [fieldType, setFieldType] = useState(data?.type || "RANGE");
    const [field, setField] = useState(() => (data ? normalizeField(data) : getDefaultField("RANGE")));

    useEffect(() => {
        const nextFieldType = data?.type || "RANGE";
        setFieldType(nextFieldType);
        setField(data ? normalizeField(data) : getDefaultField(nextFieldType));
    }, [data, type]);

    const initialField = data ? normalizeField(data) : getDefaultField(fieldType);
    const isPristine = type === "add"
        ? true
        : JSON.stringify(field) === JSON.stringify(initialField);
    const isSaveDisabled = saveProgress || (type === "edit" && isPristine);

    const changeHandler = ({ target: { name, value } }) => {
        setField((currentField) => ({
            ...currentField,
            [name]: value,
        }));
    };

    const handleFieldTypeChange = (nextType) => {
        setFieldType(nextType);
        setField((currentField) => {
            const nextField = getDefaultField(nextType);

            return {
                ...nextField,
                label: currentField?.label || nextField.label,
                placeholder: currentField?.placeholder || nextField.placeholder,
                visibility: currentField?.visibility || nextField.visibility,
                sortOrder: currentField?.sortOrder || nextField.sortOrder,
            };
        });
    };

    const handleSave = () => {
        handleUpdate({ target: 'field', value: { type, data: field } });
    };

    return (
        <Modal id="field-modal">
            <TitleBar title={type === "add" ? "Add new field" : "Edit field"} />
            <s-stack padding="base">
                <s-stack gap="large">
                    <s-select
                        label="Column type"
                        disabled={type === "edit"}
                        value={fieldType}
                        onChange={(e) => handleFieldTypeChange(e.target.value)}
                    >
                        <s-option value="SELECT">Select</s-option>
                        <s-option value="RANGE">Range</s-option>
                    </s-select>
                    <s-grid gridTemplateColumns="2fr 1fr" gap="base" alignItems="center">
                        <s-select
                            label="Label visibility"
                            value={field?.visibility || "VISIBLE"}
                            onChange={(e) => changeHandler({ target: { name: "visibility", value: e.target.value } })}
                        >
                            <s-option value="VISIBLE">Visible</s-option>
                            <s-option value="HIDDEN">Hidden</s-option>
                        </s-select>
                        <s-select
                            label="Sort Order"
                            value={field?.sortOrder || "A_Z"}
                            onChange={(e) => changeHandler({ target: { name: "sortOrder", value: e.target.value } })}
                        >
                            <s-option value="A_Z">Alphabatically (A-Z)</s-option>
                            <s-option value="Z_A">Alphabatically (Z-A)</s-option>
                            <s-option value="DB_ORDER">Custom (according to DB order)</s-option>
                        </s-select>
                    </s-grid>
                    <motion.div
                        initial={false}
                        animate={{
                            display: fieldType === "RANGE" ? "block" : "none"
                        }}
                        style={{ overflow: "hidden" }}
                        transition={{ duration: 0 }}
                    >
                        <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
                            <s-grid-item>
                                <s-number-field
                                    label="Values from"
                                    value={field?.rangeStart || 1970}
                                    max={field?.rangeEnd || 2026}
                                    min={1970}
                                    onChange={(e) => changeHandler({
                                        target: {
                                            name: "rangeStart",
                                            value: parseInt(e.target.value, 10)
                                        }
                                    })}
                                />
                            </s-grid-item>
                            <s-grid-item>
                                <s-number-field
                                    label="Values to"
                                    value={field?.rangeEnd || 2026}
                                    max={2026}
                                    min={field?.rangeStart || 1970}
                                    onChange={(e) => changeHandler({
                                        target: {
                                            name: "rangeEnd",
                                            value: parseInt(e.target.value, 10)
                                        }
                                    })}
                                />
                            </s-grid-item>
                        </s-grid>
                    </motion.div>
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
                        <s-text-field
                            label="Label"
                            value={field?.label || ""}
                            onInput={(e) => changeHandler({ target: { name: "label", value: e.target.value } })}
                        />
                        <s-text-field
                            label="Placeholder"
                            value={field?.placeholder || ""}
                            onInput={(e) => changeHandler({ target: { name: "placeholder", value: e.target.value } })}
                        />
                    </s-grid>
                </s-stack>
                <>
                    <style>{`
                        .modal__overlay {
                            --x: 0px;
                            --top: 45px;
                            --bottom: 61px;
                        }
                        .dots{
                            min-width: 12px;
                            display: inline-block;
                        }
                        .dots::after {
                            content: "";
                            animation: typing 1.5s steps(4, end) infinite;
                        }
                        @keyframes typing {
                            0% {
                                content: ".";
                            }
                            25% {
                                content: "..";
                            }
                            50% {
                                content: "...";
                            }
                            75% {
                                content: "..";
                            }
                            100% {
                                content: ".";
                            }
                        }
                    `}
                    </style>
                    <div className="modal__overlay" style={{
                        position: "absolute",
                        top: 0,
                        left: "var(--x)",
                        width: "calc(100% - var(--x) * 2)",
                        height: "calc(100% - var(--bottom))",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#FFFFFF",
                        gap: "7px",
                        pointerEvents: `${saveProgress ? "all" : "none"}`,
                        opacity: `${saveProgress ? 1 : 0}`,
                    }}>
                        <s-spinner size="large-100" />
                        <s-text>Saving<span className="dots"></span></s-text>
                    </div>
                </>
                <>
                    <style>{`
                        .modal__overlay {
                            --x: 0px;
                            --top: 45px;
                            --bottom: 61px;
                        }
                        .dots{
                            min-width: 12px;
                            display: inline-block;
                        }
                        .dots::after {
                            content: "";
                            animation: typing 1.5s steps(4, end) infinite;
                        }
                        @keyframes typing {
                            0% {
                                content: ".";
                            }
                            25% {
                                content: "..";
                            }
                            50% {
                                content: "...";
                            }
                            75% {
                                content: "..";
                            }
                            100% {
                                content: ".";
                            }
                        }
                    `}
                    </style>
                    <div className="modal__overlay" style={{
                        position: "absolute",
                        top: 0,
                        left: "var(--x)",
                        width: "calc(100% - var(--x) * 2)",
                        height: "calc(100% - var(--bottom))",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#FFFFFF",
                        gap: "7px",
                        pointerEvents: `${loadingProgress ? "all" : "none"}`,
                        opacity: `${loadingProgress ? 1 : 0}`,
                    }}>
                        <s-spinner size="large-100" />
                        <s-text>Loading<span className="dots"></span></s-text>
                    </div>
                </>
            </s-stack>
            <s-divider />
            <s-stack padding="base">
                <s-stack direction="inline" justifyContent="end" gap="small">
                    <s-button
                        variant="secondary"
                        disabled={saveProgress}
                        onClick={() => {
                            shopify.modal.hide("field-modal");
                        }}
                    >
                        Cancel
                    </s-button>
                    <s-button
                        variant="primary"
                        onClick={handleSave}
                        disabled={isSaveDisabled}
                    >
                        {type === "add" ? (
                            <>
                                {saveProgress ? "Saving" : "Add field"}
                            </>
                        ) : (
                            <>
                                {saveProgress ? "Updating" : "Save changes"}
                            </>
                        )}
                    </s-button>
                </s-stack>
            </s-stack>
        </Modal>
    );
}
