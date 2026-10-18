/**
 * OptionsNav 侧边导航：锚点链接 + 滚动跟随高亮
 * 迁移自 options.html 的 <nav class="sidebar"> 与 options.js 的导航事件绑定
 */
// @ts-nocheck
import React, { useEffect, useRef, useState } from "react"
import { i18n } from "~lib/init"

interface NavItem {
    /** 锚点 id */
    anchor: string
    /** 显示文案（i18n key 或字面量） */
    label: string
    /** title 属性 */
    title?: string
}

/** 导航项列表 */
const navItems: NavItem[] = [
    { anchor: "anchorSuffix", label: i18n.suffix, title: "suffix" },
    { anchor: "anchorType", label: i18n.type, title: "type" },
    { anchor: "anchorRegexMatch", label: i18n.regexMatch, title: "regexMatch" },
    { anchor: "anchorBlockUrl", label: i18n.blockUrl, title: "blockUrl" },
    { anchor: "anchorTitleRules", label: "标题规则", title: "titleRules" },
    { anchor: "anchorScriptSettings", label: i18n.Script, title: "Script" },
    { anchor: "anchorCopy", label: i18n.copy, title: "copy" },
    { anchor: "anchorAria2Rpc", label: "Aria2 RPC", title: "Aria2 RPC" },
    { anchor: "anchorSend2local", label: i18n.send2local, title: "send2local" },
    { anchor: "anchorM3u8dl", label: i18n.sideurlprotocol, title: "URL Protocol m3u8dl" },
    { anchor: "anchorInvokeApp", label: i18n.invokeApp, title: "invokeApp" },
    { anchor: "anchorReplaceTags", label: i18n.replaceTags, title: "replaceTags" },
    { anchor: "anchorDownloader", label: i18n.downloader, title: "downloader" },
    { anchor: "anchorM3u8Parser", label: i18n.m3u8Parser, title: "m3u8Parser" },
    { anchor: "anchorOtherSettings", label: i18n.otherSettings, title: "otherSettings" },
    { anchor: "anchorCustomCSS", label: i18n.customCSS, title: "customCSS" },
    { anchor: "anchorMQTT", label: "MQTT", title: "MQTT" },
    { anchor: "anchorOperation", label: i18n.operation, title: "operation" },
    { anchor: "anchorAbout", label: i18n.about, title: "about" }
]

/** 侧边导航 */
export function OptionsNav() {
    /** 当前滚动位置对应的导航项（IntersectionObserver 维护） */
    const [active, setActive] = useState(navItems[0]?.anchor)
    const navRef = useRef<HTMLElement>(null)

    /** 点击导航项：平滑滚动到锚点 */
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, anchor: string) => {
        e.preventDefault()
        const target = document.getElementById(anchor)
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }

    /** 滚动跟随：取视口上部最先进入观察范围的 section 作为当前项 */
    useEffect(() => {
        const sections = navItems
            .map(item => document.getElementById(item.anchor))
            .filter(Boolean)
        if (!sections.length) { return }
        const observer = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id)
                    }
                }
            },
            // 顶部 120px 判定带：section 顶部进入该带即视为当前
            { rootMargin: "-80px 0px -75% 0px", threshold: 0 }
        )
        sections.forEach(el => observer.observe(el))
        return () => observer.disconnect()
    }, [])

    /** active 项滚动到可视区（键盘/长列表下导航条自动跟随） */
    useEffect(() => {
        const el = navRef.current?.querySelector(`a[href="#${active}"]`)
        el?.scrollIntoView({ block: "nearest" })
    }, [active])

    return (
        <nav className="sidebar" aria-label="Main Navigation" ref={navRef}>
            <div className="sidebarBrand">🐾 Cat Catch</div>
            <ul>
                {navItems.map((item) => (
                    <li key={item.anchor}>
                        <a
                            href={`#${item.anchor}`}
                            title={item.title}
                            className={active === item.anchor ? "active" : ""}
                            onClick={(e) => handleClick(e, item.anchor)}
                        >
                            {item.label}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    )
}
