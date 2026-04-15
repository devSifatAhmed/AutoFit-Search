export default function Loader({
    text = "Loading...",
    size = "large"
}) {
    return (
        <div style={{ position: "absolute", top: "0", left: "0", right: "0", bottom: "0", height: "100%", width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", flexDirection: "column" }}>
            <s-spinner accessibilityLabel={text} size={size}></s-spinner>
            <s-text>{text}</s-text>
        </div>
    )
}