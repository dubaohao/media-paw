/**
 * TitleRulesSection 标题提取规则 section：titleRules 表格
 * 迁移自 options.html #anchorTitleRules
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n, G } from "~lib/init"
import { isEmpty } from "~lib/function"
import { useOptionsStore } from "./store"
import { EditableList } from "./EditableList"
import { ResetButton } from "./ResetButton"

/** 标题提取规则 section */
export function TitleRulesSection() {
    const { options, updateOption, reload } = useOptionsStore()
    const rows: any[] = options.titleRules || []
    const debounceRef = useRef<any>(null)

    /** 行变更后保存 */
    const handleRowsChange = (newRows: any[]) => {
        updateOption("titleRules", newRows)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const titleRules: any[] = []
            for (const row of newRows) {
                const domain = (row.domain || "").trim()
                if (isEmpty(domain)) { continue }
                titleRules.push({
                    domain,
                    selector: (row.selector || "").trim(),
                    attr: (row.attr || "").trim(),
                    regex: (row.regex || "").trim(),
                    state: !!row.state
                })
            }
            chrome.storage.sync.set({ titleRules })
        }, 200)
    }

    /** 重置 */
    const handleReset = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.set({ titleRules: G.OptionLists.titleRules }, reload)
    }

    return (
        <section id="anchorTitleRules">
            <h1 className="optionsTitle">标题提取规则</h1>
            <div className="optionBox">
                <span className="explain">
                    按域名匹配规则，从页面 DOM 中提取标题作为下载文件名中的 <code>{`${"{title}"}`}</code>。<br />
                    域名支持通配符 <code>*</code>（如 <code>*.bilibili.com</code>、<code>*</code> 全部）。选择器为空则不提取（回退到页面标题）。属性留空取元素文本，填 <code>content</code> 可取 meta 标签值。正则可选，对提取结果再做一次匹配（捕获组优先）。
                </span>
                <EditableList
                    columns={[
                        { name: "domain", label: "域名", placeholder: "*.bilibili.com", className: "width100" },
                        { name: "selector", label: "CSS 选择器", placeholder: "h1.video-title", className: "width100" },
                        { name: "attr", label: "属性", placeholder: "留空=文本", className: "width100" },
                        { name: "regex", label: "正则", placeholder: "可选", className: "width100" }
                    ]}
                    rows={rows}
                    newRowTemplate={() => ({ domain: "", selector: "", attr: "", regex: "", state: true })}
                    onRowsChange={handleRowsChange}
                    showAllToggle={false}
                    addLabel="添加规则"
                    onReset={handleReset}
                />
                <div className="flex-end">
                    <ResetButton keys={["titleRules"]} />
                </div>
            </div>
        </section>
    )
}
