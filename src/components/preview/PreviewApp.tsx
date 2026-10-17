// @ts-nocheck
/**
 * Preview 主容器
 * 静态样式（public/preview）由 src/preview.tsx 入口 import；
 * 此处仅注入运行时样式（移动端 mobile.css + 用户自定义 G.css）
 */
import React, { useEffect } from "react"
import { i18n } from "~lib/init"
import { loadCSS } from "~lib/function"
import { usePreviewStore } from "./store"
import { FilterBar } from "./FilterBar"
import { FileGrid } from "./FileGrid"
import { Pagination } from "./Pagination"
import { VideoPreview } from "./VideoPreview"
import s from "./preview.module.css"

/** Preview 主容器组件 */
export function PreviewApp() {
  const store = usePreviewStore()
  const { ready } = store

  /** 注入运行时样式并设置标题 */
  useEffect(() => {
    loadCSS()
    document.title = i18n.catCatch || "catCatch"
  }, [])

  if (!ready) {
    return (
      <div className={s.container}>
        <div style={{ padding: 12 }}>{i18n.loadingData}</div>
      </div>
    )
  }

  return (
    <>
      {/* 视频/图片预览浮层 */}
      <VideoPreview />
      <div className={s.container}>
        {/* 筛选条件栏 */}
        <FilterBar />
        {/* 文件列表网格 */}
        <FileGrid />
        {/* 框选容器（保留 DOM 结构兼容 CSS） */}
        <div className={s["selection-box"]}></div>
        {/* 分页控件 */}
        <Pagination />
      </div>
    </>
  )
}
