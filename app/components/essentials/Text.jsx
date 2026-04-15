export default function Text({ as = "h2", children }) {
    const style = { margin: "0", padding: "5px 0", fontWeight: "600" };
    return (
        <>
            {as === "h1" && (
                <h1 style={style}>{children}</h1>
            )}
            {as === "h2" && (
                <h2 style={style}>{children}</h2>
            )}
            {as === "h3" && (
                <h3 style={style}>{children}</h3>
            )}
            {as === "h4" && (
                <h4 style={style}>{children}</h4>
            )}
            {as === "h5" && (
                <h5 style={style}>{children}</h5>
            )}
            {as === "h6" && (
                <h6 style={style}>{children}</h6>
            )}
        </>
    )
}