"use client"

// import "@/styles/global.css"
import Switch from "@/components/Switch"
import PointEditor from "@/components/PointEditor"
import Armor from "@/assets/solid-armor.svg"
import Helmet from "@/assets/solid-helmet.svg"
import Punch from "@/assets/solid-punch.svg"
import { useState } from "react"
import Image from "next/image"
import VNFlag from "@/assets/flag-of-vietnam.png"
import { useFullScreen, useIsMobile } from "@/components/UseStates"
import FullScreenRequest from "@/components/FullScreenRequest"
import FitText from "@/components/FitText"
import Action from "@/assets/action-key-rounded.svg"
import MobileOperator from "@/components/MobileOperator"

export default function Home() {
    return (
        <MobileOperator />
        // <div className="operator">
        //     {isMobile && <FullScreenRequest />}
        //     <div className="overlay"></div>
        //     <div className="layout">
        //         <div className="header center drop-shadow">
        //             <span className="center">Chung kết hạng cân dưới 58KG Nam - Đối tượng 2</span>
        //         </div>
        //         {/* <div className="team blue"></div>
        //         <div className="team red"></div>
        //         <div className="athlete blue"></div>
        //         <div className="athlete red"></div>
        //         <div className="side blue"></div>
        //         <div className="side red"></div> */}
        //         {/* <div className="control blue"></div>
        //         <div className="control red"></div> */}
        //         <div className="info">
        //             <TeamInfo
        //                 athlete="N.H. Minh Nhật"
        //                 // team="VIE"
        //                 flag={VNFlag}
        //             />
        //             <span className="center">Trận 123</span>
        //             <TeamInfo
        //                 athlete="N. Khắc Duy"
        //                 // team="VIE"
        //                 // flag={VNFlag}
        //                 direction="row-reverse" />
        //         </div>
        //         <div className="score">
        //             <div className="won blue">
        //                 <span>THẮNG</span>
        //                 <div className="circle set" />
        //                 <div className="circle" />
        //             </div>
        //             <div />
        //             <div className="won red">
        //                 <span>THẮNG</span>
        //                 <div className="circle" />
        //                 <div className="circle" />
        //             </div>
        //             <div className="point blue center">
        //                 <div></div>
        //                 <span>20</span>
        //                 <div></div>
        //             </div>
        //             <div className="stopwatch">
        //                 <span className="center">HIỆP 1</span>
        //                 <div className="clock center">2:00</div>
        //                 <div className="label center">DỪNG LẠI</div>
        //             </div>
        //             <div className="point red center">
        //                 <div></div>
        //                 <span>20</span>
        //                 <div></div>
        //             </div>
        //         </div>
        //         <div className="control">
        //             <div>
        //                 <Action className="h-[20px] text-[gold]" />
        //             </div>
        //             <button className="timer-button w-full h-full bg-white button active text-black center">
        //                 Dừng lại
        //             </button>
        //             <div></div>
        //         </div>
        //         <div className="point-editor-container blue">
        //             <div className="w-full pb-[10px] center">
        //                 <PointEditor
        //                     className="external-point-editor gj blue"
        //                     icon={<span className="text-[80%]">GJ</span>}
        //                     iconColor="#187BCD"
        //                 >
        //                     <span className="text-[gold]">0</span>
        //                 </PointEditor>
        //             </div>
        //             {POINT_EDITORS.map(v =>
        //                 <PointEditor
        //                     className="external-point-editor blue"
        //                     key={v.key}
        //                     icon={v.icon}
        //                     iconColor="#187BCD"
        //                 >
        //                     <span>{score["blue"][v.key]}</span>
        //                 </PointEditor>)}
        //         </div>
        //         <div className="point-editor-container red">
        //             <div className="w-full pb-[10px] center">
        //                 <PointEditor
        //                     className="external-point-editor gj red"
        //                     icon={<span className="text-[80%]">GJ</span>}
        //                     iconColor="#FE3939"
        //                 >
        //                     <span className="text-[gold]">0</span>
        //                 </PointEditor>
        //             </div>
        //             {POINT_EDITORS.map(v =>
        //                 <PointEditor
        //                     className="external-point-editor red"
        //                     key={v.key}
        //                     icon={v.icon}
        //                     iconColor="#FE3939"
        //                 >
        //                     <span>{score["red"][v.key]}</span>
        //                 </PointEditor>)}
        //         </div>
        //         <div className="footer"></div>
        //     </div>
        // </div>
    )
}

function TeamInfo(props: {
    team?: string
    athlete?: string
    flag?: any
    direction?: "row" | "row-reverse" | "column" | "column-reverse"
}) {
    return (
        <div
            className="team-info"
            style={{ flexDirection: props.direction }}
        >
            {props.flag &&
                <Image
                    className="team-info_flag"
                    src={props.flag}
                    alt="" />}
            <div className="team-info_content">
                {props.team &&
                    <span
                        className="team-info_team"
                        style={{
                            flexDirection: props.direction,
                            textAlign: props.direction === "row-reverse" ? "right" : undefined
                        }}
                    >
                        {props.team}
                    </span>}
                {props.athlete &&
                    <span
                        className="team-info_athlete"
                        style={{
                            flexDirection: props.direction,
                            textAlign: props.direction === "row-reverse" ? "right" : undefined
                        }}
                    >
                        {props.athlete}
                    </span>}
            </div>
        </div>
    )
}