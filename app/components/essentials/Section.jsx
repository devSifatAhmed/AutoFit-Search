export default function Section({
    children
}) {
    return (
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "#00000009 0px 4px 10px -5px", border: "1px solid #dddddd96", overflow: "hidden" }}>
            {children}
        </div>
    )
}