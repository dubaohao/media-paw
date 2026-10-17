/**
 * 全局操作提示（#TipsFixed）：订阅 toast 事件总线，淡入淡出
 */
// @ts-nocheck
import React, { useEffect, useRef, useState } from "react"
import { onTips } from "./toast-bus"

/** 轻量浮动提示条 */
export function Toast() {
  const [text, setText] = useState("~")
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<number | null>(null)
  const fadeTimer = useRef<number | null>(null)

  useEffect(() => {
    /** 新提示：停止旧动画 -> 显示 -> 延时 -> 隐藏 */
    return onTips((newText: string, delay: number) => {
      if (hideTimer.current) { clearTimeout(hideTimer.current) }
      if (fadeTimer.current) { clearTimeout(fadeTimer.current) }
      setText(newText)
      setVisible(true)
      hideTimer.current = window.setTimeout(() => setVisible(false), delay + 500)
    })
  }, [])

  return (
    <div
      id="TipsFixed"
      style={{ display: visible ? "block" : "none" }}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  )
}
