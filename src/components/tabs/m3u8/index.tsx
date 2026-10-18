// @ts-nocheck
/**
 * M3U8 解析器页面根组件
 * 包装 Store Provider 与主应用
 */
import React from "react";
import { M3u8StoreProvider } from "./store";
import { M3u8App } from "./components/M3u8App";

/** 读取 URL 参数 */
function getUrlParams() {
  const params = new URL(location.href).searchParams;
  const url = params.get("url");
  const requestHeadersRaw = params.get("requestHeaders");
  let requestHeaders: any = {};
  if (requestHeadersRaw) {
    try {
      requestHeaders = JSON.parse(requestHeadersRaw);
    } catch {
      try {
        requestHeaders = JSON.parse(
          requestHeadersRaw.replace(/([{,]\s*)([\w-]+)(\s*:)/g, '$1"$2"$3')
        );
      } catch {
        /* ignore */
      }
    }
  }
  return {
    url,
    requestHeaders,
    requestId: params.get("requestId"),
    title: params.get("title"),
    fileName: params.get("filename"),
    tabId: parseInt(params.get("tabid")),
    initiator: params.get("initiator"),
    ffmpeg: params.get("ffmpeg"),
    taskId: params.get("taskId"),
    quantity: params.get("quantity"),
    autoDown: params.get("autoDown") === "1" || params.get("autoDown") === "true",
    autoClose: params.get("autoClose") === "1" || params.get("autoClose") === "true"
  };
}

/** M3U8 页面根组件：从 URL 参数初始化 Provider */
export default function M3u8Root() {
  const params = getUrlParams();
  return (
    <M3u8StoreProvider
      url={params.url}
      requestHeaders={params.requestHeaders}
      requestId={params.requestId}
      title={params.title}
      fileName={params.fileName}
      tabId={params.tabId}
      initiator={params.initiator}
      ffmpeg={params.ffmpeg}
      taskId={params.taskId}
      quantity={params.quantity}
      autoDown={params.autoDown}
      autoClose={params.autoClose}
    >
      <M3u8App />
    </M3u8StoreProvider>
  );
}
