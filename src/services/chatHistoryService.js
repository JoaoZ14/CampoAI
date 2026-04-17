import { createSupabaseClient } from '../models/supabaseClient.js';

const DEFAULT_MAX_ROWS = 24;

function maxStoredMessages() {
  const n = Number(process.env.CHAT_HISTORY_MAX_MESSAGES);
  if (Number.isFinite(n) && n >= 2) return Math.min(80, n);
  return DEFAULT_MAX_ROWS;
}

/**
 * Histórico recente (texto) para o Gemini: alternância user / assistant.
 * @param {string} userId
 * @returns {Promise<{ role: 'user' | 'assistant', text: string }[]>}
 */
export async function getChatHistoryForModel(userId) {
  if (process.env.CHAT_HISTORY_ENABLED === 'false') {
    return [];
  }

  const supabase = createSupabaseClient();
  const take = maxStoredMessages();

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(take);

  if (error) {
    console.warn('[chat] Não foi possível carregar histórico:', error.message);
    return [];
  }

  const rows = (data ?? []).reverse();
  return rows
    .filter((r) => (r.role === 'user' || r.role === 'assistant') && r.content)
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      text: String(r.content),
    }));
}

/**
 * Grava o turno atual (mensagem do usuário + resposta do assistente).
 * @param {string} userId
 * @param {string} userLine
 * @param {string} assistantText
 */
export async function saveChatTurn(userId, userLine, assistantText) {
  if (process.env.CHAT_HISTORY_ENABLED === 'false') {
    return;
  }

  const supabase = createSupabaseClient();
  const u = String(userLine || '[mensagem]').slice(0, 12000);
  const a = String(assistantText || '').slice(0, 12000);

  const { error } = await supabase.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: u },
    { user_id: userId, role: 'assistant', content: a },
  ]);

  if (error) {
    console.warn('[chat] Não foi possível salvar histórico:', error.message);
  }
}
