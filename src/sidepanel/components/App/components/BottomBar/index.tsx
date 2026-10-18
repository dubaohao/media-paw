/**
 * 底部操作栏：下载选中 + 批量按钮（按重要性排序，空间不足自动收纳进 ⋯ 菜单）
 * + 🧰工具箱 / 🎛本站设置 视图切换
 * ⋯「更多」按钮仅在空间不足（tier>0）有按钮被收起时才显示，
 * 点击弹出 popup 展示被收起的批量操作（folded），非全部操作
 * 迁移自 sidepanel.html #down 及 popup.js 对应事件
 */
// @ts-nocheck
import React, { forwardRef, useLayoutEffect, useRef, useState } from "react"
import { G, i18n } from "~lib/init"
import { useMediaStore } from "~sidepanel/store"
import { isMediaExt, isM3U8 } from "~components/shared/format"
import { downloadChecked, mergeDownload } from "~components/shared/actions"
import { PopMenu } from "../PopMenu"
import type { MediaResource } from "~components/shared/types"

/** 主视图类型：资源列表 / 工具箱 / 本站设置 */
export type MainView = "media" | "tools" | "site"

interface Props {
  /** 当前主视图 */
  view: MainView
  /** 切换工具视图（🧰 再次点击返回资源列表） */
  onTools: () => void
  /** 切换本站设置视图（🎛 再次点击返回资源列表） */
  onSite: () => void
}

/** 判断资源是否参与在线合并（媒体类型或 m3u8） */
function mergeable(data: MediaResource): boolean {
  if (!data.type) { return isMediaExt(data.ext) }
  return (
    isMediaExt(data.ext) ||
    data.type.startsWith("video") ||
    data.type.startsWith("audio") ||
    data.type.endsWith("octet-stream")
  )
}

/**
 * 收纳档位：底栏宽度映射为「从队尾收进菜单的按钮数量」
 * 0=全平铺；2=收清空+删重名；3=再收在线合并；4=再收全选（仅剩下载+⋯）；
 * 🧰/🎛 始终平铺在最右，不参与折行
 */
function toTier(width: number): number {
  if (width >= 640) { return 0 }
  if (width >= 540) { return 2 }
  if (width >= 450) { return 3 }
  if (width >= 370) { return 4 }
  return 5
}

/** 底部操作栏 */
export const BottomBar = forwardRef<HTMLDivElement, Props>(
  function BottomBar({ view, onTools, onSite }, ref) {
    const {
      current,
      other,
      getChecked,
      setCheckedAll,
      dedupe,
      clearAll,
      buttonState
    } = useMediaStore()
    const checkedData = getChecked()
    /** 非 media 视图时隐藏列表相关操作按钮 */
    const listOnly = view === "media" ? "" : " hide"

    /** 可勾选资源数（可见 且 非下载中/合并中；busy 记录勾选框禁用，不参与全选） */
    let selectableTotal = 0
    const isSelectable = (item: MediaResource) =>
      !item.hidden && item.state !== "downloading" && item.state !== "merging"
    for (const item of current.values()) { if (isSelectable(item)) { selectableTotal++ } }
    for (const item of other.values()) { if (isSelectable(item)) { selectableTotal++ } }
    /** 全选状态：可勾选资源全部被勾选（getChecked 已过滤 busy 记录） */
    const allSelected =
      selectableTotal > 0 && checkedData.length === selectableTotal

    /** 在线合并可用性：恰好两条、体积受限（Firefox 不限）、均为媒体或 m3u8 */
    const maxSize = Math.max(0, ...checkedData.map(d => d._size ?? 0))
    const canMerge =
      checkedData.length == 2 &&
      (G.isFirefox || maxSize <= G.chromeLimitSize) &&
      (checkedData.every(mergeable) || checkedData.every(d => isM3U8(d)))

    /** 收纳档位（ResizeObserver 按底栏宽度实时更新） */
    const [tier, setTier] = useState(0)
    /** ⋯ 收纳菜单开关 */
    const [menuOpen, setMenuOpen] = useState(false)
    /** 菜单锚点容器（PopMenu 外点关闭判定用） */
    const menuRef = useRef<HTMLDivElement>(null)

    // 观察底栏宽度变化，实时切换收纳档位
    useLayoutEffect(() => {
      const el = typeof ref === "object" ? ref.current : null
      if (!el) { return }
      const ro = new ResizeObserver(() => setTier(toTier(el.clientWidth)))
      ro.observe(el)
      return () => ro.disconnect()
    }, [ref])

    /** 下载选中：>=10 条二次确认 */
    const onDownload = () => {
      if (checkedData.length >= 10 && !confirm(i18n("confirmDownload", [checkedData.length]))) {
        return
      }
      downloadChecked(checkedData)
    }

    /**
     * 批量操作按钮配置：按重要性从高到低排列（均作用于当前页+其他页整个列表）
     * 空间不足时从队尾（清空）开始依次收进 ⋯ 菜单
     */
    const actions = [
      {
        id: "select",
        label: i18n.selectAll,
        run: () => setCheckedAll(!allSelected),
        active: allSelected
      },
      {
        id: "merge",
        label: i18n.onlineMerge,
        run: () => mergeDownload(checkedData),
        disabled: !canMerge
      },
      { id: "dedupe", label: i18n.deleteDuplicateFilenames, run: dedupe },
      { id: "clear", label: i18n.clear, run: clearAll, danger: true }
    ]
    /** 平铺部分 = 队首（重要）按钮；窄屏下队尾按钮被收纳进 ⋯ 菜单 */
    const flat = actions.slice(0, actions.length - tier)
    /** 被收起进 ⋯ 菜单的批量操作（队尾，空间不足时存在） */
    const folded = actions.slice(actions.length - tier)

    return (
      <div id="down" ref={ref}>
        <button id="DownFile" className={"mainDown" + listOnly} onClick={onDownload}>
          {i18n.download + (checkedData.length ? ` (${checkedData.length})` : "")}
        </button>
        {flat.map(a => (
          <button
            key={a.id}
            className={"button2 barBtn" + listOnly + (a.active ? " Active" : "") + (a.danger ? " dangerBtn" : "")}
            disabled={a.disabled}
            onClick={a.run}
          >
            {a.label}
          </button>
        ))}
        {/*
          ⋯「更多」收纳菜单：仅在有按钮被收起（tier>0）时才显示，向上弹出，
          popup 展示被收起的批量操作（folded），非全部操作——
          宽屏下全部按钮已平铺，无需显示 ⋯ 入口
        */}
        {tier > 0 && (
          <div className={"dropdown" + listOnly} ref={menuRef}>
            <button
              className={"button2 barBtn" + (menuOpen ? " Active" : "")}
              title={i18n.moreFeatures}
              onClick={() => setMenuOpen(v => !v)}
            >
              ⋯
            </button>
            <PopMenu open={menuOpen} anchor={menuRef} onClose={() => setMenuOpen(false)}>
              {folded.map(a => (
                <button
                  key={a.id}
                  className={(a.active ? "on" : "") + (a.danger ? " danger" : "")}
                  disabled={a.disabled}
                  onClick={() => { a.run(); setMenuOpen(false) }}
                >
                  {a.label}
                </button>
              ))}
            </PopMenu>
          </div>
        )}
        <span className="downSpacer" />
        <button
          id="toolsEntry"
          className={"button2 barBtn" + (view === "tools" ? " Active" : "")}
          onClick={onTools}
        >
          🧰 <span>{i18n("tools")}</span>
        </button>
        <button
          id="siteEntry"
          className={"button2 barBtn" + (view === "site" ? " Active" : "")}
          onClick={onSite}
        >
          🎛 <span>{i18n("siteSettings")}</span>
          {/* 自动下载开启时亮绿点提示 */}
          {buttonState.AutoDown && (
            <i className="dotBadge" title={i18n.autoDownload} />
          )}
        </button>
      </div>
    )
  }
)
