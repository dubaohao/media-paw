/**
 * ReplaceTagsSection 替换标签 section：downFileName/userAgent/MobileUserAgent + 测试面板
 * 迁移自 options.html #anchorReplaceTags 与 options.js 的 testTag() 逻辑
 */
// @ts-nocheck
import React, { useRef, useState } from "react"
import { i18n, G } from "~lib/init"
import { templates } from "~lib/function"
import { Base64 } from "~lib/base64"
import { useOptionsStore } from "./store"
import { ResetButton } from "./ResetButton"

/** 替换标签 section */
export function ReplaceTagsSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>({})

    const [showTest, setShowTest] = useState(false)
    const [testTextarea, setTestTextarea] = useState(
        String("${url} ${referer|exists:'--headers \"Referer:*\"'} ${url|regexp:\"(https?://[^?]*)\"|replace:\"http://\",\"https://\"|to:base64}")
    )
    const [testUrl, setTestUrl] = useState("https://bmmmd.com/test.m3u8")
    const [testReferer, setTestReferer] = useState("https://bmmmd.com/")
    const [testInitiator, setTestInitiator] = useState("https://bmmmd.com")
    const [testWebUrl, setTestWebUrl] = useState("https://bmmmd.com/test.html")
    const [testTitle, setTestTitle] = useState("test Video")
    const [testResult, setTestResult] = useState("")

    const handleInput = (key: string, value: string) => {
        updateOption(key, value)
        clearTimeout(debounceRef.current[key])
        debounceRef.current[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    /** 执行 tag 替换测试，对应原版 testTag() */
    const runTest = () => {
        const data = {
            url: testUrl,
            requestHeaders: { referer: testReferer },
            initiator: testInitiator,
            webUrl: testWebUrl,
            title: testTitle,
        }
        const result = templates(testTextarea || "", data)
        const m3u8dl = "m3u8dl:" + (G.m3u8dl == 1 ? Base64.encode(result) : result)
        setTestResult(`${result}\n\n${m3u8dl}`)
    }

    /** 显示/隐藏测试面板 */
    const handleToggle = () => {
        runTest()
        setShowTest(!showTest)
    }

    return (
        <section id="anchorReplaceTags">
            <h1 className="optionsTitle">{i18n.replaceTags}</h1>
            <div className="optionBox" id="tag">
                <span className="explain"></span>
                <div style={{ marginBottom: 5 }}>
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a>
                </div>
                <div className="list">
                    <div className="item">
                        <div>{i18n.customSaveFileName}</div>
                        <textarea
                            className="width100"
                            value={options.downFileName || ""}
                            onChange={(e) => handleInput("downFileName", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{"${userAgent}"} <span>{i18n.userAgentTip}</span></div>
                        <textarea
                            className="width100"
                            value={options.userAgent || ""}
                            onChange={(e) => handleInput("userAgent", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{"${mobileUserAgent}"} / <span>{i18n.simulateMobile}</span>User Agent</div>
                        <textarea
                            className="width100"
                            value={options.MobileUserAgent || ""}
                            onChange={(e) => handleInput("MobileUserAgent", e.target.value)}
                        />
                    </div>
                    {showTest && (
                        <div id="testTag" className="break-all">
                            <div className="item">
                                <div>
                                    <p>{i18n.test}</p>
                                </div>
                                <textarea
                                    className="width100 break-all"
                                    rows={3}
                                    value={testTextarea}
                                    onChange={(e) => { setTestTextarea(e.target.value); }}
                                />
                            </div>
                            <label htmlFor="url">{"${url}"}</label>
                            <input type="text" className="width100" value={testUrl}
                                onChange={(e) => { setTestUrl(e.target.value); runTest(); }} />
                            <label htmlFor="referer">{"${referer}"}</label>
                            <input type="text" className="width100" value={testReferer}
                                onChange={(e) => { setTestReferer(e.target.value); runTest(); }} />
                            <label htmlFor="initiator">{"${initiator}"}</label>
                            <input type="text" className="width100" value={testInitiator}
                                onChange={(e) => { setTestInitiator(e.target.value); runTest(); }} />
                            <label htmlFor="webUrl">{"${webUrl}"}</label>
                            <input type="text" className="width100" value={testWebUrl}
                                onChange={(e) => { setTestWebUrl(e.target.value); runTest(); }} />
                            <label htmlFor="title">{"${title}"}</label>
                            <input type="text" className="width100" value={testTitle}
                                onChange={(e) => { setTestTitle(e.target.value); runTest(); }} />
                            <span>{i18n.result}</span>:<br />
                            <span id="tagTestResult" style={{ whiteSpace: "pre-wrap" }}>{testResult}</span>
                        </div>
                    )}
                    <div className="flex-end">
                        <button type="button" id="showTestTag" onClick={handleToggle}>{i18n.test}</button>
                        <ResetButton keys={["downFileName", "userAgent", "MobileUserAgent"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
