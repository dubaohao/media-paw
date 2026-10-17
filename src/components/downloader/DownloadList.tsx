// @ts-nocheck
/**
 * 下载列表容器：渲染所有 DownloadItem
 * 迁移自 downloader.html 的 #downBox
 */
import React from "react"
import { useDownloaderStore } from "./store"
import { DownloadItem } from "./DownloadItem"

/** 下载列表组件 */
export function DownloadList() {
    const { fragments, tick } = useDownloaderStore()
    // tick 变化即触发重渲染
    void tick
    return (
        <div className="optionBox" id="downBox">
            {fragments.map(fragment => (
                <DownloadItem key={fragment.index} fragment={fragment} />
            ))}
        </div>
    )
}
