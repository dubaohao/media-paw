/**
 * OtherSettingsSection 其他设置 section：PlayerTemplate/player 模板下拉 + TitleName/saveAs/badgeNumber/ShowWebIco/autoClearMode/onlineServiceAddress/popup/popupMode/sidePanel 等
 * 迁移自 options.html #anchorOtherSettings 与 options.js 的 playerList 逻辑
 */
// @ts-nocheck
import React, { useMemo, useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"
import { Switch } from "./Switch"
import { ResetButton } from "./ResetButton"

/** 播放器模板列表（保持原版 playerList 顺序与内容） */
const playerList = new Map<string, { name: string; template: string }>([
    ["tips", { name: i18n.invokeProtocolTemplate, template: "" }],
    ["default", { name: i18n.default + " / " + i18n.disable, template: "" }],
    ["potplayer", { name: "PotPlayer", template: "potplayer://${url} ${referer|exists:'/referer=\"*\"'}" }],
    ["potplayerFix", { name: "PotPlayerFix", template: "potplayer:${url} ${referer|exists:'/referer=\"*\"'}" }],
    ["mxPlayerAd", { name: "Android MX Player Free", template: "intent:${url}#Intent;package=com.mxtech.videoplayer.ad;end" }],
    ["mxPlayerPro", { name: "Android MX Player Pro", template: "intent:${url}#Intent;package=com.mxtech.videoplayer.pro;end" }],
    ["vlc", { name: "Android vlc", template: "intent:${url}#Intent;package=org.videolan.vlc;end" }],
    ["vlcCustom", { name: i18n.customVLCProtocol + " vlc://", template: "vlc://${url}" }],
    ["shareApi", { name: i18n.systemShare, template: "${shareApi}" }]
])

/** 其他设置 section */
export function OtherSettingsSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>(null)

    const playerEntries = useMemo(() => Array.from(playerList.entries()), [])

    /** 选择播放器模板 */
    const handlePlayerTemplate = (key: string) => {
        if (key === "tips") { return }
        const item = playerList.get(key)
        if (!item) { return }
        updateOption("Player", item.template)
        chrome.storage.sync.set({ Player: item.template })
    }

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
        <section id="anchorOtherSettings">
            <h1 className="optionsTitle">{i18n.otherSettings}</h1>
            <div className="optionBox" id="OtherOption">
                <div className="list loose">
                    <div className="item">
                        <div>
                            <span>{i18n.previewMode}</span>{" "}
                            <select
                                id="PlayerTemplate"
                                className="select"
                                value=""
                                onChange={(e) => handlePlayerTemplate(e.target.value)}
                            >
                                {playerEntries.map(([key, item]) => (
                                    <option key={key} value={key}>{item.name}</option>
                                ))}
                            </select>
                        </div>
                        <input
                            type="text"
                            className="width100"
                            placeholder={i18n.previewModePlaceholder}
                            value={options.Player || ""}
                            onChange={(e) => handleInput("Player", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.customFilenameOption}</div>
                        <Switch checked={!!options.TitleName} onChange={(v) => updateOption("TitleName", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.saveAsOption}</div>
                        <Switch checked={!!options.saveAs} onChange={(v) => updateOption("saveAs", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.badgeNumber}</div>
                        <Switch checked={!!options.badgeNumber} onChange={(v) => updateOption("badgeNumber", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.iconOption}</div>
                        <Switch checked={!!options.ShowWebIco} onChange={(v) => updateOption("ShowWebIco", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.clearOption}</div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={String(options.autoClearMode ?? 1)}
                                onChange={(e) => handleSelect("autoClearMode", e.target.value)}
                            >
                                <option value="0">{i18n.doNotClear}</option>
                                <option value="1">{i18n.normalClear}</option>
                                <option value="2">{i18n.moreFrequent}</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.excludeDuplicateResources}</div>
                        <Switch checked={!!options.checkDuplicates} onChange={(v) => updateOption("checkDuplicates", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.onlineServiceAddress}</div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={String(options.onlineServiceAddress ?? 0)}
                                onChange={(e) => handleSelect("onlineServiceAddress", e.target.value)}
                            >
                                <option value="0">{i18n.withinChina}</option>
                                <option value="1">cloudflare</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.defaultPopup}</div>
                        <Switch checked={!!options.popup} onChange={(v) => updateOption("popup", v)} />
                    </div>
                    <div className="item">
                        <div style={{ marginLeft: "2rem" }}>{i18n.selectWebpage}</div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={String(options.popupMode ?? 0)}
                                onChange={(e) => handleSelect("popupMode", e.target.value)}
                            >
                                <option value="0">{i18n.dopreview}</option>
                                <option value="1">{i18n.dopopup}</option>
                                <option value="2">{i18n.winpreview}</option>
                                <option value="3">{i18n.winpopup}</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.useSidePanel}</div>
                        <Switch checked={!!options.sidePanel} onChange={(v) => updateOption("sidePanel", v)} />
                    </div>
                </div>
                <div className="flex-end">
                    <ResetButton keys={["Player", "TitleName", "saveAs", "badgeNumber", "ShowWebIco", "autoClearMode", "checkDuplicates", "onlineServiceAddress", "popup", "popupMode", "sidePanel"]} />
                </div>
            </div>
        </section>
    )
}
