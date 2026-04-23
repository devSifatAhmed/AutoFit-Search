import { useEffect, useState } from "react";
import { Select, Range } from "../../../../func/fields";
import { Modal, TitleBar } from "@shopify/app-bridge-react";
export default function FieldModal({
    type,
    data,
    handleUpdate,
    saveProgress
}) {
    const [fieldType, setFieldType] = useState(null);
    const [field, setField] = useState(null);
    useEffect(() => {
        setFieldType(data ? data.type : "select");
        setField(data ? data : Select);
    }, [data]);
    const [isChanged, setIsChanged] = useState(true);
    useEffect(() => {
        if (data) {
            setIsChanged(JSON.stringify(data) === JSON.stringify(field));
        }
    }, [field]);
    // working on field options state management and handlers, will add soon

    const handleSave = () => {
        handleUpdate({type, data: field});
    }
    return (
        <Modal id="field-modal">
            <TitleBar title={type === "add" ? "Add new field" : "Edit field"} />
            <s-stack padding="base">
                <s-stack gap="large">
                    <s-select
                        label="Column type"
                        // details="You can’t add more range fields"
                        disabled={type === "edit"}
                        onChange={(e) => {setFieldType(e.target.value); setField({...field, type: e.target.value})}}
                    >
                        <s-option value="select" selected={fieldType === "select"}>Select</s-option>
                        <s-option value="range" selected={fieldType === "range"}>Range</s-option>
                    </s-select>
                    <s-grid gridTemplateColumns="2fr 1fr" gap="base" alignItems="center">
                        <s-select
                            label="Label visibility"
                            defaultValue={field?.labelVisibility || "visible"}
                            onChange={(e) => setField({...field, labelVisibility: e.target.value})}
                        >
                            <s-option value="visible" selected={field?.labelVisibility === "visible"}>Visible</s-option>
                            <s-option value="hidden" selected={field?.labelVisibility === "hidden"}>Hidden</s-option>
                        </s-select>
                        <s-select
                            label="Sort Order"
                            defaultValue={field?.sortOrder || "a-z"}
                            onChange={(e) => setField({...field, sortOrder: e.target.value})}
                        >
                            <s-option value="a-z" selected={field?.sortOrder === "a-z"}>Alphabatically (A-Z)</s-option>
                            <s-option value="z-a" selected={field?.sortOrder === "z-a"}>Alphabatically (Z-A)</s-option>
                            <s-option value="db-order" selected={field?.sortOrder === "db-order"}>Custom (according to DB order)</s-option>
                        </s-select>
                    </s-grid>
                    {fieldType === "range" && (
                        <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
                            <s-number-field
                                label="Values from"
                                defaultValue={field?.values?.start || 1970}
                                max={field?.values?.end || 2026}
                                min={field?.values?.start || 1970}
                                onChange={(e) => setField({...field, values: {...field.values, start: parseInt(e.target.value)}})}
                            />
                            <s-number-field
                                label="Values to"
                                defaultValue={field?.values?.end || 2026}
                                max={field?.values?.end || 2026}
                                min={field?.values?.start || 1970}
                                onChange={(e) => setField({...field, values: {...field.values, end: parseInt(e.target.value)}})}
                            />
                        </s-grid>
                    )}
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
                        <s-text-field
                            label="Label"
                            defaultValue={field?.label || ""}
                            onChange={(e) => setField({...field, label: e.target.value})}
                        />
                        <s-text-field
                            label="Placeholder"
                            defaultValue={field?.placeholder || ""}
                            onChange={(e) => setField({...field, placeholder: e.target.value})}
                        />
                    </s-grid>
                </s-stack>
                {/* saving progress overlay start */}
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
                {/* saving progress overlay end */}
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
                        disabled={isChanged}
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
    )
}
{/* <s-modal id="field-modal" >

</s-modal> */}