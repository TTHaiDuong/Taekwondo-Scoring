import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
    title: "Judge",
}

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
}

export default function Layout({
    children,
}: {
    children: React.ReactNode
}) {
    return children
}