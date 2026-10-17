/**
 * OptionsApp 主容器：左侧 sticky 导航 + 右侧内容区（flex 双栏，窄屏自动切换为上下布局）
 * 迁移自 options.html 的 <div class="wrapper options">
 */
// @ts-nocheck
import React from "react"
import { useOptionsStore } from "./store"
import { OptionsNav } from "./OptionsNav"
import { SuffixSection } from "./SuffixSection"
import { TypeSection } from "./TypeSection"
import { RegexSection } from "./RegexSection"
import { BlockUrlSection } from "./BlockUrlSection"
import { TitleRulesSection } from "./TitleRulesSection"
import { ScriptSection } from "./ScriptSection"
import { CopySection } from "./CopySection"
import { Aria2RpcSection } from "./Aria2RpcSection"
import { Send2localSection } from "./Send2localSection"
import { M3u8dlSection } from "./M3u8dlSection"
import { InvokeAppSection } from "./InvokeAppSection"
import { ReplaceTagsSection } from "./ReplaceTagsSection"
import { DownloaderSection } from "./DownloaderSection"
import { M3u8ParserSection } from "./M3u8ParserSection"
import { OtherSettingsSection } from "./OtherSettingsSection"
import { CustomCssSection } from "./CustomCssSection"
import { MqttSection } from "./MqttSection"
import { OperationSection } from "./OperationSection"
import { AboutSection } from "./AboutSection"

/** Options 主应用 */
export function OptionsApp() {
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
