// @ts-nocheck
/**
 * 自定义 m3u8 URL 输入表单
 * 迁移自 m3u8.html 的 #m3u8Custom section 与 js/m3u8.js 的 #parse 点击逻辑
 */
import React, { useState, useRef } from "react";
import { i18n } from "~lib/init";
import { setRequestHeaders, JSONparse } from "~lib/function";
import { useM3u8Store } from "./store";
import { GetExt, addBashUrl } from "~lib/m3u8-parser";

/** 自定义 URL 输入表单 */
export function M3u8CustomForm() {
  const { parseUrl, parseText } = useM3u8Store();
  const [m3u8Text, setM3u8Text] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [referer, setReferer] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /** 上传 m3u8 文件 */
  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setM3u8Text(String(reader.result));
    };
    reader.readAsText(file);
  };

  /** 解析按钮：处理 URL、文本内容、批量生成等 */
  const handleParse = async () => {
    let text = m3u8Text.trim();
    const bUrl = baseUrl.trim();
    const ref = referer.trim();
    if (ref) {
      if (ref.startsWith("http")) {
        setRequestHeaders({ referer: ref });
      } else {
        try {
          setRequestHeaders(JSONparse(ref));
        } catch {
          /* ignore */
        }
      }
    }
    if (!text) {
      return;
    }
    // 单链接且后缀为 m3u8/txt → 直接走 URL 解析
    if (
      text.split("\n").length === 1 &&
      (GetExt(text) === "m3u8" || GetExt(text) === "txt")
    ) {
      await parseUrl(text, ref ? { referer: ref } : {});
      return;
    }
    // 非 m3u8 内容 → 转 m3u8 格式
    if (!text.includes("#EXTM3U")) {
      const tsList = text.split("\n");
      text = "#EXTM3U\n#EXT-X-TARGETDURATION:233\n";
      for (const ts of tsList) {
        if (ts) {
          text += "#EXTINF:1\n" + ts + "\n";
        }
      }
      text += "#EXT-X-ENDLIST";
    }
    if (bUrl) {
      text = addBashUrl(bUrl, text);
    }
    await parseText(text, bUrl);
  };

  return (
    <div className="optionBox">
      <textarea
        id="m3u8Text"
        spellCheck={false}
        data-type="link"
        placeholder={i18n.m3u8Placeholder}
        className="width100"
        value={m3u8Text}
        onChange={e => setM3u8Text(e.target.value)}
      />
      <input
        type="text"
        id="baseUrl"
        placeholder="BaseURL"
        className="fullInput"
        value={baseUrl}
        onChange={e => setBaseUrl(e.target.value)}
      />
      <div className="line" />
      <input
        type="text"
        id="referer"
        placeholder="Referer"
        className="fullInput"
        value={referer}
        onChange={e => setReferer(e.target.value)}
      />
      <button
        id="parse"
        type="button"
        onClick={handleParse}
      >
        {i18n.parser}
      </button>
      <input
        id="uploadM3U8"
        type="file"
        ref={fileRef}
        onChange={handleUpload}
      />
    </div>
  );
}
