/**
 * ScriptSection 脚本设置 section：deepSearch 开关 + 重置
 * 迁移自 options.html #anchorScriptSettings
 */
// @ts-nocheck
import React from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** 脚本设置 section */
export function ScriptSection() {
    const { options, updateOption } = useOptionsStore()
    const deepSearch = !!options.deepSearch

    return (
        <section id="anchorScriptSettings">
            <h1 className="optionsTitle">{i18n.Script}</h1>
            <div className="optionBox" id="scriptOption">
                <div className="list loose">
                    <div className="item">
                        <div>{i18n.alwaysSearch}</div>
                        <Switch
                            checked={deepSearch}
                            onChange={(v) => updateOption("deepSearch", v)}
                        />
                    </div>
                </div>
                <div className="flex-end">
                    <ResetButton keys={["deepSearch"]} />
                </div>
            </div>
        </section>
    )
}
