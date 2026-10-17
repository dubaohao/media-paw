// @ts-nocheck
/**
 * AES 解密设置面板
 * 迁移自 m3u8.html 的 #tips 区域与 js/m3u8.js 的密钥显示/自定义 key/IV 逻辑
 */
import React, { useState } from "react";
import { i18n } from "~lib/init";
import { useM3u8Store } from "./store";

/** AES 解密信息与自定义 key/IV 面板 */
export function AesDecryptorPanel() {
  const { keyInfo, possibleKeys, options, updateOptions } = useM3u8Store();
  const [uploadKeyFile, setUploadKeyFile] = useState<HTMLInputElement | null>(null);

  /** 上传密钥文件 */
  const handleUploadKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      if (this.result.byteLength !== 16) {
        return;
      }
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(this.result))
      );
      updateOptions({ customKey: base64 });
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="block hide" id="maybeKey">
      {keyInfo && (
        <div className="aesInfo">
          <div className="key flex">
            <div className="method">
              {i18n.encryptionAlgorithm}:{" "}
              <input
                type="text"
                value={keyInfo.method || "NONE"}
                spellCheck={false}
                readOnly
              />
            </div>
            {keyInfo.keyHex && (
              <div>
                {i18n.key}(Hex):{" "}
                <input
                  type="text"
                  value={keyInfo.keyHex}
                  spellCheck={false}
                  readOnly
                />
              </div>
            )}
            {keyInfo.keyBase64 && (
              <div>
                {i18n.key}(Base64):{" "}
                <input
                  type="text"
                  value={keyInfo.keyBase64}
                  spellCheck={false}
                  readOnly
                />
              </div>
            )}
            {keyInfo.iv && (
              <div>
                Offset(IV):{" "}
                <input
                  type="text"
                  value={keyInfo.iv}
                  spellCheck={false}
                  readOnly
                  className="offset"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 可能的密钥下拉 */}
      {possibleKeys.length > 0 && (
        <div className="block">
          <select
            className="m3u8Key select"
            onChange={e => {
              if (e.target.value !== "tips") {
                updateOptions({ customKey: e.target.value });
              }
            }}
          >
            <option value="tips">{i18n.possibleKey}</option>
            {possibleKeys.map(k => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button id="searchingForRealKey">
            {i18n.searchingForRealKey}
          </button>
        </div>
      )}

      {/* 自定义 key / IV */}
      <div className="merge customKey">
        <input
          type="text"
          id="customFilename"
          spellCheck={false}
          placeholder={i18n.customSaveFileName}
          size={30}
          value={options.customFilename}
          onChange={e => updateOptions({ customFilename: e.target.value })}
        />
        <input
          type="text"
          id="customKey"
          spellCheck={false}
          placeholder={i18n.customKeyPlaceholder}
          size={60}
          value={options.customKey}
          onChange={e => updateOptions({ customKey: e.target.value })}
        />
        <input
          type="text"
          id="customIV"
          spellCheck={false}
          placeholder="IV"
          size={30}
          value={options.customIV}
          onChange={e => updateOptions({ customIV: e.target.value })}
        />
        <button id="uploadKey" onClick={() => uploadKeyFile?.click()}>
          {i18n.uploadKey}
        </button>
        <input
          id="uploadKeyFile"
          type="file"
          className="hide"
          ref={setUploadKeyFile}
          onChange={handleUploadKey}
        />
      </div>
    </div>
  );
}
