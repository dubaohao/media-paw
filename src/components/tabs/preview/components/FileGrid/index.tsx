// @ts-nocheck
/**
 * 文件列表网格（迁移自 #file-container .file-grid）
 * 渲染过滤后的文件卡片列表
 */
import React from "react"
import { i18n } from "~lib/init"
import { usePreviewStore } from "~components/tabs/preview/store"
import { FileCard } from "./FileCard"
import s from "~components/tabs/preview/preview.module.css"

/** 文件列表网格组件 */
export function FileGrid() {
  const store = usePreviewStore()
  const { ready, filteredItems } = store

  // 数据加载中
  if (!ready) {
    return (
      <div className={s["file-grid"]}>
        <div style={{ padding: 12 }}>{i18n.loadingData}</div>
      </div>
    )
  }

  // 无数据
  if (filteredItems.length === 0) {
    return (
      <div className={s["file-grid"]}>
        <div style={{ padding: 12 }}>{i18n.noData}</div>
      </div>
    )
  }

  return (
    <div className={s["file-grid"]}>
      {filteredItems.map((item: any, index: number) => (
        <FileCard key={item.requestId || index} item={item} index={index} />
      ))}
    </div>
  )
}
