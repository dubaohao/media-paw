// @ts-nocheck
/**
 * JSON 查看/格式化页面主组件
 * 迁移自 js/json.js：支持从 URL 加载或手动粘贴 JSON 文本
 * 提供折叠/展开所有节点的切换
 */
import React, { useEffect, useState, useCallback } from "react"
import { G, i18n } from "~lib/init"
import { JSONparse, isEmpty, setRequestHeaders, awaitG, loadCSS } from "~lib/function"
import { JsonTree } from "./JsonTree"

/** URL 参数解析 */
const params = new URL(location.href).searchParams
const _url = params.get("url")
const _requestHeaders = params.get("requestHeaders")

/**
 * JSON 页面主组件
 * 两种模式：有 URL 参数时自动加载；无 URL 时显示手动输入表单
 */
export function JsonApp() {
    const [mode, setMode] = useState<"input" | "viewer">(isEmpty(_url) ? "input" : "viewer")
    const [jsonContent, setJsonContent] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [collapsed, setCollapsed] = useState(true)
    const [inputUrl, setInputUrl] = useState("")
    const [inputText, setInputText] = useState("")

    /** 注入 CSS 并设置请求头 */
    useEffect(() => {
        loadCSS()
        const headers = JSONparse(_requestHeaders)
        setRequestHeaders(headers, () => { })
    }, [])

    /** 有 URL 参数时自动加载 */
    useEffect(() => {
        if (!isEmpty(_url)) {
            fetchJson(_url)
        }
    }, [])

    /** 从 URL 获取 JSON 数据 */
    const fetchJson = useCallback(async (url: string) => {
        setMode("viewer")
        setLoading(true)
        setError("")
        try {
            const res = await fetch(url)
            const text = await res.text()
            parseAndRender(text)
        } catch (e) {
            setError(i18n.fileRetrievalFailed || "Failed to fetch")
            setLoading(false)
        }
    }, [])

    /** 解析 JSON 文本并渲染（含 try{}catch 去除与 JSONP 提取） */
    const parseAndRender = useCallback((text: string) => {
        // 去除 try{}catch(e){} 包裹
        text = text.replace(/^try{/, "").replace(/}catch\(e\){.*}$/ig, "")
        let parsed: any
        try {
            parsed = JSON.parse(text)
        } catch (e) {
            // 尝试从 JSONP 或赋值语句中提取 JSON
            const regexps = [/^.*=({.*}).*$/, /^.*\(({.*})\).*$/]
            for (const regex of regexps) {
                const res = new RegExp(regex, "ig").exec(text)
                if (res) {
                    try {
                        parsed = JSON.parse(res[1])
                        break
                    } catch { /* continue */ }
                }
            }
            if (!parsed) {
                setError(i18n.fileRetrievalFailed || "JSON parse error")
                setLoading(false)
                return
            }
        }
        setJsonContent(parsed)
        setLoading(false)
    }, [])

    /** 手动输入提交：优先 URL，其次文本 */
    const handleSubmit = useCallback(() => {
        const url = inputUrl.trim()
        if (!isEmpty(url)) {
            fetchJson(url)
            return
        }
        if (inputText.trim()) {
            parseAndRender(inputText)
        }
    }, [inputUrl, inputText, fetchJson, parseAndRender])

    /** 切换折叠/展开 */
    const toggleCollapsed = useCallback(() => setCollapsed(c => !c), [])

    if (mode === "input") {
        return (
            <div className="wrapper1024">
                <section id="jsonCustom">
                    <h1 className="optionsTitle">{i18n.titleJson || "JSON"}</h1>
                    <div className="optionBox">
                        <span className="explain">json</span>
                        <textarea
                            spellCheck={false}
                            className="width100"
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            rows={10}
                        />
                        <div className="line"></div>
                        <span className="explain">json url</span>
                        <input
                            type="text"
                            placeholder="jsonURL"
                            className="fullInput"
                            value={inputUrl}
                            onChange={e => setInputUrl(e.target.value)}
                        />
                        <button type="button" onClick={handleSubmit}>
                            {i18n.jsonFormatter || "Format"}
                        </button>
                    </div>
                </section>
            </div>
        )
    }

    return (
        <div className="wrapper1024">
            <section id="main">
                <h1 className="optionsTitle">{i18n.titleJson || "JSON"}</h1>
                <div className="optionBox">
                    <div className="block">
                        {loading ? (
                            <pre>{i18n.fileLoading || "Loading..."}</pre>
                        ) : error ? (
                            <pre>{error}</pre>
                        ) : jsonContent !== null ? (
                            <JsonTree data={jsonContent} collapsed={collapsed} />
                        ) : null}
                    </div>
                    {!loading && !error && jsonContent !== null && (
                        <button onClick={toggleCollapsed}>
                            {collapsed ? (i18n.expandAllNodes || "Expand All") : (i18n.collapseAllNodes || "Collapse All")}
                        </button>
                    )}
                </div>
            </section>
        </div>
    )
}
