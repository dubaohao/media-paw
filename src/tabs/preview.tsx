// @ts-nocheck
/**
 * Plasmo Tab Page 入口：tabs/preview.html
 * 媒体资源预览/独立窗口页面，页面逻辑见 components/preview
 */
import React from "react"
import "~styles/public.css"
import PreviewRoot from "~components/preview"

/** preview 页面根：静态样式由打包器注入 head，仅挂载页面组件 */
export default function PreviewPage() {
  return <PreviewRoot />
}
