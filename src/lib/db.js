/**
 * @file db.js
 * @description IndexedDB schema and accessors for conversations and messages (Dexie).
 * Used for sidebar conversation list, chat history, and bulk erase.
 */
import Dexie from 'dexie';

const db = new Dexie('LMStudioChat');
db.version(1).stores({
  conversations: 'id, createdAt, updatedAt',
  messages: 'id, conversationId, createdAt',
});

export const conversationsTable = db.conversations;
export const messagesTable = db.messages;

/**
 * @param {string} [model]
 * @returns {Promise<string>} new conversation id
 */
export async function createConversation(model = '') {
  const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await conversationsTable.add({
    id,
    title: 'New chat',
    model,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

/**
 * @param {string} id
 * @param {{ title?: string, model?: string }} updates
 */
export async function updateConversation(id, updates) {
  await conversationsTable.update(id, { ...updates, updatedAt: Date.now() });
}

/**
 * @param {string} id
 */
export async function deleteConversation(id) {
  await db.transaction('rw', conversationsTable, messagesTable, async () => {
    await messagesTable.where('conversationId').equals(id).delete();
    await conversationsTable.delete(id);
  });
}

/** Delete all conversations and all messages (bulk erase). */
export async function deleteAllConversations() {
  await db.transaction('rw', conversationsTable, messagesTable, async () => {
    await messagesTable.clear();
    await conversationsTable.clear();
  });
}

/**
 * @returns {Promise<Array<{ id: string, title: string, model: string, pinned?: boolean, createdAt: number, updatedAt: number }>>}
 */
export async function listConversations() {
  return conversationsTable.orderBy('updatedAt').reverse().toArray();
}

/**
 * Toggle pinned state for a conversation.
 * @param {string} conversationId
 * @returns {Promise<boolean>} new pinned state
 */
export async function toggleConversationPin(conversationId) {
  const conv = await conversationsTable.get(conversationId);
  if (!conv) return false;
  const next = !(conv.pinned === true);
  await updateConversation(conversationId, { pinned: next });
  return next;
}

/**
 * @returns {Promise<Array<{ id: string, title: string, model: string, pinned: boolean, createdAt: number, updatedAt: number }>>}
 */
export async function listPinnedConversations() {
  const all = await listConversations();
  return all.filter((c) => c.pinned === true);
}

/**
 * @param {string} conversationId
 * @param {{ role: string, content: string|Array, contextString?: string, autoInjectedFiles?: string[], stats?: Object, modelId?: string, imageRefs?: Array<{ image_id: string }>, imageUrls?: string[], videoUrls?: string[] }} message
 * @param {string} [existingId] - If provided (e.g. streaming placeholder id), use it so the saved message keeps the same id and the UI does not remount.
 */
export async function addMessage(conversationId, message, existingId) {
  const id = typeof existingId === 'string' && existingId.trim() ? existingId.trim() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const imageUrls = message.imageUrls;
  const videoUrls = message.videoUrls;
  const autoInjectedFiles = message.autoInjectedFiles;
  await messagesTable.add({
    id,
    conversationId,
    role: message.role,
    content: message.content,
    contextString: message.contextString ?? null,
    stats: message.stats ?? null,
    modelId: message.modelId ?? null,
    imageRefs: message.imageRefs ?? null,
    imageUrls: Array.isArray(imageUrls) ? [...imageUrls] : null,
    videoUrls: Array.isArray(videoUrls) ? [...videoUrls] : null,
    autoInjectedFiles: Array.isArray(autoInjectedFiles) ? [...autoInjectedFiles] : null,
    createdAt: Date.now(),
  });
  return id;
}

/**
 * @param {string} messageId
 * @param {{ content?: string, stats?: Object }} updates
 */
export async function updateMessage(messageId, updates) {
  await messagesTable.update(messageId, updates);
}

/**
 * @param {string} messageId
 */
export async function deleteMessage(messageId) {
  await messagesTable.delete(messageId);
}

/**
 * @param {string} conversationId
 * @returns {Promise<Array<{ id: string, role: string, content: string|Array, stats: Object|null, modelId?: string, createdAt: number }>>}
 */
export async function getMessages(conversationId) {
  return messagesTable.where('conversationId').equals(conversationId).sortBy('createdAt');
}

/**
 * @param {string} conversationId
 * @returns {Promise<number>}
 */
export async function getMessageCount(conversationId) {
  return messagesTable.where('conversationId').equals(conversationId).count();
}

/**
 * Clear all messages in a conversation.
 * @param {string} conversationId
 */
export async function clearMessages(conversationId) {
  await messagesTable.where('conversationId').equals(conversationId).delete();
}
