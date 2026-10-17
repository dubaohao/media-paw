// @ts-nocheck
/**
 * UTF-8 安全的 Base64 编解码，替代原 lib/base64.js
 * 使用 btoa/atob 配合 escape/unescape 处理多字节字符
 */
export const Base64 = {
    /**
     * 将字符串编码为 Base64
     * @param str 原始字符串
     * @returns Base64 编码字符串
     */
    encode(str: string): string {
        return btoa(unescape(encodeURIComponent(str)));
    },
    /**
     * 将 Base64 字符串解码为原始字符串
     * @param str Base64 编码字符串
     * @returns 解码后的字符串
     */
    decode(str: string): string {
        return decodeURIComponent(escape(atob(str)));
    }
};
