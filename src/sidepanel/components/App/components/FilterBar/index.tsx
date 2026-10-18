/**
 * 置顶筛选条：类型筛选下拉（全部/mp4/m3u8/ts/音频/动态扩展名）
 * + 视图操作（正则/展开全部/收起全部，空间足够平铺、不足收纳为 ▾ 下拉）
 * 批量操作类按钮在底部操作栏（用户定稿）
 */
// @ts-nocheck
import React, { useLayoutEffect, useRef, useState } from "react"
import { i18n } from "~lib/init"
import { useMediaStore } from "~sidepanel/store"
import { PopMenu } from "../PopMenu"

/** 常用媒体类型快捷分组（固定项，其余扩展名动态追加进菜单） */
const QUICK_GROUPS: { label: string; exts: string[] }[] = [
  { label: "mp4", exts: ["mp4"] },
  { label: "m3u8", exts: ["m3u8"] },
  { label: "ts", exts: ["ts"] },
  {
    label: "音频",
    exts: ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "mka", "ape"]
  }
]

/** 判断两个字符串数组是否包含相同元素（顺序无关） */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) { return false }
  return a.every(x => b.includes(x))
}

/** 置顶筛选条 */
export function FilterBar() {
  const {
    filterExt,
    regex,
    soloExts,
    soloTargets,
    clearFilter,
    setRegex,
    setExpandAll
  } = useMediaStore()
  /** 正则输入行开关 */
  const [regexOpen, setRegexOpen] = useState(false)
  /** 类型筛选下拉开关 */
  const [typeOpen, setTypeOpen] = useState(false)
  /** 视图操作下拉开关（仅收纳态使用） */
  const [menuOpen, setMenuOpen] = useState(false)
  const [regexInput, setRegexInput] = useState("")
  /** 视图操作收纳档位：0=平铺三按钮，1=收纳为 ▾（按筛选条宽度实时分档） */
  const [tier, setTier] = useState(0)
  /** 两个下拉的触发钮+菜单容器（外点关闭判定用） */
  const barRef = useRef<HTMLDivElement>(null)
  const typeRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 观察筛选条宽度：>=300px 平铺视图按钮，否则收进 ▾ 菜单
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) { return }
    const ro = new ResizeObserver(() => setTier(el.clientWidth >= 300 ? 0 : 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const extEntries = [...filterExt.entries()]

  /**
   * 当前 solo 状态直接由 store 的 soloTargets 判定（null=全部模式），
   * 不再从 filterExt 的 on/off 推断——避免「仅一种扩展名且 solo 它」
   * 时 filterExt 无 false 项被误判为非 solo（触发钮仍显示「全部」）
   */
  const activeGroup = soloTargets
    ? QUICK_GROUPS.find(g => sameSet(g.exts, soloTargets)) || null
    : null
  const activeExt = !activeGroup && soloTargets && soloTargets.length === 1
    ? soloTargets[0]
    : null
  /** 触发钮文案：solo 时显示当前类型，否则显示「全部」 */
  const typeLabel = activeGroup?.label || activeExt || i18n("showAll")
  /** 无任何筛选时的「全部」高亮 */
  const allActive = !activeGroup && !activeExt && !regex

  /** 嗅探到的动态扩展名（排除快捷组已覆盖的） */
  const dynExts = extEntries
    .map(([e]) => e)
    .filter(e => !QUICK_GROUPS.some(g => g.exts.includes(e)))

  /** 选择类型：设置 solo 并收起菜单 */
  const selectType = (targets: string[] | null) => {
    soloExts(targets)
    setTypeOpen(false)
  }

  /** 回车应用正则，空串清除筛选 */
  const onRegexKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setRegex(regexInput.trim())
      setRegexOpen(false)
    }
  }

  return (
    <div id="filterBar" className="filterBar" ref={barRef}>
      {/* 类型筛选下拉：触发钮显示当前类型，选中非全部时高亮 */}
      <div className="dropdown" ref={typeRef}>
        <button
          className={"chip" + (activeGroup || activeExt ? " on" : "")}
          title={i18n("showAll")}
          onClick={() => setTypeOpen(v => !v)}
        >
          {typeLabel} <span className="chipCaret">▾</span>
        </button>
        <PopMenu open={typeOpen} anchor={typeRef} onClose={() => setTypeOpen(false)}>
          <button
            className={allActive ? "on" : ""}
            onClick={() => { clearFilter(); setTypeOpen(false) }}
          >
            {i18n("showAll")}
          </button>
          {QUICK_GROUPS.map(g => (
            <button
              key={g.label}
              className={activeGroup === g ? "on" : ""}
              onClick={() => selectType(g.exts)}
            >
              {g.label}
            </button>
          ))}
          {dynExts.map(e => (
            <button
              key={e}
              className={activeExt === e ? "on" : ""}
              onClick={() => selectType([e])}
            >
              {e}
            </button>
          ))}
        </PopMenu>
      </div>
      <span className="downSpacer" />
      {/* 视图操作：宽=平铺三按钮，窄=收纳为 ▾ 下拉；正则生效中时触发钮/按钮高亮 */}
      {tier === 0 ? (
        <>
          <button
            className={"fbtn" + (regexOpen || regex ? " on" : "")}
            title={i18n("regularFilterPlaceholder")}
            onClick={() => setRegexOpen(v => !v)}
          >
            {i18n("regexFilter")}
          </button>
          <button className="fbtn" onClick={() => setExpandAll("all")}>
            {i18n.expandAll}
          </button>
          <button className="fbtn" onClick={() => setExpandAll("fold")}>
            {i18n.collapseAll}
          </button>
        </>
      ) : (
        <div className="dropdown" ref={menuRef}>
          <button
            className={"fbtn" + (menuOpen || regex ? " on" : "")}
            title={i18n.filter}
            onClick={() => setMenuOpen(v => !v)}
          >
            ▾
          </button>
          <PopMenu open={menuOpen} anchor={menuRef} onClose={() => setMenuOpen(false)}>
            <button
              className={regex ? "on" : ""}
              onClick={() => { setRegexOpen(true); setMenuOpen(false) }}
            >
              {i18n("regexFilter")}
            </button>
            <button onClick={() => { setExpandAll("all"); setMenuOpen(false) }}>
              {i18n.expandAll}
            </button>
            <button onClick={() => { setExpandAll("fold"); setMenuOpen(false) }}>
              {i18n.collapseAll}
            </button>
          </PopMenu>
        </div>
      )}
      {regexOpen && (
        <div className="filterSub">
          <input
            type="text"
            autoFocus
            placeholder={i18n.regularFilterPlaceholder}
            value={regexInput}
            onChange={e => setRegexInput(e.target.value)}
            onKeyDown={onRegexKey}
          />
        </div>
      )}
    </div>
  )
}
