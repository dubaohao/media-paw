// @ts-nocheck
/**
 * 轻量级 JSON 树形查看器组件
 * 替代原 jquery.json-viewer，支持折叠/展开、键值高亮、链接识别
 */
import React, { useState } from "react"

interface JsonTreeProps {
    data: any
    collapsed: boolean
    /** 键名（仅对象属性和数组元素显示） */
    name?: string
    /** 当前层级 */
    level?: number
}

/**
 * 递归渲染 JSON 节点
 * 支持对象、数组、字符串、数字、布尔、null
 */
export function JsonTree({ data, collapsed, name, level = 0 }: JsonTreeProps) {
    const [localCollapsed, setLocalCollapsed] = useState(level >= 1 && collapsed)

    /** 渲染键名 */
    const renderName = name !== undefined && (
        <span className="json-key">"{name}"</span>
    )

    /** 渲染原始值（字符串/数字/布尔/null） */
    const renderValue = (val: any) => {
        if (val === null) return <span className="json-null">null</span>
        if (typeof val === "boolean") return <span className="json-boolean">{String(val)}</span>
        if (typeof val === "number") return <span className="json-number">{val}</span>
        if (typeof val === "string") {
            // 链接识别
            if (val.startsWith("http://") || val.startsWith("https://")) {
                return <a href={val} target="_blank" rel="noreferrer" className="json-link">"{val}"</a>
            }
            return <span className="json-string">"{val}"</span>
        }
        return <span>{String(val)}</span>
    }

    /** 渲染对象或数组 */
    if (data !== null && typeof data === "object") {
        const isArray = Array.isArray(data)
        const entries = isArray
            ? data.map((v: any, i: number) => [i, v])
            : Object.entries(data)
        const empty = entries.length === 0
        const openBracket = isArray ? "[" : "{"
        const closeBracket = isArray ? "]" : "}"

        if (empty) {
            return (
                <div className="json-line" style={{ marginLeft: level * 16 }}>
                    {renderName}
                    {name !== undefined && <span>: </span>}
                    <span>{openBracket}{closeBracket}</span>
                </div>
            )
        }

        return (
            <div className="json-node" style={{ marginLeft: level * 16 }}>
                <span
                    className="json-toggle"
                    onClick={() => setLocalCollapsed(c => !c)}
                    style={{ cursor: "pointer", userSelect: "none" }}
                >
                    {localCollapsed ? "▶" : "▼"}
                </span>{" "}
                {renderName}
                {name !== undefined && <span>: </span>}
                <span>{openBracket}</span>
                {!localCollapsed && (
                    <div className="json-children">
                        {entries.map(([key, val]: [any, any], idx: number) => (
                            <JsonTree
                                key={idx}
                                data={val}
                                name={isArray ? undefined : String(key)}
                                collapsed={collapsed}
                                level={level + 1}
                            />
                        ))}
                    </div>
                )}
                {localCollapsed && <span className="json-ellipsis">...</span>}
                <span>{closeBracket}</span>
                {level === 0 && <span>,</span>}
            </div>
        )
    }

    /** 渲染原始值 */
    return (
        <div className="json-line" style={{ marginLeft: level * 16 }}>
            {renderName}
            {name !== undefined && <span>: </span>}
            {renderValue(data)}
            {level > 0 && <span>,</span>}
        </div>
    )
}
