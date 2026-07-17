// layout.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Operator",
};

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}