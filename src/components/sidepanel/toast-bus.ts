/**
 * 全局轻量提示（Toast）事件总线
 * actions 等非组件代码调用 showTips()，App 组件订阅并渲染
 */
type ToastListener = (text: string, delay: number) => void

const listeners = new Set<ToastListener>()

/** 订阅 toast，返回取消订阅函数 */
export function onTips(listener: ToastListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 显示一条短暂提示（对应原版 Tips 函数） */
export function showTips(text: string, delay = 200): void {
  listeners.forEach(fn => fn(text, delay))
}
