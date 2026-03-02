/**
 * @file tauriFs.js
 * @description Centralized wrapper for Tauri native file system commands.
 * Replaces the legacy Node.js file-server interactions.
 *
 * NOTE: invoke is imported dynamically inside each function so that this
 * module can be safely loaded in the web (non-Tauri) context without crashing.
 */

const isTauri = typeof window !== 'undefined' && !!window['__TAURI_INTERNALS__'];

/**
 * Read a text file from the local file system.
 * @param {string} path - Absolute path to the file.
 * @returns {Promise<string>}
 */
export async function readTextFile(path) {
    if (!isTauri) throw new Error('readTextFile is only available in the Tauri desktop app.');
    const { invoke } = await import('@tauri-apps/api/core');
    try {
        return await invoke('read_text_file', { path });
    } catch (err) {
        console.error('tauriFs.readTextFile error:', err);
        throw err;
    }
}

/**
 * Write a text file to the local file system.
 * @param {string} path - Absolute path to the target file.
 * @param {string} content - Text content to write.
 * @returns {Promise<void>}
 */
export async function writeTextFile(path, content) {
    if (!isTauri) throw new Error('writeTextFile is only available in the Tauri desktop app.');
    const { invoke } = await import('@tauri-apps/api/core');
    try {
        await invoke('write_text_file', { path, content });
    } catch (err) {
        console.error('tauriFs.writeTextFile error:', err);
        throw err;
    }
}

/**
 * List directory contents.
 * @param {string} path - Absolute directory path.
 * @param {boolean} [recursive=false] - Whether to list recursively.
 * @returns {Promise<Array<{name: string, path: string, is_dir: boolean, size: number}>>}
 */
export async function listDirectory(path, recursive = false) {
    if (!isTauri) throw new Error('listDirectory is only available in the Tauri desktop app.');
    const { invoke } = await import('@tauri-apps/api/core');
    try {
        const files = await invoke('list_directory', { path, recursive });
        // Normalize response to match existing expectations if necessary
        return files.map(f => ({
            ...f,
            type: f.is_dir ? 'dir' : 'file'
        }));
    } catch (err) {
        console.error('tauriFs.listDirectory error:', err);
        throw err;
    }
}

/**
 * Get specialized RepoMap data (structure + signatures).
 * @param {string} path - Root directory path.
 * @returns {Promise<{tree: string, signatures: object}>}
 */
export async function getRepoMap(path) {
    if (!isTauri) throw new Error('getRepoMap is only available in the Tauri desktop app.');
    const { invoke } = await import('@tauri-apps/api/core');
    try {
        return await invoke('get_repo_map', { path });
    } catch (err) {
        console.error('tauriFs.getRepoMap error:', err);
        throw err;
    }
}
