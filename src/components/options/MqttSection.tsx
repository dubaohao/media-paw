/**
 * MqttSection MQTT 配置 section：enable/broker/port/path/protocol/clientId/titleLength/user/password/topic/qos/dataFormat
 * 迁移自 options.html #anchorMQTT
 */
// @ts-nocheck
import React, { useRef } from "react"
import { i18n } from "~lib/init"
import { useOptionsStore } from "./store"
import { Switch } from "./Switch"
import { ResetButton } from "./ResetButton"

/** MQTT 配置 section */
export function MqttSection() {
    const { options, updateOption } = useOptionsStore()
    const debounceRef = useRef<any>({})

    const handleInput = (key: string, value: any) => {
        if (typeof value === "string" && !isNaN(value as any) && (key === "mqttPort" || key === "mqttTitleLength" || key === "mqttQos")) {
            value = parseInt(value)
            if (isNaN(value)) { value = 0 }
        }
        updateOption(key, value)
        clearTimeout(debounceRef.current[key])
        debounceRef.current[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value })
        }, 300)
    }

    const handleSelect = (key: string, value: any) => {
        if (!isNaN(value)) { value = parseInt(value) }
        updateOption(key, value)
        chrome.storage.sync.set({ [key]: value })
    }

    return (
        <section id="anchorMQTT">
            <h1 className="optionsTitle">
                <img src={chrome.runtime.getURL("assets/img/mqtt.svg")} style={{ width: 18 }} className="mqtt" alt="mqtt" />
                MQTT
            </h1>
            <div className="optionBox" id="mqttOption">
                <div className="list loose">
                    <div className="item">
                        <div>{i18n.enable}</div>
                        <Switch checked={!!options.mqttEnable} onChange={(v) => updateOption("mqttEnable", v)} />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttBroker}</div>
                        <input
                            type="text"
                            className="width100"
                            placeholder="test.mosquitto.org"
                            value={options.mqttBroker || ""}
                            onChange={(e) => handleInput("mqttBroker", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.port}</div>
                        <input
                            type="number"
                            min={1}
                            max={65535}
                            className="width100"
                            placeholder="8081"
                            value={options.mqttPort ?? ""}
                            onChange={(e) => handleInput("mqttPort", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttPath}</div>
                        <input
                            type="text"
                            className="width100"
                            placeholder="/mqtt"
                            value={options.mqttPath || ""}
                            onChange={(e) => handleInput("mqttPath", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttProtocol}</div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={options.mqttProtocol || "wss"}
                                onChange={(e) => handleSelect("mqttProtocol", e.target.value)}
                            >
                                <option value="wss">{i18n.mqttProtocolWss}</option>
                                <option value="ws">{i18n.mqttProtocolWs}</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.mqttClientId}</div>
                        <input
                            type="text"
                            className="width100"
                            placeholder="cat-catch-client"
                            value={options.mqttClientId || ""}
                            onChange={(e) => handleInput("mqttClientId", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttTitleLength}</div>
                        <input
                            type="number"
                            min={1}
                            max={1000}
                            className="width100"
                            value={options.mqttTitleLength ?? 100}
                            onChange={(e) => handleInput("mqttTitleLength", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttUsername}</div>
                        <input
                            type="text"
                            className="width100"
                            value={options.mqttUser || ""}
                            onChange={(e) => handleInput("mqttUser", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttPassword}</div>
                        <input
                            type="password"
                            className="width100"
                            value={options.mqttPassword || ""}
                            onChange={(e) => handleInput("mqttPassword", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttTopic}</div>
                        <input
                            type="text"
                            className="width100"
                            placeholder="cat-catch/media"
                            value={options.mqttTopic || ""}
                            onChange={(e) => handleInput("mqttTopic", e.target.value)}
                        />
                    </div>
                    <div className="item">
                        <div>{i18n.mqttQos}</div>
                        <div className="switch switchSelect">
                            <select
                                className="select"
                                value={String(options.mqttQos ?? 0)}
                                onChange={(e) => handleSelect("mqttQos", e.target.value)}
                            >
                                <option value="0">0 {i18n.mqttQos0}</option>
                                <option value="1">1 {i18n.mqttQos1}</option>
                                <option value="2">2 {i18n.mqttQos2}</option>
                            </select>
                        </div>
                    </div>
                    <div className="item">
                        <div>{i18n.mqttDataFormat}</div>
                        <textarea
                            className="width100"
                            rows={4}
                            value={options.mqttDataFormat || ""}
                            onChange={(e) => handleInput("mqttDataFormat", e.target.value)}
                        />
                        <div className="help-text">
                            <a href="https://github.com/dubaohao/media-paw" target="_blank">{i18n.replaceKeywordList}</a>
                            <span>{i18n.mqttDataFormatDefault}</span>
                        </div>
                    </div>
                    <div className="flex-end">
                        <ResetButton keys={["mqttEnable", "mqttBroker", "mqttPort", "mqttPath", "mqttProtocol", "mqttClientId", "mqttTitleLength", "mqttUser", "mqttPassword", "mqttTopic", "mqttQos", "mqttDataFormat"]} />
                    </div>
                </div>
            </div>
        </section>
    )
}
