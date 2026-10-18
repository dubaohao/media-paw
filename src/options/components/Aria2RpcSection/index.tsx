/**
 * Aria2RpcSection Aria2 RPC section：启用/Referer自动设置/Token/RPC 地址
 * 迁移自 options.html #anchorAria2Rpc
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** Aria2 RPC section */
export function Aria2RpcSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>({})

    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current[key])
        debounceRef.current[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    return (
        <section id="anchorAria2Rpc">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/aria2.png")} style={{ width: 18 }} className="aria2" />
                Aria2 RPC
            </h1>
            <div className="optionBox">
                <span className="explain">
                    <p>{i18n.aria2Tip}</p>
                    <a href="https://aria2.github.io/manual/en/html/aria2c.html#rpc-interface" target="_blank">{i18n.documentation}</a>
                </span>
                <div className="list">
                    <div className="item">
                        <div><span>{i18n.enable}</span> Aria2 RPC</div>
                        <Switch
                            checked={!!options.enableAria2Rpc}
                            onChange={(v) => updateOption("enableAria2Rpc", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.autoSetRefererCookieParams}</div>
                        <Switch
                            checked={!!options.enableAria2RpcReferer}
                            onChange={(v) => updateOption("enableAria2RpcReferer", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.secretKey}</div>
                        <input
                            id="aria2RpcToken"
                            type="password"
                            className="width100"
                            value={options.aria2RpcToken || ""}
                            onChange={(e) => handleInput("aria2RpcToken", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>Aria2 RPC <span>{i18n.address}</span></div>
                        <input
                            id="aria2Rpc"
                            type="text"
                            className="width100"
                            value={options.aria2Rpc || ""}
                            onChange={(e) => handleInput("aria2Rpc", e.target.value)}
                        />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["enableAria2Rpc", "enableAria2RpcReferer", "aria2RpcToken", "aria2Rpc"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
