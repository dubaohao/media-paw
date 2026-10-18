/**
 * DownloaderSection 下载器 section：catDownload/downAutoClose/downActive/downStream 开关
 * 迁移自 options.html #anchorDownloader
 */
// @ts-nocheck
import React from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** 下载器 section */
export function DownloaderSection() {
    const { options, updateOption } = useOptionsStore()

    return (
        <section id="anchorDownloader">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/cat-down.png")} style={{ width: 18 }} className="cat-down" alt="Downloader icon" />
                <p>{i18n.downloader}</p>
            </h1>
            <div className="optionBox" id="downOption">
                <span className="explain">{i18n.downloaderTip}</span>
                <div className="list">
                    <div className="item">
                        <div>{i18n.alwaysDisableCatCatcher}</div>
                        <Switch
                            checked={!!options.catDownload}
                            onChange={(v) => updateOption("catDownload", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.autoClosePageAfterDownload}</div>
                        <Switch
                            checked={!!options.downAutoClose}
                            onChange={(v) => updateOption("downAutoClose", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.openDownloaderPageInBackground}</div>
                        <Switch
                            checked={!!options.downActive}
                            onChange={(v) => updateOption("downActive", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.downloadWhileSaving}</div>
                        <Switch
                            checked={!!options.downStream}
                            onChange={(v) => updateOption("downStream", v)}
                        />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["catDownload", "downAutoClose", "downActive", "downStream"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
