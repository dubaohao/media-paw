/**
 * EditableList 可编辑表格列表：用于 Ext/Type/Regex/blockUrl/titleRules
 * 提供 增/删/改/启用 全部启用/全部禁用 等操作
 * 迁移自 options.js 的 Gethtml() 和 Save() 逻辑
 */
// @ts-nocheck
import React, { useEffect, useRef, useState } from "react"
import { i18n } from "~lib/init"
import { isEmpty } from "~lib/function"
import { Switch } from "./Switch"

interface ColumnDef {
    /** 字段名（对应 row 对象的键） */
    name: string
    /** 表头文案 */
    label: string
    /** 输入框类型 text/checkbox */
    type?: "text" | "checkbox"
    /** 占位符 */
    placeholder?: string
    /** 输入框样式类 */
    className?: string
}

interface EditableListProps {
    /** 列定义 */
    columns: ColumnDef[]
    /** 数据行（每行为对象） */
    rows: any[]
    /** 新增一行时的默认对象 */
    newRowTemplate: () => any
    /** 行数据变更回调（增删改后调用，需更新 storage） */
    onRowsChange: (rows: any[]) => void
    /** 调试校验函数（可选，例如 Type 需校验 "type/subtype" 格式） */
    validateRow?: (row: any) => string | null
    /** 是否显示启用/禁用全部按钮 */
    showAllToggle?: boolean
    /** 是否显示重置按钮 */
    showReset?: boolean
    /** 重置回调 */
    onReset?: () => void
    /** 初始化空白行时的默认状态 */
    defaultState?: boolean
    /** 添加按钮文案 */
    addLabel?: string
}

/** 可编辑表格列表 */
export function EditableList(props: EditableListProps) {
    const {
        columns,
        rows,
        newRowTemplate,
        onRowsChange,
        validateRow,
        showAllToggle = true,
        showReset = true,
        onReset,
        defaultState = true,
        addLabel
    } = props

    /** 新增行 */
    const handleAdd = () => {
        onRowsChange([...rows, newRowTemplate()])
    }

    /** 删除指定行 */
    const handleDelete = (index: number) => {
        const next = rows.filter((_, i) => i !== index)
        onRowsChange(next)
    }

    /** 修改单元格 */
    const handleChange = (index: number, name: string, value: any) => {
        const next = rows.map((row, i) => {
            if (i !== index) { return row }
            return { ...row, [name]: value }
        })
        onRowsChange(next)
    }

    /** 全部启用/禁用 */
    const handleAllToggle = (state: boolean) => {
        const next = rows.map((row) => ({ ...row, state }))
        onRowsChange(next)
    }

    return (
        <>
            <table>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.name}>{col.label}</th>
                        ))}
                        {columns.some(c => c.type !== "checkbox") && (
                            <th>{i18n.enable}</th>
                        )}
                        <th>{i18n.delete}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index} data-type={props["data-type"]}>
                            {columns.map((col) => {
                                if (col.type === "checkbox") {
                                    return (
                                        <td key={col.name}>
                                            <Switch
                                                checked={!!row[col.name]}
                                                onChange={(v) => handleChange(index, col.name, v)}
                                            />
                                        </td>
                                    )
                                }
                                return (
                                    <td key={col.name}>
                                        <input
                                            type="text"
                                            value={row[col.name] ?? ""}
                                            placeholder={col.placeholder}
                                            className={col.className}
                                            onChange={(e) => handleChange(index, col.name, e.target.value)}
                                            onBlur={() => validateRow && validateRow(row)}
                                        />
                                    </td>
                                )
                            })}
                            <td>
                                <Switch
                                    checked={!!row.state}
                                    onChange={(v) => handleChange(index, "state", v)}
                                />
                            </td>
                            <td>
                                <img
                                    src={chrome.runtime.getURL("assets/img/delete.svg")}
                                    className="RemoveButton"
                                    onClick={() => handleDelete(index)}
                                    style={{ cursor: "pointer" }}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex-end">
                <button type="button" className="button2" onClick={handleAdd}>
                    {addLabel || i18n.add}
                </button>
                {showReset && (
                    <button type="button" onClick={onReset}>
                        {i18n.resetSettings}
                    </button>
                )}
                {showAllToggle && (
                    <>
                        <button type="button" onClick={() => handleAllToggle(false)}>
                            {i18n.disableAll}
                        </button>
                        <button type="button" onClick={() => handleAllToggle(true)}>
                            {i18n.enableAll}
                        </button>
                    </>
                )}
            </div>
        </>
    )
}
