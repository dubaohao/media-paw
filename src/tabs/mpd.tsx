// @ts-nocheck
/**
 * Plasmo Tab Page 入口：tabs/mpd.html
 * DASH(MPD) 解析页面，页面逻辑见 components/tabs/mpd
 */
import React from "react"
import "~styles/public.css"
import "~styles/options.css"
import MpdRoot from "~components/tabs/mpd"

/** mpd 页面根：静态样式由打包器注入 head，仅挂载页面组件 */
export default function MpdPage() {
  return <MpdRoot />
}
