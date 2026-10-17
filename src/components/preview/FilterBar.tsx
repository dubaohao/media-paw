// @ts-nocheck
/**
 * 筛选条件栏（迁移自 .filters）
 * 包含扩展名/类型筛选、排序、选项、正则、操作按钮
 */
import React, { useState } from "react"
import { G, i18n } from "~lib/init"
import { usePreviewStore } from "./store"
import s from "./preview.module.css"

/** 筛选条件栏组件 */
export function FilterBar() {
  const store = usePreviewStore()
  const {
    filters,
    hasSelected,
    canMerge,
    buttonState,
    defaultPopup,
    selectAll,
    invertSelection,
    downloadSelected,
    mergeDownload,
    copySelected,
    deleteSelected,
    clear,
    toggleFilter,
    setSort,
    setRegex,
    setShowTitle,
    setDeleteDuplicateFilenames,
    scriptAction,
    setDefaultPopup,
    aria2One: _aria2One,
    sendOne: _sendOne,
    selectedItems
  } = store

  const [regexText, setRegexText] = useState("")

  /** 是否支持脚本功能（版本检查） */
  const scriptSupported =
    G.version >= 102 && (!G.isFirefox || G.version >= 128)

  /** 正则输入回车触发 */
  const onRegexKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const value = (e.target as HTMLInputElement).value.trim()
      setRegexText(value)
      setRegex(value)
    }
  }

  /** 排序字段变更 */
  const onSortFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSort(e.target.value, filters.sortOrder)
  }

  /** 排序顺序变更 */
  const onSortOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSort(filters.sortField, e.target.value)
  }

  /** 扩展名列表 */
  const extList = Array.from(filters.ext) as string[]
  /** 类型列表 */
  const typeList = Array.from(filters.type) as string[]

  return (
    <div className={s.filters}>
      {/* 扩展名筛选 */}
      <div className={s["filter-row"]}>
        <span data-i18n="suffix">{i18n.suffix}</span>
        <div id="extensionFilters">
          {extList.map(ext => (
            <label key={ext}>
              <input
                type="checkbox"
                name="ext"
                value={ext}
                checked={filters.ext.has(ext)}
                onChange={() => toggleFilter("ext", ext)}
              />
              {ext === "Unknown" ? ext : ext.toLowerCase()}
            </label>
          ))}
        </div>
      </div>

      {/* 类型筛选 */}
      <div className={s["filter-row"]}>
        <span data-i18n="type">{i18n.type}</span>
        <div id="typeFilters">
          {typeList.map(type => (
            <label key={type}>
              <input
                type="checkbox"
                name="type"
                value={type}
                checked={filters.type.has(type)}
                onChange={() => toggleFilter("type", type)}
              />
              {type === "Unknown" ? type : type.toLowerCase()}
            </label>
          ))}
        </div>
      </div>

      {/* 排序选项 */}
      <div className={s["filter-row"]}>
        <span data-i18n="sort">{i18n.sort}</span>
        <div className={s["sort-options"]}>
          <div className={s["sort-group"]}>
            <label>
              <input
                type="radio"
                name="sortField"
                value="getTime"
                checked={filters.sortField === "getTime"}
                onChange={onSortFieldChange}
              />
              {i18n.getTime}
            </label>
            <label>
              <input
                type="radio"
                name="sortField"
                value="size"
                checked={filters.sortField === "size"}
                onChange={onSortFieldChange}
              />
              {i18n.fileSize}
            </label>
            <label>
              <input
                type="radio"
                name="sortField"
                value="duration"
                checked={filters.sortField === "duration"}
                onChange={onSortFieldChange}
              />
              {i18n.duration}
            </label>
          </div>
          <div className={s["sort-order"]}>
            <label>
              <input
                type="radio"
                name="sortOrder"
                value="asc"
                checked={filters.sortOrder === "asc"}
                onChange={onSortOrderChange}
              />
              {i18n.asc}
            </label>
            <label>
              <input
                type="radio"
                name="sortOrder"
                value="desc"
                checked={filters.sortOrder === "desc"}
                onChange={onSortOrderChange}
              />
              {i18n.desc}
            </label>
          </div>
        </div>
      </div>

      {/* 选项 */}
      <div className={s["filter-row"]}>
        <span data-i18n="option">{i18n.option}</span>
        <label>
          <input
            type="checkbox"
            id="showTitle"
            checked={filters.showTitle}
            onChange={e => setShowTitle(e.target.checked)}
          />
          {i18n.title}
        </label>
        <label>
          <input
            type="checkbox"
            id="deleteDuplicateFilenames"
            checked={filters.deleteDuplicateFilenames}
            onChange={e => setDeleteDuplicateFilenames(e.target.checked)}
          />
          {i18n.deleteDuplicateFilenames}
        </label>
      </div>

      {/* 正则过滤 */}
      <div className={s["filter-row"]}>
        <span data-i18n="regex">{i18n.regex}</span>
        <input
          type="text"
          placeholder={i18n.regularFilterPlaceholder}
          className={s.regular}
          value={regexText}
          onKeyPress={onRegexKeyPress}
        />
      </div>

      {/* 操作按钮 */}
      <div className={s["filter-row"]}>
        <span data-i18n="operation">{i18n.operation}</span>
        <button className="button" onClick={selectAll}>
          {i18n.selectAll}
        </button>
        <button className="button" onClick={invertSelection}>
          {i18n.invertSelection}
        </button>
        <button
          className="button2"
          onClick={downloadSelected}
          disabled={!hasSelected}
        >
          {i18n.download}
        </button>
        <button
          className="button2"
          onClick={mergeDownload}
          disabled={!canMerge}
        >
          {i18n.onlineMerge}
        </button>
        <button
          className="button2"
          onClick={copySelected}
          disabled={!hasSelected}
        >
          {i18n.copy}
        </button>
        <button
          className="button2"
          onClick={deleteSelected}
          disabled={!hasSelected}
        >
          {i18n.delete}
        </button>
        {G.enableAria2Rpc && (
          <button
            className="button2"
            onClick={() => {
              store
                .getSelectedItems()
                ?.forEach((item: any) => store.aria2One(item))
            }}
            disabled={!hasSelected}
          >
            aria2
          </button>
        )}
        {G.send2localManual && (
          <button
            className="button2"
            onClick={() => {
              store
                .getSelectedItems()
                ?.forEach((item: any) => store.sendOne(item))
            }}
            disabled={!hasSelected}
          >
            {i18n.send2local}
          </button>
        )}
        <button className="button" onClick={clear}>
          {i18n.clear}
        </button>
        <button
          className="button"
          onClick={() => console.dir(store.originalItems)}
        >
          debug
        </button>
        {scriptSupported && (
          <>
            <button
              className="button2"
              type="script"
              onClick={() => scriptAction("search")}
            >
              {buttonState.search
                ? G.scriptList.get("search.js")?.off
                : G.scriptList.get("search.js")?.name}
            </button>
            <button
              className="button2"
              type="script"
              onClick={() => scriptAction("catch")}
            >
              {buttonState.catch
                ? G.scriptList.get("catch.js")?.off
                : G.scriptList.get("catch.js")?.name}
            </button>
          </>
        )}
        <label>
          <input
            type="checkbox"
            name="defaultPopup"
            id="defaultPopup"
            checked={defaultPopup}
            onChange={e => setDefaultPopup(e.target.checked)}
          />
          {i18n.defaultPopup}
        </label>
      </div>
    </div>
  )
}
