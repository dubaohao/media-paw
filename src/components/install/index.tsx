// @ts-nocheck
/**
 * 安装成功页面根组件
 * 迁移自 install.html + js/install.js
 * 支持中英双语切换、隐私政策展示、同意/卸载按钮
 */
import React, { useState, useEffect } from "react"
import { closeTab } from "~lib/function"
import s from "./install.module.css"

/** 安装页文本资源（中英双语） */
const TEXTS = {
    zh: {
        mainTitle: "恭喜 猫爪 扩展已成功安装 !",
        subtitle: "Installation successful !",
        welcome: "希望本扩展能帮助到你",
        privacy: "隐私政策 / Privacy Policy",
        disclaimer: "免责声明 / Disclaimer",
        issue: "问题提交 / Issue Submission",
        agree: "同意",
        uninstall: "卸载扩展",
        langLabel: "English",
        langEmoji: "🌐",
        privacyContent: "本扩展收集所有信息都在本地储存处理，不会发送到远程服务器，不包含任何跟踪器。",
        disclaimerContent: '本扩展仅供下载用户拥有版权或已获授权的视频，禁止用于下载受版权保护且未经授权的内容。用户需自行承担使用本工具的全部法律责任，开发者不对用户的任何行为负责。本工具按"原样"提供，开发者不承担任何直接或间接责任。',
        agreement: '点击"同意"或"关闭本页面"即表示您已阅读并同意以上内容。',
    },
    en: {
        mainTitle: "Installation Successful!",
        subtitle: "Cat Catch Extension is now installed",
        welcome: "Welcome to Cat Catch",
        privacy: "Privacy Policy",
        disclaimer: "Disclaimer",
        issue: "Issue Submission",
        agree: "Agree",
        uninstall: "Uninstall Extension",
        langLabel: "中文",
        langEmoji: "🇨🇳",
        privacyContent: "The extension collects and processes all information locally without sending it to remote servers and does not include any trackers.",
        disclaimerContent: 'This extension is intended for downloading videos that you own or have authorized access to. It is prohibited to use this Tool for downloading copyrighted content without permission. Users are solely responsible for their actions, and the developer is not liable for any user behavior. This Tool is provided "as-is," and the developer assumes no direct or indirect liability.',
        agreement: 'By clicking "Agree" or "Close this page," you confirm that you have read and agree to the above terms.',
    }
}

/**
 * 安装成功页面根组件
 * 根据浏览器语言自动选择中/英，支持手动切换
 */
export default function InstallRoot() {
    const [lang, setLang] = useState<"zh" | "en">("zh")
    const t = TEXTS[lang]

    useEffect(() => {
        // install.module.css 由本组件静态 import（CSS Module）
        document.title = "猫爪扩展安装成功"

        // 根据浏览器语言自动选择
        const browserLang = navigator.language || navigator.userLanguage
        setLang(browserLang.startsWith("zh") ? "zh" : "en")
    }, [])

    /** 切换语言 */
    const toggleLang = () => setLang(prev => prev === "zh" ? "en" : "zh")

    /** 同意按钮：关闭当前标签 */
    const handleAgree = () => closeTab()

    /** 卸载按钮 */
    const handleUninstall = () => {
        chrome.management.uninstallSelf({ showConfirmDialog: true })
    }

    return (
        <div className={s.container}>
            {/* 语言切换按钮 */}
            <div className={s["lang-switch"]} id="langToggle" onClick={toggleLang} style={{ cursor: "pointer" }}>
                <span className={s["lang-emoji"]}>{t.langEmoji}</span>
                <span className={s["lang-text"]}>{t.langLabel}</span>
            </div>

            <div className={s.header}>
                <div className={s["logo-container"]}>
                    <div className={s.logo}>
                        <img src={chrome.runtime.getURL("assets/img/icon.png")} alt="logo" />
                    </div>
                </div>
                <h1 id="main-title">{t.mainTitle}</h1>
                <div className={s.subtitle}>{t.subtitle}</div>
            </div>

            <div className={`${s.card} ${s["fade-in"]}`}>
                <div className={s["card-header"]}>
                    <div className={s["card-title"]}>
                        <span className={s.emoji}>🙌</span>
                        <span>{t.welcome}</span>
                    </div>
                </div>
                <div className={s["card-body"]}>
                    {/* 隐私政策 */}
                    <div className={s["policy-section"]}>
                        <div className={s["section-title"]}>
                            <span className={s.emoji}>🔒</span>
                            <span>{t.privacy}</span>
                        </div>
                        <div className={s["content-box"]}>
                            <p>{t.privacyContent}</p>
                        </div>
                    </div>

                    {/* 免责声明 */}
                    <div className={s["policy-section"]}>
                        <div className={s["section-title"]}>
                            <span className={s.emoji}>⚠️</span>
                            <span>{t.disclaimer}</span>
                        </div>
                        <div className={s["content-box"]}>
                            <p>{t.disclaimerContent}</p>
                        </div>
                    </div>

                    {/* 问题提交 */}
                    <div className={s["policy-section"]}>
                        <div className={s["section-title"]}>
                            <span className={s.emoji}>🚨</span>
                            <span>{t.issue}</span>
                        </div>
                        <div className={s["content-box"]}>
                            <a href="https://github.com/dubaohao/media-paw/issues" target="_blank" rel="noreferrer">
                                <span className={s.emoji}>🔗</span>
                                https://github.com/dubaohao/media-paw/issues
                            </a>
                        </div>
                    </div>

                    {/* 协议 */}
                    <div className={s.agreement}>
                        <p>{t.agreement}</p>
                    </div>

                    {/* 按钮 */}
                    <div className={s.buttons}>
                        <button className={`${s.btn} ${s["btn-primary"]}`} onClick={handleAgree}>
                            <span className={s.emoji}>✅</span>
                            <span>{t.agree}</span>
                        </button>
                        <button className={`${s.btn} ${s["btn-outline"]}`} onClick={handleUninstall}>
                            <span className={s.emoji}>🗑️</span>
                            <span>{t.uninstall}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
