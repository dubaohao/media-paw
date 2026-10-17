/**
 * CustomCssSection 自定义 CSS section：css textarea
 * 迁移自 options.html #anchorCustomCSS
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"

/** 自定义 CSS section */
export function CustomCssSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>(null)

    const handleInput = (value: string) => {
        updateOption("css", value)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            chrome.storage.sync.set({ css: value })
        }, 300)
    }

    return (
        <section id="anchorCustomCSS">
            <h1 className="optionsTitle">{i18n.customCSS}</h1>
            <div className="optionBox">
                <div className="item">
                    <textarea
                        className="width100"
                        rows={10}
                        value={options.css || ""}
                        onChange={(e) => handleInput(e.target.value)}
                    />
                </div>
            </div>
        </section>
    )
}
