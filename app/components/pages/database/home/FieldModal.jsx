import { useState } from "react";

export default function FieldModal({
    handleCancel,
    handleSave,
    type,
    data
}) {
    const [saveProcess, setSaveProcess] = useState(false);
    const modalSave = () => {
        setSaveProcess(true);
        setTimeout(() => {
            setSaveProcess(false);
        }, 10000);
        // handleSave();
    }
    return (
        <s-modal id="field-modal" heading="Add new field" open={false} onClose={handleCancel}>
            <s-stack gap="large">
                <s-select
                    label="Column type"
                    // details="You can’t add more range fields"
                >
                    <s-option value="select">Select</s-option>
                    <s-option value="range">Range</s-option>
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
            {saveProcess ? (
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
            <s-button slot="secondary-actions" commandFor="field-modal" command="--hide">
                Close
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                // commandFor="field-modal"
                // command="--hide"
                onClick={modalSave}
            >
                Save
            </s-button>
        </s-modal>
    )
}