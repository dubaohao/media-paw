// @ts-nocheck
/**
 * 广播进度到 popup / sidepanel
 * 迁移自原版脚本中分散的 chrome.runtime.sendMessage 调用，
 * 统一在此模块处理下载进度上报，popup 未开则忽略异常。
 */

/**
 * 向 popup/sidepanel 广播下载进度
 * @param data 进度数据，包含 requestId/success/total/type 等字段
 */
export function broadcastProgress(data: any): void {
  try {
    chrome.runtime.sendMessage({ Message: "downloadProgress", ...data });
  } catch (e) {
    /* popup 未开则忽略 */
  }
}
