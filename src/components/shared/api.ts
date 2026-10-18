/**
 * chrome.runtime / chrome.tabs 消息通信的 Promise 封装
 */

/** 向 background service worker 发消息并等待响应 */
export function sendMessage<T = any>(message: any): Promise<T> {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(chrome.runtime.id, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined as T)
          return
        }
        resolve(response)
      })
    } catch {
      resolve(undefined as T)
    }
  })
}

/** 向指定标签页的 content-script 发消息 */
export function tabSendMessage<T = any>(
  tabId: number,
  message: any,
  options?: chrome.tabs.MessageSendOptions
): Promise<T> {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, options ?? {}, (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined as T)
          return
        }
        resolve(response)
      })
    } catch {
      resolve(undefined as T)
    }
  })
}
