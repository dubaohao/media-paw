// @ts-nocheck
/**
 * Downloader 入口：导出 DownloaderRoot
 *
 * 由 src/downloader.tsx 页面入口（downloader.html）渲染。
 * 此处仅组装 StoreProvider + DownloaderApp，URL 参数解析交给 DownloaderApp。
 */
import React from "react"
import { DownloaderStoreProvider } from "./store"
import { DownloaderApp } from "./DownloaderApp"

/** URL 参数解析（与原 downloader.js 顶部一致） */
const params = new URL(location.href).searchParams
const requestId = params.get("requestId") ? params.get("requestId").split(",") : []
const ffmpeg = params.get("ffmpeg")
const downStream = params.get("downStream")

/** Downloader 根组件：套上 Store Provider 后挂载主容器 */
export default function DownloaderRoot() {
    return (
        <DownloaderStoreProvider>
            <DownloaderApp
                requestId={requestId}
                ffmpeg={ffmpeg}
                downStream={downStream}
            />
        </DownloaderStoreProvider>
    )
}
