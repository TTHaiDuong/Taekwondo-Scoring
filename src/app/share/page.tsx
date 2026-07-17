"use client"

import { useEffect, useMemo, useState } from "react"
import { Oswald, JetBrains_Mono } from "next/font/google"
import QRCode from "react-qr-code"
import { getSingletonSocket } from "@/scripts/global-client-io"

// ============================================================
// TRANG CHIA SẺ KẾT NỐI — dùng ở bàn điều khiển/khu vực check-in trước
// giải đấu Taekwondo. Chia làm 4 nhóm, điều hướng bằng "đai" màu:
//   - Trắng  → Wi-Fi (hạ tầng, ai cũng cần trước tiên — như đai trắng nhập môn)
//   - Đỏ     → Điều khiển trận đấu (Operator/Bảng theo dõi)
//   - Đen    → Giám định (đai đen — vai trò giám khảo/trọng tài, tách riêng vì
//              đây là link chỉ giám khảo dùng, không nên lẫn vào nhóm điều khiển)
//   - Xanh   → Xem trận (VIR + Camera)
// Đỏ/xanh lấy đúng từ màu góc đấu (Hồng/Chung) trong luật Taekwondo,
// nên với người trong nghề, màu không cần chú thích cũng hiểu đúng ý.
// ============================================================

const display = Oswald({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-display" })
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" })

type GroupId = "wifi" | "control" | "judge" | "view"

type LinkItem = {
    label: string
    hint: string
    url: string
}

const GROUPS: { id: GroupId; label: string; belt: string; accent: string }[] = [
    { id: "wifi", label: "Wi-Fi", belt: "bg-[#EDEBE3]", accent: "text-[#14171C]" },
    { id: "control", label: "Điều khiển", belt: "bg-[#D6483A]", accent: "text-white" },
    { id: "judge", label: "Giám định", belt: "bg-[#25A7B0]", accent: "text-[#14171C]" },
    { id: "view", label: "Xem trận", belt: "bg-[#3A62D8]", accent: "text-white" },
]

export default function SharePage() {
    const [ip, setIp] = useState<string | null>(null)
    const [courtId, setCourtId] = useState("1")
    const [ssid, setSsid] = useState("Scoring Server")
    const [password, setPassword] = useState("12345678")
    const [active, setActive] = useState<GroupId>("wifi")

    useEffect(() => {
        getSingletonSocket().emit("localIp:get", (resolvedIp: string) => setIp(resolvedIp))
    }, [])

    const origin = useMemo(() => {
        if (typeof window === "undefined" || !ip) return null
        const port = window.location.port
        return {
            operator: `http://${ip}:${port}/operator?courtId=${courtId}`,
            judge: `http://${ip}:${port}/judge?courtId=${courtId}`,
            tracking: `https://${ip}/tracking?courtId=${courtId}`,
            camera: `https://${ip}/camera?courtId=${courtId}&cameraId=main`,
            ivr: `http://${ip}:${port}/ivr?courtId=${courtId}`
        }
    }, [ip, courtId])

    const wifiQR = `WIFI:T:WPA;S:${ssid};P:${password};H:false;;`

    const controlLinks: LinkItem[] = origin ? [
        { label: "Điều khiển", hint: "Điều khiển trận — nhập điểm, thời gian, luật", url: origin.operator },
        { label: "Bảng theo dõi", hint: "Màn hình theo dõi trận cho ban tổ chức", url: origin.tracking },
    ] : []

    const viewLinks: LinkItem[] = origin ? [
        { label: "Xem lại (IVR)", hint: "Xem trực tiếp + tua lại tình huống", url: origin.ivr },
        { label: "Camera", hint: "Thiết bị quay — mỗi máy tự đặt tên riêng", url: origin.camera },
    ] : []

    const activeGroup = GROUPS.find(g => g.id === active)!

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            switch (e.key) {
                case "1":
                    setActive("wifi")
                    break
                case "2":
                    setActive("control")
                    break
                case "3":
                    setActive("judge")
                    break
                case "4":
                    setActive("view")
                    break
            }
        }

        window.addEventListener("keydown", handleKeyDown)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
        }
    }, [])

    return (
        <div className={`${display.variable} ${mono.variable} h-dvh w-screen bg-[#14171C] text-[#F3F1EA] font-[family-name:var(--font-display)] flex flex-col overflow-hidden`}>

            {/* ── Thanh "đai" điều hướng nhóm ── */}
            <nav className="flex w-full shrink-0">
                {GROUPS.map(g => (
                    <button
                        key={g.id}
                        onClick={() => setActive(g.id)}
                        className={`relative flex-1 py-[6px] flex flex-col items-center justify-center gap-[6px]
                            transition-all duration-300 ${g.belt}
                            ${active === g.id ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                    >
                        <span className={`${g.accent} text-[1rem] tracking-[0.14em] uppercase font-semibold`}>
                            {g.label}
                        </span>
                        {/* Nút thắt đai — chấm đánh dấu nhóm đang chọn */}
                        <span className={`w-[10px] h-[10px] rounded-full border-2 ${active === g.id ? "border-current bg-current" : "border-current bg-transparent"} ${g.accent}`} />
                    </button>
                ))}
            </nav>

            {/* ── Nội dung nhóm đang chọn ── */}
            <main className="flex-1 min-h-0 overflow-y-auto">
                <div className="min-h-full flex flex-col items-center justify-start gap-[20px] py-[20px]">

                    {active !== "wifi" && (
                        <div className="flex items-center gap-[16px]">
                            <label className="text-[15px] tracking-[0.1em] uppercase text-[#8B93A1]">Sân</label>
                            <input
                                value={courtId}
                                onBlur={e => {
                                    if (!e.target.value)
                                        setCourtId("1")
                                }}
                                onChange={e => setCourtId(e.target.value.replace(/[^0-9]/g, ""))}
                                className="w-[80px] text-center bg-[#1C2028] border border-[#2A2F3A] rounded-[10px] py-[8px]
                                text-[22px] font-[family-name:var(--font-mono)] text-[#F3F1EA] outline-none focus:border-[#D6A643]"
                            />
                        </div>
                    )}

                    {active === "wifi" && (
                        <div className="flex-1 flex-center">
                            <Card beltColor="#EDEBE3" title="Wi-Fi" qrValue={wifiQR}>
                                <Field label="Tên mạng" value={ssid} onChange={setSsid} mono align="left" />
                                <Field label="Mật khẩu" value={password} onChange={setPassword} mono align="left" />
                            </Card>
                        </div>
                    )}

                    {active === "control" && (
                        <LinkGrid links={controlLinks} loading={!origin} beltColor="#D6483A" />
                    )}

                    {active === "judge" && (
                        <div className="flex-1 flex-center">
                            {!origin ? (
                                <p className="text-[20px] text-[#8B93A1] tracking-[0.1em] uppercase">Đang lấy địa chỉ mạng...</p>
                            ) : (
                                <Card beltColor="#25A7B0" title="Giám định" qrValue={origin.judge}>
                                    <div className="flex flex-col gap-[10px] items-center">
                                        <span className="text-[26px] font-semibold tracking-[0.02em] uppercase">Giám định</span>
                                        <span className="text-[14px] text-[#8B93A1] leading-snug max-w-[300px]">
                                            Giám định biên — xác nhận đòn chạm. Mỗi giám khảo quét mã riêng trên thiết bị của mình.
                                        </span>
                                        <a
                                            href={origin.judge}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[15px] font-[family-name:var(--font-mono)] text-[#D6A643] break-all max-w-[300px] whitespace-normal">
                                            {origin.judge}
                                        </a>
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}

                    {active === "view" && (
                        <LinkGrid links={viewLinks} loading={!origin} beltColor="#3A62D8" />
                    )}

                </div>
            </main >

            <footer className="shrink-0 flex items-center justify-center py-[10px]">
                <span className="text-[13px] tracking-[0.2em] uppercase text-[#8B93A1]/60">
                    {activeGroup.label} · Sân {active !== "wifi" ? courtId : "—"}
                </span>
            </footer>
        </div >
    )
}

// ── Thẻ hiển thị 1 QR lớn kèm nhãn (dùng cho Wi-Fi, Giám định — đứng riêng lẻ) ──

function Card(props: { beltColor: string; title: string; qrValue: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-row items-center gap-[56px] flex-wrap justify-center">
            <div className="flex flex-col items-center gap-[24px] shrink-0">
                <div className="p-[24px] bg-[#F3F1EA] rounded-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
                    <QRCode value={props.qrValue} size={300} fgColor="#14171C" bgColor="#F3F1EA" />
                </div>
                <div className="w-[64px] h-[6px] rounded-full" style={{ background: props.beltColor }} />
            </div>
            <div className="flex flex-col gap-[18px] items-start">
                {props.children}
            </div>
        </div>
    )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; align?: "center" | "left" }) {
    const alignCls = props.align === "left" ? "items-start text-left" : "items-center text-center"
    return (
        <div className={`flex flex-col gap-[6px] ${alignCls}`}>
            <span className="text-[13px] tracking-[0.18em] uppercase text-[#8B93A1]">{props.label}</span>
            <input
                value={props.value}
                onChange={e => props.onChange(e.target.value)}
                className={`bg-transparent text-[34px] font-semibold text-[#F3F1EA] outline-none
                    border-b-2 border-[#2A2F3A] focus:border-[#D6A643] pb-[6px] min-w-[280px] max-w-[330px]
                    ${props.align === "left" ? "text-left" : "text-center"}
                    ${props.mono ? "font-[family-name:var(--font-mono)]" : ""}`}
            />
        </div>
    )
}

// ── Lưới các link trong 1 nhóm (Điều khiển / Xem trận), giãn cách xa nhau ──

function LinkGrid(props: { links: LinkItem[]; loading: boolean; beltColor: string }) {
    if (props.loading) {
        return <p className="text-[20px] text-[#8B93A1] tracking-[0.1em] uppercase">Đang lấy địa chỉ mạng...</p>
    }
    return (
        <div className="flex flex-wrap items-start justify-evenly gap-y-[72px] w-full min-h-0">
            {props.links.map(link => (
                <div key={link.url} className="flex flex-col items-center gap-[24px] max-w-[400px] shrink-0">
                    <div className="p-[24px] bg-[#F3F1EA] rounded-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
                        <QRCode value={link.url} size={300} fgColor="#14171C" bgColor="#F3F1EA" />
                    </div>
                    <div className="w-[48px] h-[5px] rounded-full" style={{ background: props.beltColor }} />
                    <div className="flex flex-col items-center gap-[10px] text-center">
                        <span className="text-[26px] font-semibold tracking-[0.02em] uppercase">{link.label}</span>
                        <span className="text-[14px] text-[#8B93A1] leading-snug">{link.hint}</span>
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[15px] font-[family-name:var(--font-mono)] text-[#D6A643] break-all max-w-[300px] h-[3rem] whitespace-normal">
                            {link.url}
                        </a>
                    </div>
                </div>
            ))
            }
        </div >
    )
}