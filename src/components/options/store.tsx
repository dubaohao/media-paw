/**
 * Options 页全局 store：管理 chrome.storage.sync 配置的读写与重置
 * 迁移自 options.js 的 chrome.storage.sync.get 填充与 Save/resetOption 逻辑
 */
// @ts-nocheck
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState
} from "react"
import { G } from "~lib/init"

interface OptionsStoreValue {
    /** 从 chrome.storage.sync 加载的配置（已合并默认值） */
    options: Record<string, any>
    /** 是否加载完成 */
    loading: boolean
    /** 更新单个配置项（带 debounce） */
    updateOption: (key: string, value: any, debounce?: number) => void
    /** 批量更新多个配置项 */
    updateOptions: (data: Record<string, any>) => void
    /** 重置指定键到默认值 */
    resetOption: (keys: string[]) => void
    /** 重载页面 */
    reload: () => void
    /** 直接覆盖本地 state（不写 storage） */
    setLocalOption: (key: string, value: any) => void
}

const OptionsStoreContext = createContext<OptionsStoreValue | null>(null)

/** 防抖定时器引用 */
const debounceTimers: Record<string, any> = {}

/**
 * 从 chrome.storage.sync 读取所有 G.OptionLists 默认键，合并默认值
 */
function loadOptions(): Promise<Record<string, any>> {
    return new Promise((resolve) => {
        chrome.storage.sync.get(G.OptionLists, function (items: any) {
            if (chrome.runtime.lastError) {
                items = { ...G.OptionLists }
            }
            for (const key in G.OptionLists) {
                if (items[key] === undefined || items[key] === null) {
                    items[key] = G.OptionLists[key]
                }
            }
            resolve(items)
        })
    })
}

/** Options Store Provider，加载初始配置并提供更新/重置动作 */
export function OptionsStoreProvider(props: { children: React.ReactNode }) {
    const [options, setOptions] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const optionsRef = useRef(options)
    optionsRef.current = options

    /** 初始加载 */
    useEffect(() => {
        let cancelled = false
        loadOptions().then((items) => {
            if (cancelled) return
            if (items.Ext === undefined || items.Type === undefined || items.Regex === undefined) {
                location.reload()
                return
            }
            setOptions(items)
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    /** 写入 storage.sync（带可选防抖） */
    const saveToStorage = useCallback((key: string, value: any, debounce = 0) => {
        const doSave = () => {
            chrome.storage.sync.set({ [key]: value })
        }
        if (debounce > 0) {
            clearTimeout(debounceTimers[key])
            debounceTimers[key] = setTimeout(doSave, debounce)
        } else {
            clearTimeout(debounceTimers[key])
            doSave()
        }
    }, [])

    /** 更新单个配置：同步本地 state + storage */
    const updateOption = useCallback((key: string, value: any, debounce = 0) => {
        setOptions((prev) => ({ ...prev, [key]: value }))
        saveToStorage(key, value, debounce)
    }, [saveToStorage])

    /** 批量更新 */
    const updateOptions = useCallback((data: Record<string, any>) => {
        setOptions((prev) => ({ ...prev, ...data }))
        chrome.storage.sync.set(data)
    }, [])

    /** 仅覆盖本地 state，不写 storage（用于临时编辑态） */
    const setLocalOption = useCallback((key: string, value: any) => {
        setOptions((prev) => ({ ...prev, [key]: value }))
    }, [])

    /** 重置指定键到默认值并写 storage */
    const resetOption = useCallback((keys: string[]) => {
        const data: Record<string, any> = {}
        for (const key of keys) {
            data[key] = G.OptionLists[key]
        }
        setOptions((prev) => ({ ...prev, ...data }))
        chrome.storage.sync.set(data)
    }, [])

    /** 重载页面 */
    const reload = useCallback(() => {
        location.reload()
    }, [])

    const value: OptionsStoreValue = {
        options,
        loading,
        updateOption,
        updateOptions,
        resetOption,
        reload,
        setLocalOption
    }

    return (
        <OptionsStoreContext.Provider value={value}>
            {props.children}
        </OptionsStoreContext.Provider>
    )
}

/** 获取 options store */
export function useOptionsStore(): OptionsStoreValue {
    const ctx = useContext(OptionsStoreContext)
    if (!ctx) { throw new Error("useOptionsStore 必须在 OptionsStoreProvider 内使用") }
    return ctx
}
