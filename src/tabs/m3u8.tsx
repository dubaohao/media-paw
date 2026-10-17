// @ts-nocheck
/**
 * Plasmo Tab Page 入口：tabs/m3u8.html
 * M3U8 解析与多任务下载页，页面逻辑见 components/m3u8
 */
import React from "react"
import "~styles/public.css"
import "~styles/options.css"
import M3u8Root from "~components/m3u8"

/** m3u8 页面根：静态样式由打包器注入 head，仅挂载页面组件 */
export default function M3u8Page() {
  return <M3u8Root />
}
