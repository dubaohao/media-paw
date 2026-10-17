/**
 * RegexSection 正则匹配 section：Regex 表格 + 正则测试器
 * 迁移自 options.html #anchorRegexMatch 与 options.js 的 Regex 部分和正则测试逻辑
 */
// @ts-nocheck
import React, { useRef, useState } from "react"
import { i18n, G } from "~lib/init"
import { isEmpty } from "~lib/function"
import { useOptionsStore } from "./store"
import { EditableList } from "./EditableList"
import { Switch } from "./Switch"
import { ResetButton } from "./ResetButton"

/** 正则 section */
export function RegexSection() {
    const { options, updateOption, reload } = useOptionsStore()
    const rows: any[] = options.Regex || []
    const debounceRef = useRef<any>(null)

    // 正则测试器本地 state
    const [testUrl, setTestUrl] = useState("")
    const [testRegex, setTestRegex] = useState("")
    const [testFlag, setTestFlag] = useState("ig")
    const [testResult, setTestResult] = useState<any>(i18n.noMatch)

    /** 行变更后保存 */
    const handleRowsChange = (newRows: any[]) => {
        updateOption("Regex", newRows)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const Regex: any[] = []
            for (const row of newRows) {
                let type: any = row.type || "ig"
                const regexStr = row.regex || ""
                const ext = (row.ext || "").toLowerCase()
                const blackList = !!row.blackList
                const state = !!row.state
                try {
                    new RegExp("", type)
                } catch (e) {
                    type = "ig"
                }
                if (isEmpty(regexStr)) { continue }
                Regex.push({ type, regex: regexStr, ext, blackList, state })
            }
            chrome.storage.sync.set({ Regex })
        }, 200)
    }

    /** 重置 Regex */
    const handleReset = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.set({ Regex: G.OptionLists.Regex }, reload)
    }

    /** 实时执行正则测试 */
    const runTest = (url: string, regex: string, flag: string) => {
        if (url === "" || regex === "") {
            setTestResult(i18n.noMatch)
            return
        }
        let regexObj: RegExp
        try {
            regexObj = new RegExp(regex, flag)
        } catch (e: any) {
            setTestResult(e.message)
            return
        }
        const result = regexObj.exec(url)
        if (result == null) {
            setTestResult(i18n.noMatch)
            return
        }
        const captures: string[] = []
        for (let i = 1; i < result.length; i++) {
            if (result[i] != "") {
                captures.push(decodeURIComponent(result[i]))
            }
        }
        setTestResult({ matched: i18n.match, captures })
    }

    return (
        <section id="anchorRegexMatch">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/regex.png")} style={{ width: 18 }} className="regex" />
                <span>{i18n.regexMatch}</span> / <span>{i18n.blockResource}</span>
            </h1>
            <div className="optionBox">
                <span className="explain">
                    <b>{i18n.blockResource}</b>
                    <p>{i18n.blockResourceTip}</p>
                </span><br />
                <span className="explain"><b>{i18n.flag}</b></span><br />
                <span className="explain">
                    <b>{i18n.suffix}</b>
                    <p>{i18n.regexSuffixTip}</p>
                </span><br />
                <span className="explain"><b>{i18n.regexTip}</b></span><br /><br />
                <EditableList
                    columns={[
                        { name: "type", label: i18n.flag, className: "regexType" },
                        { name: "regex", label: i18n.regexExpression, placeholder: i18n.regexExpression, className: "regex" },
                        { name: "ext", label: i18n.suffix, className: "regexExt" },
                        { name: "blackList", label: i18n.blockResource, type: "checkbox" }
                    ]}
                    rows={rows}
                    newRowTemplate={() => ({ type: "ig", regex: "", ext: "", blackList: false, state: true })}
                    onRowsChange={handleRowsChange}
                    addLabel={i18n.addRegex}
                    onReset={handleReset}
                />
                <span style={{ fontWeight: "bold", fontSize: 15 }}>{i18n.regexTest}</span><br />
                <label htmlFor="testUrl">URL</label><br />
                <input
                    type="text"
                    id="testUrl"
                    style={{ width: 590 }}
                    value={testUrl}
                    onChange={(e) => {
                        setTestUrl(e.target.value)
                        runTest(e.target.value, testRegex, testFlag)
                    }}
                /><br />
                <label htmlFor="testRegex">{i18n.regex}</label><br />
                <input
                    type="text"
                    id="testRegex"
                    style={{ width: 590 }}
                    value={testRegex}
                    onChange={(e) => {
                        setTestRegex(e.target.value)
                        runTest(testUrl, e.target.value, testFlag)
                    }}
                /><br />
                <label htmlFor="testFlag">{i18n.flag}</label><br />
                <input
                    type="text"
                    id="testFlag"
                    style={{ width: 20 }}
                    maxLength={4}
                    value={testFlag}
                    onChange={(e) => {
                        setTestFlag(e.target.value)
                        runTest(testUrl, testRegex, e.target.value)
                    }}
                />
                <span style={{ color: "#ff0000" }}>
                    {typeof testResult === "string"
                        ? testResult
                        : (
                            <>
                                {testResult.matched}
                                {testResult.captures?.map((c, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        style={{ width: 590, color: "#ff0000" }}
                                        value={c}
                                        readOnly
                                    />
                                ))}
                            </>
                        )}
                </span>
            </div>
        </section>
    )
}
