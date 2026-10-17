/**
 * Send2localSection 发送数据 section：自动/手动发送 + 请求方法 + 类型 + URL + body
 * 迁移自 options.html #anchorSend2local
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"
import { Switch } from "./Switch"
import { ResetButton } from "./ResetButton"

/** 发送数据 section */
export function Send2localSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>({})

    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current[key])
        debounceRef.current[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    /** select 变更保存 */
    const handleSelect = (key: string, value: any) => {
        if (!isNaN(value)) { value = parseInt(value) }
        updateOption(key, value)
        chrome.storage.sync.set({ [key]: value })
    }

    return (
        <section id="anchorSend2local">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/send.svg")} style={{ width: 18 }} className="regex" alt="Send icon" />
                <p>{i18n.send2local}</p>
            </h1>
            <div className="optionBox">
                <span className="explain">
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.documentation}</a>
                </span>
                <div className="list">
                    <div className="item">
                        <div><span>{i18n.autoSend}</span></div>
                        <Switch
                            checked={!!options.send2local}
                            onChange={(v) => updateOption("send2local", v)}
                        />
                    </div>
                    <div className="item">
                        <div><span>{i18n.manualSend}</span></div>
                        <Switch
                            checked={!!options.send2localManual}
                            onChange={(v) => updateOption("send2localManual", v)}
                        />
                    </div>
                    <div className="item">
                        <div><span>{i18n.requestMethod}</span> </div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={options.send2localMethod || "POST"}
                                onChange={(e) => handleSelect("send2localMethod", e.target.value)}
                            >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div><span>Content-Type</span> </div>
                        <div className="switch switchSelect send2localType">
                            <select
                                className="select"
                                value={String(options.send2localType ?? 0)}
                                onChange={(e) => handleSelect("send2localType", e.target.value)}
                            >
                                <option value="0">application/json;charset=utf-8</option>
                                <option value="1">multipart/form-data</option>
                                <option value="2">application/x-www-form-urlencoded</option>
                                <option value="3">text/plain</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div><span>{i18n.address}</span></div>
                        <input
                            type="text"
                            className="width100"
                            value={options.send2localURL || ""}
                            onChange={(e) => handleInput("send2localURL", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>
                            <p>{i18n.requestBody}</p>
                            <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a>
                        </div>
                        <textarea
                            className="width100 break-all"
                            rows={3}
                            value={options.send2localBody || ""}
                            onChange={(e) => handleInput("send2localBody", e.target.value)}
                        />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["send2local", "send2localManual", "send2localMethod", "send2localType", "send2localURL", "send2localBody"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
