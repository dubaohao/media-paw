/**
 * BlockUrlSection 屏蔽网址 section：blockUrl 表格 + 白名单开关
 * 迁移自 options.html #anchorBlockUrl
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n, G } from "~lib/init"
import { isEmpty } from "~lib/function"
import { useOptionsStore } from "~options/store"
import { EditableList } from "../EditableList"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** 屏蔽网址 section */
export function BlockUrlSection() {
    const { options, updateOption, reload } = useOptionsStore()
    const rows: any[] = options.blockUrl || []
    const blockUrlWhite = !!options.blockUrlWhite
    const debounceRef = useRef<any>(null)

    /** 行变更后保存 */
    const handleRowsChange = (newRows: any[]) => {
        updateOption("blockUrl", newRows)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const blockUrl: any[] = []
            for (const row of newRows) {
                if (isEmpty(row.url)) { continue }
                blockUrl.push({ url: row.url, state: !!row.state })
            }
            chrome.storage.sync.set({ blockUrl })
        }, 200)
    }

    /** 重置 */
    const handleReset = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.set({ blockUrl: G.OptionLists.blockUrl }, reload)
    }

    return (
        <section id="anchorBlockUrl">
            <h1 className="optionsTitle">{i18n.blockUrl}</h1>
            <div className="optionBox">
                <div className="item">
                    <div>{i18n.setWhiteList}</div>
                    <Switch
                        checked={blockUrlWhite}
                        onChange={(v) => updateOption("blockUrlWhite", v)}
                    />
                </div>
                <span className="explain">{i18n.blockUrlTips}</span>
                <EditableList
                    columns={[
                        { name: "url", label: "URL", placeholder: i18n.blockUrlTips, className: "width100" }
                    ]}
                    rows={rows}
                    newRowTemplate={() => ({ url: "", state: true })}
                    onRowsChange={handleRowsChange}
                    addLabel={i18n.addUrl}
                    onReset={handleReset}
                />
                <div className="flex-end">
                    <ResetButton keys={["blockUrl", "blockUrlWhite"]} />
                </div>
            </div>
        </section>
    )
}
