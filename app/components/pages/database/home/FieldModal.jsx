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
            {saveProcess ? (
                <>
                    <style>{`
                        .modal__overlay {
                            --x: 0px;
                            --top: 45px;
                            --bottom: 61px;
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
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#FFFFFF"
                    }}>
                        <s-spinner size="large" />
                    </div>
                </>
            ) : null}
            <>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
                <s-paragraph>Displaying more details here.</s-paragraph>
            </>
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