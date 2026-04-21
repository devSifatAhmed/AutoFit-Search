import { useEffect, useState } from "react";
import { Select, Range } from "../../../../func/fields";
export default function FieldModal({
    type,
    data,
    handleUpdate
}) {
    const [fieldType, setFieldType] = useState(null);
    const [field, setField] = useState(null);
    const [saveProgress, setSaveProgress] = useState(false);
    const modalSave = () => {
        setSaveProgress(true);
        setTimeout(() => {
            setSaveProgress(false);
        }, 10000);
    }
    useEffect(() => {
        if (type === "add") {
            setFieldType("select");
            setField(Select);
        } else if (type === "edit") {
            setFieldType(data.type);
            setField(data);
        }
    }, [type, data]);
    useEffect(() => {
        setTimeout(() => {
            console.clear();
            console.log("field type", fieldType);
            console.log("field data", field);
        }, 1000);
    }, [fieldType, field]);
    const handleFieldChange = (e) => {
        setFieldType(e.target.value);
        if (e.target.value === "select") {
            setField(Select);
        } else if (e.target.value === "range") {
            setField(Range);
        }
    }

    // working on field options state management and handlers, will add soon
    return (
        <s-modal id="field-modal" heading={type === "add" ? "Add new field" : "Edit field"}>
            <s-stack gap="large">
                <s-select
                    label="Column type"
                    // details="You can’t add more range fields"
                    onChange={handleFieldChange}
                    disabled={type === "edit"}
                >
                    <s-option value="select" selected={fieldType === "select"}>Select</s-option>
                    <s-option value="range" selected={fieldType === "range"}>Range</s-option>
                </s-select>
                <s-grid gridTemplateColumns="2fr 1fr" gap="base" alignItems="center">
                    <s-select
                        label="Label visibility"
                    >
                        <s-option value="visible">Visible</s-option>
                        <s-option value="hidden">Hidden</s-option>
                    </s-select>
                    <s-select
                        label="Sort Order"
                    >
                        <s-option value="a-z">Alphabatically (A-Z)</s-option>
                        <s-option value="z-a">Alphabatically (Z-A)</s-option>
                        <s-option value="db-order">Custom (according to DB order)</s-option>
                    </s-select>
                </s-grid>
                <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
                    <s-text-field
                        label="Label"
                        defaultValue="Title"
                    />
                    <s-text-field
                        label="Placeholder"
                    />
                </s-grid>
            </s-stack>
            {saveProgress ? (
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
                        top: "var(--top)",
                        left: "var(--x)",
                        width: "calc(100% - var(--x) * 2)",
                        height: "calc(100% - var(--top) - var(--bottom))",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#FFFFFF",
                        gap: "7px",
                    }}>
                        <s-spinner size="large-100" />
                        <s-text>Saving<span className="dots"></span></s-text>
                    </div>
                </>
            ) : null}
            <s-button slot="secondary-actions" commandFor="field-modal" command="--hide" disabled={saveProgress}>
                Cancel
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                onClick={modalSave}
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
        </s-modal>
    )
}