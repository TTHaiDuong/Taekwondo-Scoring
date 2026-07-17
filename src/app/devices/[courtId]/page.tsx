"use client"

import { useParams } from "next/navigation";
import "@/styles/devices.css"

import { useRouter } from "next/navigation";

// Div truy cập máy bấm điểm
// Div truy cập máy chủ sân
// Div truy cập bảng điểm
export default function Home() {
    const params = useParams<{ courtId: string }>();
    const router = useRouter()

    return (
        <div className="root w-screen h-screen">
            <div className="header">
                <div onClick={() => router.back()}>Return</div>
            </div>
            <div className="body">
                <div onClick={() => router.push("/tracking")} className="card">Bảng điểm</div>
                <div onClick={() => router.push("/control")} className="card">Máy chủ</div>
                <div onClick={() => router.push("/judge")} className="card">Máy bấm điểm 0/3</div>
            </div>
        </div>
    )
}
