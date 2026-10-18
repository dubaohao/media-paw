/**
 * AboutSection 关于 section：版本号 + 文档/GitHub 链接
 * 迁移自 options.html #anchorAbout
 */
// @ts-nocheck
import React from "react"
import { i18n } from "~lib/init"

/** 关于 section */
export function AboutSection() {
    const version = chrome.runtime.getManifest().version

    return (
        <section id="anchorAbout">
            <h1 className="optionsTitle">{i18n.about}</h1>
            <div className="optionBox">
                <div className="item">
                    <div id="version">{i18n.catCatch} v{version}</div>
                </div>
                <div className="item">
                    <span>{i18n.documentation}</span>:
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">https://github.com/dubaohao/media-paw</a>
                </div>
                <div className="item">
                    Github:
                    <a href="https://github.com/dubaohao/media-paw" target="_blank">https://github.com/dubaohao/media-paw</a>
                </div>
            </div>
        </section>
    )
}
