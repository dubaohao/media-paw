/**
 * 疑似密钥 Tab：展示各 frame 上报的 Base64 密钥，支持复制与发送本地
 * 迁移自 popup.js AddKey
 */
// @ts-nocheck
import React, { useState } from "react"
import { G, i18n } from "~lib/init"
import { send2local } from "~lib/function"
import { useMediaStore } from "~sidepanel/store"
import { base64ToHex } from "~components/shared/format"
import { showTips } from "~components/shared/toast-bus"

/** 密钥列表面板 */
export function MaybeKeys() {
  const { keys } = useMediaStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  /** 展开/折叠某条密钥的 Hex 详情 */
  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  return (
    <div id="maybeKey" className="container TabShow">
      {keys.map(item => {
        const hex = base64ToHex(item.key)
        if (hex === false) { return null }
        return (
          <div className="panel" key={item.key}>
            <div className="panel-heading" onClick={() => toggle(item.key)}>
              <span className="name bold">{item.key}</span>
              <img
                src="assets/img/copy.png"
                className="icon copy"
                title={i18n.copy}
                onClick={e => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(item.key)
                  showTips(i18n.copiedToClipboard)
                }}
                alt=""
              />
              {(G.send2localManual || G.send2local) && (
                <img
                  src="assets/img/send.svg"
                  className="icon send"
                  title={i18n.send2local}
                  onClick={e => {
                    e.stopPropagation()
                    send2local("addKey", item.key)
                      .then((success: any) => {
                        if (success?.ok) { showTips(i18n.hasSent, 1000) }
                      })
                      .catch((error: string) =>
                        showTips(error || i18n.sendFailed, 1000)
                      )
                  }}
                  alt=""
                />
              )}
            </div>
            {expanded.has(item.key) && (
              <div className="url">
                Hex: {hex}
                <br />
                Base64: {item.key}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
