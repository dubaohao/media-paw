/**
 * InvokeAppSection 第三方本地程序调用 section：invoke 开关 + 确认开关 + 调用文本
 * 迁移自 options.html #anchorInvokeApp
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** 第三方本地程序调用 section */
export function InvokeAppSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>(null)

    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    return (
        <section id="anchorInvokeApp">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/invoke.svg")} style={{ width: 18 }} className="invoke" />
                <p>{i18n.invokeApp}</p>
            </h1>
            <div className="optionBox" id="invokeOption">
                <div className="list">
                    <div className="item">
                        <div>{i18n.enable}</div>
                        <Switch
                            checked={!!options.invoke}
                            onChange={(v) => updateOption("invoke", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.confirmParameters}</div>
                        <br />
                        <Switch
                            checked={!!options.invokeConfirm}
                            onChange={(v) => updateOption("invokeConfirm", v)}
                        />
                    </div>
                    <div className="item" style={{ marginBottom: 5, marginTop: 5 }}>
                        <div>
                            <p>{i18n.parameterSetting}</p>
                            <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a>
                        </div>
                        <textarea
                            className="width100 break-all"
                            rows={3}
                            value={options.invokeText || ""}
                            onChange={(e) => handleInput("invokeText", e.target.value)}
                        />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["invoke", "invokeConfirm", "invokeText"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
