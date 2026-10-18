/**
 * M3u8ParserSection m3u8解析器 section：自动下载/线程数/MP4/纯音频/跳过解密/边下边存/ffmpeg/自动关闭
 * 迁移自 options.html #anchorM3u8Parser
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "~options/store"
import { Switch } from "../Switch"
import { ResetButton } from "../ResetButton"

/** m3u8 解析器 section */
export function M3u8ParserSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>(null)

    const handleNumberInput = (key: string, value: string) => {
        const num = parseInt(value)
        updateOption(key, isNaN(num) ? 0 : num)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            chrome.storage.sync.set({ [key]: isNaN(num) ? 0 : num })
        }, 300)
    }

    return (
        <section id="anchorM3u8Parser">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/parsing.png")} style={{ width: 18 }} className="parsing" alt="Parser icon" />
                <p>{i18n.m3u8Parser}</p>
            </h1>
            <div className="optionBox" id="m3u8Option">
                <div className="list">
                    <div className="item">
                        <div>
                            <img src={chrome.runtime.getURL("assets/img/download.svg")} style={{ width: 18 }} className="download" alt="download" />{" "}
                            <span>{i18n.autoDownM3u8Tip}</span>
                        </div>
                        <Switch
                            checked={!!options.m3u8AutoDown}
                            onChange={(v) => updateOption("m3u8AutoDown", v)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.downloadThreads}</div>
                        <div className="switch">
                            <input
                                type="number"
                                min={1}
                                max={32}
                                className="width3rem"
                                value={options.M3u8Thread ?? 6}
                                onChange={(e) => handleNumberInput("M3u8Thread", e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.mp4Format}</div>
                        <Switch checked={!!options.M3u8Mp4} onChange={(v) => updateOption("M3u8Mp4", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.audioOnly}</div>
                        <Switch checked={!!options.M3u8OnlyAudio} onChange={(v) => updateOption("M3u8OnlyAudio", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.skipDecryption}</div>
                        <Switch checked={!!options.M3u8SkipDecrypt} onChange={(v) => updateOption("M3u8SkipDecrypt", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.downloadWhileSaving}</div>
                        <Switch checked={!!options.M3u8StreamSaver} onChange={(v) => updateOption("M3u8StreamSaver", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.ffmpegTranscoding}</div>
                        <Switch checked={!!options.M3u8Ffmpeg} onChange={(v) => updateOption("M3u8Ffmpeg", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.autoClosePageAfterDownload}</div>
                        <Switch checked={!!options.M3u8AutoClose} onChange={(v) => updateOption("M3u8AutoClose", v)} />
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["m3u8AutoDown", "M3u8Thread", "M3u8Mp4", "M3u8OnlyAudio", "M3u8SkipDecrypt", "M3u8StreamSaver", "M3u8Ffmpeg", "M3u8AutoClose"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
