// @ts-nocheck
/**
 * 分页控件（迁移自 .pagination）
 * 当数据量超过 MAX_LIST_SIZE 时显示
 */
import React from "react"
import { i18n } from "~lib/init"
import { usePreviewStore } from "~components/tabs/preview/store"
import s from "~components/tabs/preview/preview.module.css"

/** 分页控件组件 */
export function Pagination() {
  const store = usePreviewStore()
  const { pagination, setPage } = store
  const { maxPage, currentPage } = pagination

  // 仅在需要分页时显示
  if (maxPage <= 1) return null

  return (
    <div className={s.pagination}>
      {/* 上一页 */}
      <button
        className="button"
        id="prev-page"
        disabled={currentPage <= 1}
        onClick={() => setPage(currentPage - 1)}
      >
        &lt;&lt;
      </button>
      {/* 页码显示 */}
      <div className={s["page-numbers"]}>
        {currentPage} / {maxPage}
      </div>
      {/* 下一页 */}
      <button
        className="button"
        id="next-page"
        disabled={currentPage >= maxPage}
        onClick={() => setPage(currentPage + 1)}
      >
        &gt;&gt;
      </button>
    </div>
  )
}
