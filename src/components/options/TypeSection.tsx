/**
 * TypeSection 类型列表 section：Type 表格的增删改查与保存
 * 迁移自 options.html #anchorType 与 options.js 的 Type 部分
 * Type 列必须满足 "type/subtype" 格式才保存
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n, G } from "~lib/init"
import { isEmpty } from "~lib/function"
import { useOptionsStore } from "./store"
import { EditableList } from "./EditableList"
import { ResetButton } from "./ResetButton"

/** 解析 SaveGetVal 等价的 size 输入 */
function parseSizeInput(text: string, size: any, state: boolean) {
    text = (text || "").trim()
    let sizeStr = (size ?? "").toString().trim()
    sizeStr = sizeStr.replace(/[^\d><=!-\s]/g, "")
    let operator = ">="
    if (sizeStr.match(/^(\d+)-(\d+)$/)) { operator = "~" }
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

/** 类型 section */
export function TypeSection() {
    const { options, updateOption, reload } = useOptionsStore()
    const rows: any[] = options.Type || []
    const debounceRef = useRef<any>(null)

    /** 行变更后保存 */
    const handleRowsChange = (newRows: any[]) => {
        updateOption("Type", newRows)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const Type: any[] = []
            for (const row of newRows) {
                if (isEmpty(row.type)) { continue }
                const parsed = parseSizeInput(row.type, row.size, row.state)
                if (isEmpty(parsed.text)) { continue }
                const test = parsed.text.split("/")
                if (test.length != 2 || isEmpty(test[0]) || isEmpty(test[1])) { continue }
                Type.push({ type: parsed.text, size: parsed.size, operator: parsed.operator, state: parsed.state })
            }
            chrome.storage.sync.set({ Type })
        }, 200)
    }

    /** 校验单行 type 格式：必须为 "type/subtype" */
    const validateRow = (row: any): string | null => {
        const text = (row.type || "").trim()
        if (isEmpty(text)) { return null }
        const test = text.split("/")
        if (test.length != 2 || isEmpty(test[0]) || isEmpty(test[1])) {
            alert(i18n.addTypeError)
            return i18n.addTypeError
        }
        return null
    }

    /** 重置 Type */
    const handleReset = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.set({ Type: G.OptionLists.Type }, reload)
    }

    return (
        <section id="anchorType">
            <h1 className="optionsTitle">{i18n.type}</h1>
            <div className="optionBox">
                <span className="explain">{i18n.typeTip}</span>
                <EditableList
                    columns={[
                        { name: "type", label: i18n.type, placeholder: i18n.type, className: "type" },
                        { name: "size", label: i18n.filterSize, className: "size" }
                    ]}
                    rows={rows}
                    newRowTemplate={() => ({ type: "", size: 0, operator: ">=", state: true })}
                    onRowsChange={handleRowsChange}
                    validateRow={validateRow}
                    addLabel={i18n.addType}
                    onReset={handleReset}
                />
                <div className="flex-end">
                    <ResetButton keys={["Type"]} />
                </div>
            </div>
        </section>
    )
}
