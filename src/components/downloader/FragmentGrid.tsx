// @ts-nocheck
/**
 * 分片网格汇总：顶部百分比 + 成功/总数 + 每分片一格的状态网格
 * 迁移自 downloader.js 的 .fragSummary 区块
 *
 * 颜色规则：
 * - 灰色（默认 fragCell）：等待中
 * - 绿色（fragCell.ok）：下载成功
 * - 红色（fragCell.err）：下载失败
 * 当失败分片重试成功后自动从 err 列表移除并变绿
 */
import React from "react"
import { useDownloaderStore } from "./store"

/** 单个分片格子的颜色类名 */
function cellClass(state: string): string {
    if (state === "success") { return "fragCell ok" }
    if (state === "error") { return "fragCell err" }
    return "fragCell"
}

/** 分片网格汇总组件 */
export function FragmentGrid() {
    const { fragments, total, success, tick } = useDownloaderStore()
    // tick 变化即触发重渲染（高频进度更新场景）
    void tick
    const pct = total ? Math.floor(success / total * 100) : 0

    return (
        <div className="fragSummary">
            <div className="fragInfo">
                <span className="fragPercent">{pct}%</span>
                <span className="fragCount">{success}/{total}</span>
            </div>
            <div className="fragGrid">
                {fragments.map(v => (
                    <span
                        key={v.index}
                        className={cellClass(v.state)}
                        data-idx={v.index}
                    />
                ))}
            </div>
        </div>
    )
}
