/**
 * 资源列表：当前页 + 其他页合并为单列表（最新在上），不再分组显示
 */
// @ts-nocheck
import React, { useEffect } from "react"
import { i18n } from "~lib/init"
import { useMediaStore } from "./store"
import { ResourceRow } from "./ResourceRow"

/** 渲染合并后的资源列表与空态提示 */
export function MediaList() {
  const {
    current,
    other,
    otherLoaded,
    loadOther,
    refreshCurrent,
    blockedSite,
    skipped
  } = useMediaStore()

  // 挂载即加载其他页面数据（原懒加载改为合并展示）并补拉当前页增量
  useEffect(() => {
    loadOther()
    refreshCurrent()
  }, [loadOther, refreshCurrent])

  /**
   * 全局排序：当前页与其他页合并后统一按更新时间倒序（最近更新的排最前）。
   * 不再做「当前页置顶」——所有 tab 的侧边栏基于同一份数据源排序，呈现完全一致的顺序。
   * updateTime 缺失时回退 getTime（旧数据兼容），再缺省按 0 排最后。
   */
  const byUpdateTime = (a: any, b: any) =>
    (b.updateTime ?? b.getTime ?? 0) - (a.updateTime ?? a.getTime ?? 0)
  const mergedList = [...current.values(), ...other.values()].sort(byUpdateTime)
  const total = mergedList.length

  return (
    <div id="mediaList" className="container TabShow">
      {total === 0 && otherLoaded && (
        <div id="Tips" className="emptyState">
          <span className="emptyPaw">🐾</span>
          <span>
            {blockedSite
              ? i18n("isBlockedSite")
              : skipped
                ? i18n.loadingData
                : i18n.noData}
          </span>
        </div>
      )}
      {/* 全局统一顺序渲染；isCurrent 标识资源所属分组（勾选/删除/改名仍作用于原分组） */}
      {mergedList.map(data => (
        <ResourceRow
          key={data.requestId}
          data={data}
          isCurrent={current.has(data.requestId)}
        />
      ))}
    </div>
  )
}
