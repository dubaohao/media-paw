/**
 * OperationSection 操作按钮 section：导出/导入/清空数据/重置所有/重启
 * 迁移自 options.html #anchorOperation 与 options.js 的导出导入逻辑
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n, G } from "~lib/init"
import { appendZero, downloadDataURL } from "~lib/function"
import { Base64 } from "~lib/base64"
import { useOptionsStore } from "~options/store"

/** 操作按钮 section */
export function OperationSection() {
    const { reload } = useOptionsStore()
    const fileInputRef = useRef<HTMLInputElement>(null)

    /** 导出配置：读取所有 storage.sync 数据并 Base64 编码下载 */
    const handleExport = () => {
        chrome.storage.sync.get(null, function (items: any) {
            let exportData = JSON.stringify(items)
            exportData = "data:text/plain," + Base64.encode(exportData)
            const date = new Date()
            const filename = `cat-catch-${chrome.runtime.getManifest().version}-${date.getFullYear()}${appendZero(date.getMonth() + 1)}${appendZero(date.getDate())}T${appendZero(date.getHours())}${appendZero(date.getMinutes())}.txt`
            if (G.isFirefox) {
                downloadDataURL(exportData, filename)
                return
            }
            chrome.downloads.download({ url: exportData, filename })
        })
    }

    /** 导入配置：读取文件 -> JSON.parse 或 Base64.decode -> 逐项 set */
    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) { return }
        const reader = new FileReader()
        reader.onload = function () {
            let importData: any = this.result
            try {
                importData = JSON.parse(importData)
            } catch (e) {
                importData = JSON.parse(Base64.decode(importData))
            }
            for (const key in G.OptionLists) {
                if (importData[key] !== undefined) {
                    chrome.storage.sync.set({ [key]: importData[key] })
                }
            }
            alert(i18n.alertimport)
            reload()
        }
        reader.readAsText(file)
    }

    /** 清空数据：清除 local+session 缓存 */
    const handleClearData = () => {
        chrome.storage.local.clear()
        chrome.storage.session.clear()
        chrome.runtime.sendMessage({ Message: "ClearIcon" })
        reload()
    }

    /** 重置所有设置 */
    const handleResetAll = () => {
        if (!confirm(i18n.confirmReset)) { return }
        chrome.storage.sync.clear()
        chrome.storage.local.clear()
        chrome.storage.session.clear()
        chrome.runtime.sendMessage({ Message: "ClearIcon" })
        reload()
    }

    /** 重启扩展 */
    const handleRestart = () => {
        chrome.runtime.reload()
    }

    /** 触发文件选择 */
    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    return (
        <section id="anchorOperation">
            <h1 className="optionsTitle">{i18n.operation}</h1>
            <div className="optionBox">
                <div className="flex-end" style={{ justifyContent: "center" }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hide"
                        onChange={handleImportFile}
                    />
                    <button type="button" onClick={handleExport}>{i18n.exportSettings}</button>
                    <button type="button" onClick={handleImportClick}>{i18n.importConfiguration}</button>
                    <button type="button" onClick={handleClearData}>{i18n.clearCapturedData}</button>
                    <button type="button" onClick={handleResetAll}>{i18n.resetAllSettings}</button>
                    <button type="button" onClick={handleRestart}>{i18n.restartExtension}</button>
                </div>
            </div>
        </section>
    )
}
