// @ts-nocheck
/**
 * Preview 页面根组件
 * 包装 Store Provider 与主应用
 */
import React from "react"
import { PreviewStoreProvider } from "./store"
import { PreviewApp } from "./PreviewApp"

/** Preview 根组件：套上 Store Provider 后挂载主容器 */
export default function PreviewRoot() {
  return (
    <PreviewStoreProvider>
      <PreviewApp />
    </PreviewStoreProvider>
  )
}
