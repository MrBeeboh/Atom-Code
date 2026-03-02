/**
 * @file secureKeys.js
 * @description Frontend bridge for OS keychain access via Tauri.
 * In browser (non-Tauri) context, falls back to localStorage with a
 * simple XOR obfuscation so API keys persist across page refreshes.
 *
 * IMPORTANT: The static `import { invoke }` was removed — it crashes in
 * non-Tauri environments. Uses dynamic import with isTauri guard instead,
 * matching the pattern used in tauriFs.js and repoMap.js.
 */

const isTauri = typeof window !== 'undefined' && !!window['__TAURI_INTERNALS__'];

// Simple XOR obfuscation for localStorage fallback (prevents casual shoulder-surfing)
const XOR_KEY = 0x41; // 'A'
function xorObfuscate(str) {
    return btoa(str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join(''));
}
function xorDeobfuscate(b64) {
    try {
        return atob(b64).split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch {
        return '';
    }
}

/**
 * Store a key securely.
 * - Tauri: OS keychain via invoke('store_api_key')
 * - Browser: localStorage with XOR obfuscation
 * @param {string} keyName
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function storeKey(keyName, value) {
    if (isTauri) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('store_api_key', { service: 'atom-code', keyName, value });
        } catch (err) {
            console.error(`Failed to store key ${keyName} in keychain:`, err);
            throw new Error(`Keychain storage failed: ${err}`);
        }
    } else {
        // Browser fallback: localStorage with obfuscation
        try {
            localStorage.setItem(`_ak_${keyName}`, xorObfuscate(value));
        } catch (err) {
            console.warn(`Failed to persist key ${keyName} to localStorage:`, err);
        }
    }
}

/**
 * Retrieve a key.
 * - Tauri: OS keychain via invoke('get_api_key')
 * - Browser: localStorage fallback
 * @param {string} keyName
 * @returns {Promise<string>}
 */
export async function getKey(keyName) {
    if (isTauri) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            return await invoke('get_api_key', { service: 'atom-code', keyName });
        } catch {
            return '';
        }
    } else {
        // Browser fallback: read from localStorage
        const stored = typeof localStorage !== 'undefined' && localStorage.getItem(`_ak_${keyName}`);
        if (!stored) return '';
        return xorDeobfuscate(stored);
    }
}

/**
 * Delete a key.
 * @param {string} keyName
 * @returns {Promise<void>}
 */
export async function deleteKey(keyName) {
    if (isTauri) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('delete_api_key', { service: 'atom-code', keyName });
        } catch (err) {
            console.error(`Failed to delete key ${keyName}:`, err);
        }
    } else {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(`_ak_${keyName}`);
    }
}
