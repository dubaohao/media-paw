// @ts-nocheck
/**
 * Downloader 主容器
 * 迁移自 js/downloader.js 主流程（awaitG + URL 参数解析 + 数据拉取 + 启动下载）
 *
 * 职责：
 * - 读取 URL 参数：requestId / ffmpeg / downStream
 * - 静态样式（public/options）由 src/downloader.tsx 入口 import；mobile.css 与 G.css 由 loadCSS 注入
 * - 等待 G 初始化完成
 * - 无 requestId 时显示 UrlInputForm
 * - 有 requestId 时从 localStorage 或后台拉取数据，调 store.startWithData 启动下载
 * - 渲染 FragmentGrid + DownloadList + 全局按钮（停止/打开目录/autoClose）
 */
import React, { useEffect, useState } from "react"
import { G, i18n } from "~lib/init"
import { awaitG, loadCSS, setHeaders } from "~lib/function"
import { useDownloaderStore } from "~components/tabs/downloader/store"
import { UrlInputForm } from "./components/UrlInputForm"
import { FragmentGrid } from "./components/FragmentGrid"
import { DownloadList } from "./components/DownloadList"

interface Props {
    /** 从 URL 参数解析得到的 requestId 数组 */
    requestId: string[]
    /** 是否启用在线 ffmpeg */
    ffmpeg: string | null
    /** 是否启用流式下载 */
    downStream: string | null
}

/** 主容器组件 */
export function DownloaderApp({ requestId, ffmpeg, downStream }: Props) {
    const store = useDownloaderStore()
    const [ready, setReady] = useState(false)
    const [tabId, setTabId] = useState<number>(0)
    const [showForm, setShowForm] = useState(false)

    /** 等待 G 就绪 + 注入运行时样式 + 拉取 tab 信息 + 启动下载 */
    useEffect(() => {
        // 等待 G 初始化
        awaitG(() => {
            // 加载运行时样式：移动端 mobile.css（UA 条件）+ 用户自定义 G.css
            loadCSS()
            // 获取当前标签信息
            chrome.tabs.getCurrent(function (tabs) {
                const currentTabId = tabs?.id ?? 0
                setTabId(currentTabId)

                // 提前打开 ffmpeg 页面
                if (ffmpeg) {
                    chrome.runtime.sendMessage({
                        Message: "catCatchFFmpeg",
                        action: "openFFmpeg",
                        extra: i18n.waitingForMedia
                    })
                }

                // 没有 requestId 显示提交表单
                if (!requestId.length) {
                    setShowForm(true)
                    setReady(true)
                    return
                }

                // 优先从 localStorage 的 downloadData 提取任务数据
                const remainingIds = [...requestId]
                const data: any[] = []
                try {
                    const stored = localStorage.getItem("downloadData")
                    const downloadData = stored ? JSON.parse(stored) : []
                    for (const item of downloadData) {
                        if (requestId.includes(String(item.requestId))) {
                            data.push(item)
                            const idx = remainingIds.indexOf(String(item.requestId))
                            if (idx >= 0) { remainingIds.splice(idx, 1) }
                        }
                    }
                } catch (e) { /* localStorage 不可用 */ }

                // downloadData 已经覆盖所有 requestId 直接启动
                if (!remainingIds.length) {
                    setHeaders(data, () => {
                        store.startWithData(data, {
                            downStream,
                            ffmpeg: ffmpeg || undefined,
                            tabId: currentTabId
                        })
                        setReady(true)
                    }, currentTabId)
                    return
                }

                // 从后台获取剩余数据
                chrome.runtime.sendMessage(
                    { Message: "getData", requestId: remainingIds },
                    function (resp: any) {
                        if (resp === "error" || !Array.isArray(resp) || chrome.runtime.lastError || resp.length === 0) {
                            alert(i18n.dataFetchFailed)
                            setReady(true)
                            return
                        }
                        data.push(...resp)
                        setHeaders(resp, () => {
                            store.startWithData(data, {
                                downStream,
                                ffmpeg: ffmpeg || undefined,
                                tabId: currentTabId
                            })
                            setReady(true)
                        }, currentTabId)
                    }
                )
            })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 表单模式：无 requestId
    if (ready && showForm) {
        return <UrlInputForm tabId={tabId} />
    }

    // 加载中
    if (!ready) {
        return <div id="Tips" style={{ padding: 12 }}>{i18n.loadingData}</div>
    }

    // 下载列表模式
    return (
        <div className="wrapper1024 newDownload">
            <section id="downfile">
                <h1 className="optionsTitle">{i18n.titleDownload}</h1>
                {store.fileTitle && (
                    <div
                        id="pageFileName"
                        className="explain"
                        title={store.fileTitle}
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >{store.fileTitle}</div>
                )}
                <FragmentGrid />
                <DownloadList />
            </section>
            <section>
                <div className="optionBox">
                    <button className="openDir button2" onClick={store.openDir}>{i18n.openDir}</button>
                    {ffmpeg && (
                        <button id="ffmpeg" className="button2">{i18n.sendFfmpeg}</button>
                    )}
                    <button
                        id="stopDownload"
                        className="button2"
                        onClick={store.stopAll}
                    >{i18n.stopDownload}</button>
                    <label className="textColor">
                        <input
                            type="checkbox"
                            id="autoClose"
                            checked={store.autoClose}
                            onChange={e => store.setAutoClose(e.target.checked)}
                        />
                        <span>{i18n.autoCloserDownload}</span>
                    </label>
                </div>
            </section>
        </div>
    )
}
