// @ts-nocheck
/**
 * 单个下载项视图：文件名 / 进度条 / 进度文本 / 操作按钮
 * 迁移自 downloader.js 的 addHtml 函数
 *
 * 进度条颜色：
 * - 蓝色（默认 progress）：下载中
 * - 绿色（progress.success）：成功
 * - 红色（progress.error）：失败
 *
 * 按钮状态机：
 * - waiting/running  → 显示「停止下载」按钮，点击 stopFragment
 * - stopped/error    → 显示「重试」按钮，点击 retryFragment
 * - success          → 显示「发送 FFmpeg」按钮，点击 sendFFmpeg
 */
import React from "react"
import { i18n } from "~lib/init"
import { byteToSize } from "~lib/function"
import { useDownloaderStore, type FragmentView } from "./store"

interface Props {
    fragment: FragmentView
}

/** 单个下载项组件 */
export function DownloadItem({ fragment }: Props) {
    const { progress, tick, stopFragment, retryFragment, sendFFmpeg } = useDownloaderStore()
    // tick 变化即触发重渲染
    void tick
    const p = progress.get(fragment.index)
    const received = p?.receivedLength ?? 0
    const totalBytes = p?.contentLength ?? 0

    // 进度百分比文本
    let progressText: string
    let barWidth: string
    if (fragment.state === "success") {
        progressText = i18n.downloadComplete
        barWidth = "100%"
    } else if (fragment.state === "error") {
        progressText = fragment.error || String(i18n.dataFetchFailed)
        barWidth = "0%"
    } else if (fragment.state === "stopped") {
        progressText = i18n.retryDownload
        barWidth = totalBytes ? `${(received / totalBytes * 100).toFixed(2)}%` : "0%"
    } else if (totalBytes) {
        const pct = (received / totalBytes * 100).toFixed(2)
        progressText = `${byteToSize(received)} / ${byteToSize(totalBytes)}`
        barWidth = `${pct}%`
    } else {
        progressText = byteToSize(received) || "0"
        barWidth = "0%"
    }

    // 进度条类名：根据状态切换颜色
    const barClass = fragment.state === "success"
        ? "progress success"
        : fragment.state === "error"
            ? "progress error"
            : "progress"

    /** 按钮渲染：根据状态切换文案与点击行为 */
    const renderButton = () => {
        if (fragment.state === "success") {
            return (
                <button
                    className="cancel-btn"
                    onClick={() => sendFFmpeg(fragment.index)}
                >{i18n.sendFfmpeg}</button>
            )
        }
        if (fragment.state === "stopped" || fragment.state === "error") {
            return (
                <button
                    className="cancel-btn"
                    onClick={() => retryFragment(fragment.index)}
                >{i18n.retryDownload}</button>
            )
        }
        // waiting / running
        return (
            <button
                className="cancel-btn"
                onClick={() => stopFragment(fragment.index)}
            >{i18n.stopDownload}</button>
        )
    }

    return (
        <div className="downItem">
            <div className="explain">{fragment.downFileName}</div>
            <div className="downFilepProgress">{progressText}</div>
            <div className="progress-container">
                <div className="progress-wrapper">
                    <div className="progress-bar">
                        <div className={barClass} style={{ width: barWidth }}>{barWidth}</div>
                    </div>
                </div>
                {renderButton()}
            </div>
        </div>
    )
}
