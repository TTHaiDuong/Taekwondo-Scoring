import { useEffect, useRef, useState } from "react"

export function useWebSocket<SendType = any, ReceiveType = any>(url: string) {
    const wsRef = useRef<WebSocket | null>(null)
    const [messages, setMessages] = useState<ReceiveType>()
    const [isConnected, setIsConnected] = useState(false)
    const isCleaningUp = useRef(false)

    useEffect(() => {
        if (isCleaningUp.current) return

        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => setIsConnected(true)
        ws.onmessage = (event) => {
            try {
                setMessages(JSON.parse(event.data) as ReceiveType)
            } catch {
                setMessages(event.data as unknown as ReceiveType)
            }
        }
        ws.onclose = () => setIsConnected(false)
        ws.onerror = (err) => console.error("WebSocket error:", err)

        return () => {
            isCleaningUp.current = true   // 🔥 báo hiệu đang cleanup
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }
            setTimeout(() => {
                isCleaningUp.current = false
            }, 100)
        }
    }, [url])

    function sendMessage(data: SendType) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data))
        }
    }

    return { messages, sendMessage, isConnected }
}
