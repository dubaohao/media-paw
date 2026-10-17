// @ts-nocheck
/**
 * URL 输入表单：无 requestId 时显示
 * 迁移自 downloader.html 的 #getURL 区块
 *
 * 字段：URL / Referer / 流式下载复选框 / 提交按钮
 * 提交时构造 data 数组，调用 setHeaders 设置请求头后调用 store.startWithData 启动下载
 */
import React, { useState } from "react"
import { G, i18n } from "~lib/init"
import { JSONparse, setHeaders } from "~lib/function"
import { useDownloaderStore } from "./store"

/** URL 输入表单组件 */
export function UrlInputForm(props: { tabId: number }) {
    const { tabId } = props
    const { startWithData } = useDownloaderStore()
    const [url, setUrl] = useState("")
    const [referer, setReferer] = useState("")
    const [downStream, setDownStream] = useState<boolean>(!!G.downStream)

    /** 提交表单：构造 data 数组并启动下载 */
    const handleSubmit = () => {
        const trimmedUrl = url.trim()
        if (!trimmedUrl) { return }
        const data: any[] = [{
            url: trimmedUrl,
            requestId: 1
        }]
        // 处理请求头：http 开头作为 referer，否则按 JSON 解析
        const trimmedReferer = referer.trim()
        if (trimmedReferer) {
            if (trimmedReferer.startsWith("http")) {
                data[0].requestHeaders = { referer: trimmedReferer }
            } else {
                data[0].requestHeaders = JSONparse(trimmedReferer)
            }
        }
        // 设置请求头后启动下载
        setHeaders(data, () => {
            startWithData(data, { downStream, tabId })
        }, tabId)
    }

    return (
        <div className="wrapper1024" id="getURL">
            <section>
                <h1 className="optionsTitle">{i18n.titleDownload}</h1>
                <div className="optionBox">
                    <input
                        type="text"
                        placeholder="URL"
                        className="fullInput"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="referer"
                        className="fullInput"
                        value={referer}
                        onChange={e => setReferer(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={handleSubmit}
                    >{i18n.download}</button>
                    <label className="textColor">
                        <input
                            type="checkbox"
                            checked={downStream}
                            onChange={e => setDownStream(e.target.checked)}
                        />
                        <span>{i18n.downloadWhileSaving}</span>
                    </label>
                </div>
            </section>
        </div>
    )
}
