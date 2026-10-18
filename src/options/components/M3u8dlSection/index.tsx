/**
 * M3u8dlSection m3u8DL section：m3u8dl 下拉 + 确认开关 + 参数文本框
 * 迁移自 options.html #anchorM3u8dl
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** m3u8DL section */
export function M3u8dlSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>(null)

    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    const handleSelect = (key: string, value: any) => {
        if (!isNaN(value)) { value = parseInt(value) }
        updateOption(key, value)
        chrome.storage.sync.set({ [key]: value })
    }

    return (
        <section id="anchorM3u8dl">
            <h1 className="optionsTitle">{i18n.sideurlprotocol}URL Protocol m3u8dl</h1>
            <div className="optionBox" id="m3u8dlOption">
                <span className="explain">
                    <a href="https://github.com/nilaoda/N_m3u8DL-CLI" target="_blank">N_m3u8DL-CLI</a> /{" "}
                    <a href="https://github.com/nilaoda/N_m3u8DL-RE" target="_blank">N_m3u8DL-RE</a>
                    <p>{i18n.m3u8DLTips}</p>
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.documentation}</a>
                </span>
                <div className="list">
                    <div className="item">
                        <div>
                            <span>{i18n.enable}</span> m3u8dl:// <span>{i18n.download}</span> m3u8 or mpd
                        </div>
                        <div className="switch m3u8DL">
                            <select
                                className="select"
                                value={String(options.m3u8dl ?? 0)}
                                onChange={(e) => handleSelect("m3u8dl", e.target.value)}
                            >
                                <option value="0">{i18n.disable}</option>
                                <option value="1">N_m3u8DL-CLI</option>
                                <option value="2">N_m3u8DL-RE</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.confirmParameters}</div>
                        <Switch
                            checked={!!options.m3u8dlConfirm}
                            onChange={(v) => updateOption("m3u8dlConfirm", v)}
                        />
                    </div>
                    <div className="item">
                        <div style={{ marginBottom: 5, marginTop: 5 }}>
                            <p>{i18n.parameterSetting}</p>
                            <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a>
                            <a
                                href="https://nilaoda.github.io/N_m3u8DL-CLI/Advanced.html"
                                target="_blank"
                                style={{ marginLeft: 10 }}
                            >
                                N_m3u8DL-CLI <span>{i18n.parameter}</span>
                            </a>
                            <a
                                href="https://github.com/nilaoda/N_m3u8DL-RE?tab=readme-ov-file#%E5%91%BD%E4%BB%A4%E8%A1%8C%E5%8F%82%E6%95%B0"
                                target="_blank"
                                style={{ marginLeft: 10 }}
                            >
                                N_m3u8DL-RE <span>{i18n.parameter}</span>
                            </a>
                        </div>
                        <textarea
                            className="width100 break-all"
                            rows={3}
                            value={options.m3u8dlArg || ""}
                            onChange={(e) => handleInput("m3u8dlArg", e.target.value)}
                        />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["m3u8dl", "m3u8dlConfirm", "m3u8dlArg"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
