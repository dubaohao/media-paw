/**
 * Plasmo Options 入口：渲染 cat-catch 设置页
 * 等待 G 初始化完成后挂载 OptionsApp
 */
// @ts-nocheck
import React, { useEffect, useState } from "react"
import { G, i18n } from "~lib/init"
import { OptionsStoreProvider } from "~components/options/store"
import { OptionsApp } from "~components/options/OptionsApp"

// 静态样式：parcel 提取为 CSS 注入 head
import "~styles/public.css"
import "~styles/options.css"

/** 注入运行时样式：移动端样式表（UA 条件加载）与用户自定义 CSS */
function injectRuntimeStyles() {
  if (G.isMobile) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.type = "text/css"
    link.href = chrome.runtime.getURL("assets/css/mobile.css")
    document.head.appendChild(link)
  }
  const style = document.createElement("style")
  style.textContent = G.css || ""
  document.head.appendChild(style)
}

/** Options 根组件：等待 G 就绪后渲染 */
function OptionsRoot() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!G.initSyncComplete || !G.initLocalComplete) { return }
            clearInterval(timer)
            setReady(true)
        }, 0)
        return () => clearInterval(timer)
    }, [])

    if (!ready) {
        return <div id="Tips" style={{ padding: 12 }}>{i18n.loadingData}</div>
    }

    return (
        <OptionsStoreProvider>
            <OptionsApp />
        </OptionsStoreProvider>
    )
}

injectRuntimeStyles()
document.title = i18n.titleOption || "catCatch"

// Plasmo 约定：默认导出根组件
export default OptionsRoot
