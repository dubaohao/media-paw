// @ts-nocheck
/**
 * Plasmo 页面入口：sidepanel.html（侧边栏 / 原生 popup / 独立窗口共用）
 * 自定义页面（m3u8/downloader/mpd/json/preview/install）已拆为 src 下独立入口
 */
import React, { useEffect, useState } from "react"

// 静态样式：parcel 提取为 CSS 注入 head，先于 JS 生效
import "./loading.css"
import "~styles/public.css"
import "~components/sidepanel/sidepanel.css"

// 引入 init 即触发 G 的 storage 初始化（ESM 单例，function/store 共享同一实例）
import { G, i18n } from "~lib/init"
import { closeTab } from "~lib/function"
import { App } from "~components/sidepanel/App"
import { MediaStoreProvider, setPageDOM } from "~components/sidepanel/store"
import { tabSendMessage } from "~components/sidepanel/api"

// 通过文件名判断是否为 side panel 模式
const isSidePanel = location.pathname.endsWith("sidepanel.html")
// URL 参数：tabId=独立窗口/侧栏目标标签；type=window/tab 独立窗口
const params = new URL(location.href).searchParams
const urlTabId = parseInt(params.get("tabId"))
const sideType = params.get("type")

/** 注入运行时样式：移动端样式表（UA 条件加载）+ Firefox 兼容隐藏规则 */
function injectRuntimeStyles() {
  if (G.isMobile) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.type = "text/css"
    link.href = chrome.runtime.getURL("assets/css/mobile.css")
    document.head.appendChild(link)
  }
  const style = document.createElement("style")
  style.textContent = `
    ${G.isFirefox ? ".firefoxHide{display:none!important;}" : ""}
    ${G.isFirefox && G.version < 128 ? ".firefoxHideScript{display:none!important;}" : ""}
  `
  document.head.appendChild(style)
}

/** 按 popupMode 在新标签页/窗口中打开独立面板（对应原版 #popup 点击逻辑） */
function openStandalone() {
  const tabId = G.tabId
  switch (G.popupMode) {
    case 1:
      chrome.tabs.create({ url: `sidepanel.html?tabId=${tabId}&type=tab` })
      break
    case 2:
      chrome.windows.create({
        url: `tabs/preview.html?tabId=${tabId}`,
        type: "popup",
        height: 1080,
        width: 1920
      })
      break
    case 3:
      chrome.windows.create({
        url: `sidepanel.html?tabId=${tabId}&type=window`,
        type: "popup",
        height: 1080,
        width: 1920
      })
      break
    default:
      chrome.tabs.create({ url: `tabs/preview.html?tabId=${tabId}` })
  }
}

injectRuntimeStyles()
document.title = i18n.catCatch || "catCatch"

/** Sidepanel 根组件：等待 G 就绪后再启动 store */
export default function SidepanelRoot() {
  const [ready, setReady] = useState(false)
  const [autoOpened, setAutoOpened] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!G.initSyncComplete || !G.initLocalComplete || !G.tabId) { return }
      clearInterval(timer)

      // 配置为自动开窗：关闭当前页面并打开独立面板（仅弹窗模式）
      if (G.popup && !isSidePanel) {
        setAutoOpened(true)
        openStandalone()
        closeTab()
        return
      }
      // 侧栏模式或独立窗口：以 URL 指定的 tabId 为准
      if (urlTabId) {
        G.tabId = urlTabId
      }
      // 可选：拉取页面 DOM 供文件名模板 find() 使用
      if (G.getHtmlDOM) {
        try {
          const html = await tabSendMessage(G.tabId, { Message: "getPage" }, { frameId: 0 })
          if (html) {
            setPageDOM(new DOMParser().parseFromString(html, "text/html"))
          }
        } catch (e) {
          console.error("Error getting page:", e)
        }
      }
      setReady(true)
    }, 0)
    return () => clearInterval(timer)
  }, [])

  if (autoOpened) { return null }
  if (!ready) {
    return <div id="Tips" style={{ padding: 12 }}>{i18n.loadingData}</div>
  }

  return (
    <MediaStoreProvider tabId={G.tabId}>
      <App
        sideMode={isSidePanel || !!urlTabId}
        windowType={sideType === "window"}
        sideType={sideType}
      />
    </MediaStoreProvider>
  )
}
