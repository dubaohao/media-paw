// @ts-nocheck
/**
 * Plasmo Tab Page 入口：tabs/downloader.html
 * 猫抓下载器（带头下载/合并）页面，页面逻辑见 components/tabs/downloader
 */
import React from "react"
import "~styles/public.css"
import "~styles/options.css"
import DownloaderRoot from "~components/tabs/downloader"

/** downloader 页面根：静态样式由打包器注入 head，仅挂载页面组件 */
export default function DownloaderPage() {
  return <DownloaderRoot />
}
