/**
 * @file projectMemory.js
 * @description Frontend interface for persistent project-specific memory (SQLite via tauri-plugin-sql).
 * Stores session summaries to provide long-term context across conversations.
 */
import Database from '@tauri-apps/plugin-sql';

let db = null;

async function getDb() {
    if (!db) {
        db = await Database.load('sqlite:atom_memory.db');
    }
    return db;
}

/**
 * Save or update the summary for a specific project.
 * @param {string} projectPath 
 * @param {string} summary 
 */
export async function saveProjectSummary(projectPath, summary) {
    const database = await getDb();
    await database.execute(
        `INSERT INTO project_memory (project_path, summary, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT(project_path) DO UPDATE SET 
            summary = $2,
            updated_at = CURRENT_TIMESTAMP`,
        [projectPath, summary]
    );
}

/**
 * Load the summary for a specific project.
 * @param {string} projectPath 
 * @returns {Promise<string|null>}
 */
export async function loadProjectSummary(projectPath) {
    const database = await getDb();
    const rows = await database.select(
        'SELECT summary FROM project_memory WHERE project_path = $1',
        [projectPath]
    );
    return rows.length > 0 ? rows[0].summary : null;
}
