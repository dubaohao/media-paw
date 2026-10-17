/**
 * CopySection 复制选项 section：copyM3U8/copyMPD/copyOther 三个 textarea
 * 迁移自 options.html #anchorCopy
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"
import { ResetButton } from "./ResetButton"

/** 复制选项 section */
export function CopySection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>({})

    /** input 防抖保存 */
    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current[key])
        debounceRef.current[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    return (
        <section id="anchorCopy">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/copy.png")} style={{ width: 18 }} className="copy" alt="Copy icon" />
                <p>{i18n.copy}</p>
            </h1>
            <div className="optionBox">
                <span className="explain">
                    <p>{i18n.copyTip}</p><br />
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a><br /><br />
                </span>
                <div className="item">
                    <div>HLS m3u8</div>
                    <textarea
                        className="width100"
                        value={options.copyM3U8 || ""}
                        onChange={(e) => handleInput("copyM3U8", e.target.value)}
                    />
                </div>
                <div className="item" style={{ marginTop: 10 }}>
                    <div>DASH mpd</div>
                    <textarea
                        className="width100"
                        value={options.copyMPD || ""}
                        onChange={(e) => handleInput("copyMPD", e.target.value)}
                    />
                </div>
                <div className="item" style={{ marginTop: 10 }}>
                    <div>{i18n.otherFiles}</div>
                    <textarea
                        className="width100"
                        value={options.copyOther || ""}
                        onChange={(e) => handleInput("copyOther", e.target.value)}
                    />
                </div>
                <div className="flex-end">
                    <ResetButton keys={["copyM3U8", "copyMPD", "copyOther"]} />
                </div>
            </div>
        </section>
    )
}
