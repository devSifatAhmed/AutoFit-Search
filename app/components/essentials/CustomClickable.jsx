import { useEffect, useState } from "react";

export default function CustomClickable({ children, onClick, borderRadius = '0', padding = '0', background = 'subdued' }) {
    const [isHovered, setIsHovered] = useState(false);
    const [bgSet, setBgSet] = useState(false);
    useEffect(() => {
        if(background === 'subdued') {
            setBgSet({
                bg: '#fff',
                bgHover: '#f7f7f7'
            })
        }else if(background === 'strong'){
            setBgSet({
                bg: '#fff',
                bgHover: '#e2e2e2'
            })
        }else if(background === 'transparent'){
            setBgSet({
                bg: 'transparent',
                bgHover: 'transparent'
            })
        }else if(background !== 'subdued' && background !== 'strong' && background !== 'transparent' && background !== undefined){
            setBgSet({
                bg: background,
                bgHover: background
            })
        }        
    }, [background])
    return (
        <div
            onClick={()=> onClick()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                cursor: "pointer",
                background: isHovered ? bgSet.bgHover : bgSet.bg,
                padding: padding,
                borderRadius: borderRadius,
                touchAction: "none",
                userSelect: "none",
                overflow: "hidden"
            }}
        >
            {children}
        </div>
    )
}