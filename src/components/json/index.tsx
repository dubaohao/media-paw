// @ts-nocheck
/**
 * JSON 页面根组件：等待 G 就绪后渲染 JsonApp
 * 静态样式（public/options）由 src/json.tsx 入口 import；
 * 移动端样式与用户自定义 CSS 由 JsonApp 内 loadCSS() 注入
 */
import React, { useEffect, useState } from "react"
import { G, i18n } from "~lib/init"
import { JsonApp } from "./JsonApp"

/** JSON 页面根组件 */
export default function JsonRoot() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        document.title = i18n.titleJson || "JSON"
        const timer = window.setInterval(() => {
            if (G.initSyncComplete && G.initLocalComplete) {
                clearInterval(timer)
                setReady(true)
            }
        }, 0)
        return () => clearInterval(timer)
    }, [])

    if (!ready) {
        return <div style={{ padding: 12 }}>{i18n.loadingData || "Loading..."}</div>
    }

    return <JsonApp />
}
