import { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import { measureFontSize } from "@/utils/measuring-font-size"
import { StyleProps } from "@/utils/types"

type FitTextProps = StyleProps & {
    // Phần tử con chỉ được là văn bản hoặc là số
    children?: string | number | any
    // Khi có các AutoFitText độ dài văn bản khác nhau sử dụng để thu phóng các văn bản đó cùng một tỉ lệ
    virtualText?: string
    // Tỉ lệ thu phóng văn bản, mặc định là 1
    scale?: number
    // Nếu để `undefined`, sẽ tự động điều chỉnh kích thước chữ theo chiều ngang và chiều dọc
    // Nếu `true`, sẽ chỉ giới hạn theo một hướng
    fitDirection?: FitTextDirection
    // Kiểu tràn văn bản
    useEllipses?: boolean
    id?: string

    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}

// Dùng để hiển thị văn bản tự động điều chỉnh kích thước chữ để phù hợp với không gian chứa
const FitText = forwardRef<HTMLElement, FitTextProps>(({ useEllipses = true, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [fontSize, setFontSize] = useState<number>(0)

    // Hàm để tính toán kích thước chữ phù hợp với không gian chứa
    const handleResize = useCallback(() => {
        const container = containerRef.current
        if (!container || props.children === undefined) return

        const containerWidth = container.clientWidth * (props.scale || 1)

        const horizontalStretch = measureFontSize(
            props.virtualText || props.children.toString(),
            containerWidth,
            container
        )
        const verticalStretch = container.clientHeight * (props.scale || 1)

        // Nếu như fitDirection là undefined, kích thước chữ bằng kích thước nhỏ nhất giữa chiều ngang và chiều dọc
        // Nếu fitDirection là "vertical", kích thước chữ bằng kích thước chiều dọc
        // Trường hợp còn lại kích thước chữ bằng kích thước chiều ngang
        const newSize = !props.fitDirection ? Math.min(horizontalStretch, verticalStretch)
            : props.fitDirection === "vertical" ? verticalStretch : horizontalStretch

        setFontSize(newSize)
    }, [props.scale, props.children, props.fitDirection, props.virtualText])

    // Bắt sự kiện thay đổi kích thước của container và cập nhật kích thước chữ
    useEffect(() => {
        handleResize()

        const observer = new ResizeObserver(handleResize)
        if (containerRef.current) observer.observe(containerRef.current)

        return () => { observer.disconnect() }
    }, [handleResize])

    // Cập nhật ref nếu có
    useEffect(() => {
        if (ref instanceof Function) ref(containerRef.current)
        else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = containerRef.current
    }, [ref])

    return (
        <div
            id={props.id}
            ref={containerRef}
            className={
                "flex-center " +
                props.className
            }
            style={{
                fontSize: `${fontSize}px`,
                ...props.style
            }}
            onClick={props.onClick}
        >
            {/* Tại sao phải lồng thẻ p bên trong? 
                Để hiện dấu ... khi nội dung bị cắt. */}
            <div className={useEllipses ? "truncate" : undefined}>
                {props.children}
            </div>
        </div>
    )
})

export default FitText
export type FitTextDirection = "horizontal" | "vertical"
export type FitTextOverflow = "visible" | "hidden" | "clip"