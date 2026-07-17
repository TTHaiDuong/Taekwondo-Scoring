// layout.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Tracking",
};

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}