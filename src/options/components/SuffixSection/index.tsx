/**
 * SuffixSection 后缀列表 section：Ext 表格的增删改查与保存
 * 迁移自 options.html #anchorSuffix 与 options.js 的 Ext 部分
 * 保存逻辑保留 SaveGetVal() 解析 operator/size 范围语义
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n, G } from "~lib/init"
import { isEmpty } from "~lib/function"
import { useOptionsStore } from "~options/store"
import { EditableList } from "../EditableList"
import { ResetButton } from "../ResetButton"

/** 解析 SaveGetVal 等价的 size 输入（保留原版 operator/range 语义） */
function parseSizeInput(text: string, size: any, state: boolean) {
    text = (text || "").trim()
    let sizeStr = (size ?? "").toString().trim()
    // 只保留操作符、数字、范围符号、空格
    sizeStr = sizeStr.replace(/[^\d><=!-\s]/g, "")
    let operator = ">="
    // 范围：10-20
    if (sizeStr.match(/^(\d+)-(\d+)$/)) { operator = "~" }
    // 比较符号
    const operatorMatch = sizeStr.match(/^(>=|<=|>|<|=|!=)/)
    if (operatorMatch) {
        operator = operatorMatch[0]
        sizeStr = sizeStr.replace(operator, "")
    }
    let sizeNum: any
    if (operator !== "~") {
        sizeNum = parseInt(sizeStr)
        if (isNaN(sizeNum)) { sizeNum = 0 }
    } else {
        sizeNum = sizeStr
    }
    if (isEmpty(sizeNum)) { sizeNum = 0 }
    text = text.toLowerCase()
    return { text, size: sizeNum, operator, state }
}

/** 后缀 section */
export function SuffixSection() {
    const { options, updateOption, reload } = useOptionsStore()
    const rows: any[] = options.Ext || []
    const debounceRef = useRef<any>(null)

    /** 行变更后保存到 storage（带防抖） */
    const handleRowsChange = (newRows: any[]) => {
        updateOption("Ext", newRows)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const Ext: any[] = []
            for (const row of newRows) {
                if (isEmpty(row.ext)) { continue }
                const parsed = parseSizeInput(row.ext, row.size, row.state)
                if (isEmpty(parsed.text)) { continue }
                Ext.push({ ext: parsed.text, size: parsed.size, operator: parsed.operator, state: parsed.state })
            }
            chrome.storage.sync.set({ Ext })
        }, 200)
    }

    /** 重置 Ext */
    const handleReset = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.set({ Ext: G.OptionLists.Ext }, reload)
    }

    return (
        <section id="anchorSuffix">
            <h1 className="optionsTitle">{i18n.suffix}</h1>
            <div className="optionBox">
                <span className="explain">{i18n.suffixTip}</span>
                <EditableList
                    columns={[
                        { name: "ext", label: i18n.suffix, placeholder: i18n.suffix, className: "ext" },
                        { name: "size", label: i18n.filterSize, className: "size" }
                    ]}
                    rows={rows}
                    newRowTemplate={() => ({ ext: "", size: 0, operator: ">=", state: true })}
                    onRowsChange={handleRowsChange}
                    addLabel={i18n.addSuffix}
                    onReset={handleReset}
                />
                <div className="flex-end">
                    <ResetButton keys={["Ext"]} />
                </div>
            </div>
        </section>
    )
}
