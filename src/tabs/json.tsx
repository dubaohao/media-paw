// @ts-nocheck
/**
 * Plasmo Tab Page 入口：tabs/json.html
 * JSON 格式化页面，页面逻辑见 components/tabs/json
 */
import React from "react"
import "~styles/public.css"
import "~styles/options.css"
import JsonRoot from "~components/tabs/json"

/** json 页面根：静态样式由打包器注入 head，仅挂载页面组件 */
export default function JsonPage() {
  return <JsonRoot />
}
