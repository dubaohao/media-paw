// @ts-nocheck
/**
 * Plasmo Options 入口：渲染 cat-catch 设置页
 * 页面根组件 OptionsRoot：等待 G 初始化完成后挂载主视图
 * 主视图（OptionsMain）：loading 门控 + 左侧 sticky 导航 + 右侧内容区（flex 双栏，窄屏上下布局）
 * 静态样式（public/options）由 parcel 提取为 CSS 注入 head
 */
import React, { useEffect, useState } from "react"
import { G, i18n } from "~lib/init"
import { OptionsStoreProvider, useOptionsStore } from "./store"
import { OptionsNav } from "./components/OptionsNav"
import { SuffixSection } from "./components/SuffixSection"
import { TypeSection } from "./components/TypeSection"
import { RegexSection } from "./components/RegexSection"
import { BlockUrlSection } from "./components/BlockUrlSection"
import { TitleRulesSection } from "./components/TitleRulesSection"
import { ScriptSection } from "./components/ScriptSection"
import { CopySection } from "./components/CopySection"
import { Aria2RpcSection } from "./components/Aria2RpcSection"
import { Send2localSection } from "./components/Send2localSection"
import { M3u8dlSection } from "./components/M3u8dlSection"
import { InvokeAppSection } from "./components/InvokeAppSection"
import { ReplaceTagsSection } from "./components/ReplaceTagsSection"
import { DownloaderSection } from "./components/DownloaderSection"
import { M3u8ParserSection } from "./components/M3u8ParserSection"
import { OtherSettingsSection } from "./components/OtherSettingsSection"
import { CustomCssSection } from "./components/CustomCssSection"
import { MqttSection } from "./components/MqttSection"
import { OperationSection } from "./components/OperationSection"
import { AboutSection } from "./components/AboutSection"

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
            <OptionsMain />
        </OptionsStoreProvider>
    )
}

/** Options 主视图（StoreProvider 内层）：loading 门控 + 导航 + 各设置分区 */
function OptionsMain() {
    const { loading } = useOptionsStore()

    if (loading) {
        return <div style={{ padding: 12 }}>Loading...</div>
    }

    return (
        <div className="optionsPage">
            <OptionsNav />
            <main className="optionsMain">
                <div className="wrapper options">
                <SuffixSection />
                <TypeSection />
                <RegexSection />
                <BlockUrlSection />
                <TitleRulesSection />
                <ScriptSection />
                <CopySection />
                <Aria2RpcSection />
                <Send2localSection />
                <M3u8dlSection />
                <InvokeAppSection />
                <ReplaceTagsSection />
                <DownloaderSection />
                <M3u8ParserSection />
                <OtherSettingsSection />
                <CustomCssSection />
                <MqttSection />
                <OperationSection />
                <AboutSection />
                </div>
            </main>
        </div>
    )
}

injectRuntimeStyles()
document.title = i18n.titleOption || "catCatch"

// Plasmo 约定：默认导出根组件
export default OptionsRoot
