/**
 * 视口自适应弹出菜单：通过 React Portal 渲染到 document.body，
 * 逃逸祖先 backdrop-filter/filter/transform 创建的 fixed 包含块
 * （#down 有 backdrop-filter 会让 fixed 后代以它为包含块，坐标错位
 *   导致菜单被渲染到屏幕外不可见）。Portal 到 body 后 fixed 定位
 *   始终基于视口，getBoundingClientRect 坐标一致。
 * 水平溢出翻边、垂直空间不足向上翻转、钳制视口边缘内，始终完整可见
 */
// @ts-nocheck
import React, { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface Props {
  /** 是否展开菜单 */
  open: boolean
  /** 触发钮锚点引用，菜单按其矩形定位 */
  anchor: React.RefObject<HTMLElement>
  /** 关闭回调（点击锚点与菜单之外的区域时触发） */
  onClose: () => void
  /** 菜单项 */
  children: React.ReactNode
}

/** 自适应弹出菜单（Portal 到 body + fixed 定位，复用 dropdownMenu 样式） */
export function PopMenu({ open, anchor, onClose, children }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  /** 最终坐标；null=待测量（隐藏渲染后同帧定位，无闪烁） */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  /** 关闭回调用 ref 持有，避免内联函数导致外点关闭 effect 每次渲染重挂 */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 打开时测量锚点矩形，计算不溢出视口的 fixed 定位（基于视口，Portal 到 body）
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const btn = anchor.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!btn || !menu) { return }
    const mw = menu.offsetWidth || 150
    const mh = menu.offsetHeight || 180
    // 水平：默认左缘对齐按钮左缘；右侧放不下则右缘对齐按钮右缘；再钳制到视口内
    let left = btn.left
    if (left + mw > window.innerWidth - 8) { left = btn.right - mw }
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))
    // 垂直：默认向下展开；下方空间不足则翻转到按钮上方
    let top = btn.bottom + 6
    if (top + mh > window.innerHeight - 8) { top = Math.max(8, btn.top - mh - 6) }
    setPos({ top, left })
  }, [open, anchor])

  // 外点关闭：按下位置不在锚点也不在菜单内时关闭
  useLayoutEffect(() => {
    if (!open) { return }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchor.current?.contains(t) || menuRef.current?.contains(t)) { return }
      onCloseRef.current()
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, anchor])

  if (!open) { return null }
  return createPortal(
    <div
      ref={menuRef}
      className="dropdownMenu"
      style={{
        position: "fixed",
        right: "auto",
        bottom: "auto",
        zIndex: 2147483000,
        ...(pos
          ? { top: pos.top, left: pos.left }
          : { top: 0, left: 0, visibility: "hidden" })
      }}
    >
      {children}
    </div>,
    document.body
  )
}
