/* eslint-disable react/prop-types */
import { useState } from "react";

export default function ButtonTertiary({ children, isDragging = false, style = {}, ...props }) {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <div
            {...props}
            style={{
                cursor: isDragging ? "grabbing" : "grab",
                background: isHovered || isDragging ? '#f1f8ff' : '#fff',
                padding: '4px 5px',
                borderRadius: '4px',
                touchAction: "none",
                userSelect: "none",
                ...style,
            }}
            onMouseEnter={()=> setIsHovered(true)}
            onMouseLeave={()=> setIsHovered(false)}
        >
            <div style={{
                transform: 'scale(0.9)'
            }}>
                <s-icon type="drag-handle" />
                {children}
            </div>
        </div>
    );
}
