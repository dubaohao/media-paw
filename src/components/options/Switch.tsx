/**
 * Switch 开关组件：复用原 .switch/.switchLabel/.switchRound/.switchRoundBtn 结构
 */
// @ts-nocheck
import React from "react"

interface SwitchProps {
    /** 当前是否开启 */
    checked: boolean
    /** 切换回调 */
    onChange: (checked: boolean) => void
    /** id（用于 label htmlFor 关联） */
    id?: string
}

/** 开关组件：保持与原版一致的 HTML 结构与 class 名 */
export function Switch(props: SwitchProps) {
    const { checked, onChange, id } = props
    return (
        <div className="switch">
            <label className="switchLabel switchRadius">
                <input
                    type="checkbox"
                    id={id}
                    className="switchInput"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="switchRound switchRadius">
                    <em className="switchRoundBtn switchRadius"></em>
                </span>
            </label>
        </div>
    )
}
