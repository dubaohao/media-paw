/**
 * ResetButton 重置按钮：在确认后重置 optionBox 内的所有 save 项
 * 迁移自原版 .resetOption 的点击逻辑
 */
// @ts-nocheck
import React from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"

interface ResetButtonProps {
    /** 需要重置的配置项键名列表 */
    keys: string[]
    /** 可选的子内容（默认为 i18n.resetSettings） */
    children?: React.ReactNode
}

/** 重置按钮：调用 store.resetOption 并 reload */
export function ResetButton(props: ResetButtonProps) {
    const { keys, children } = props
    const { resetOption, reload } = useOptionsStore()

    const handleClick = () => {
        if (!confirm(i18n.confirmReset)) { return }
        resetOption(keys)
        reload()
    }

    return (
        <button type="button" className="resetOption" onClick={handleClick}>
            {children ?? i18n.resetSettings}
        </button>
    )
}
