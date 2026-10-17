/**
 * Popup 资源/进度相关类型（当前为宽松类型，后续阶段逐步补严格类型）
 */

/** 嗅探到的媒体资源 */
export interface MediaResource {
  requestId: string
  name: string
  url: string
  size?: number | string
  _size?: number
  ext?: string
  type?: string
  tabId: number
  isRegex?: boolean
  initiator?: string
  requestHeaders?: Record<string, string>
  cookie?: string
  getTime?: number
  /** 最后更新时间（标题变更时刷新，初始=创建时间） */
  updateTime?: number
  /** 原始标题（用于文件名） */
  _title?: string
  /** 转义后标题（HTML 显示） */
  title?: string
  downFileName?: string
  favIconUrl?: string
  webUrl?: string
  /** 标题已被规则标题/手动命名锁定：后续自动标题更新不再覆盖（用户手动改名除外） */
  titleLocked?: boolean
  /** m3u8 | mpd | json | false */
  parsing?: false | "m3u8" | "mpd" | "json"
  isPlay?: boolean
  /** UI 状态 */
  checked?: boolean
  expanded?: boolean
  hidden?: boolean
  duration?: number
  videoWidth?: number
  videoHeight?: number
  invoke?: string
  m3u8dlArg?: string
  [key: string]: any
}

/** 单条资源下载进度状态 */
export interface ProgressState {
  success: number
  total: number
  errors: number[]
  percent: number
  /** 单文件字节进度 */
  received?: number
  totalBytes?: number
  phase?: "downloading" | "paused" | "merging" | "saving" | "complete" | "error"
  failed?: boolean
}

/** 疑似密钥 */
export interface MaybeKey {
  key: string
  hex: string
}

/** 工具箱按钮状态 */
export interface ButtonState {
  MobileUserAgent?: boolean
  AutoDown?: boolean
  enable?: boolean
  [key: string]: any
}
