import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudConfigured = Boolean(url && anonKey)
export const supabase = cloudConfigured ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
const QUEUE_KEY = 'central-dnd-cloud-queue-v1'
const CAMPAIGN_KEY = 'central-dnd-active-campaign-v1'
export const getActiveCampaign = () => localStorage.getItem(CAMPAIGN_KEY)
export const setActiveCampaign = id => id ? localStorage.setItem(CAMPAIGN_KEY, id) : localStorage.removeItem(CAMPAIGN_KEY)

function queue(item) {
  try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); q.push(item); localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-300))) } catch {}
}
export async function syncDocument(key, value) {
  if (!supabase || !navigator.onLine) { queue({ key, value, updated_at: new Date().toISOString() }); return { queued: true } }
  const campaign_id = getActiveCampaign()
  if (!campaign_id) return { skipped: true }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { skipped: true }
  const { error } = await supabase.from('campaign_documents').upsert({ campaign_id, document_key: key, content: value, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'campaign_id,document_key' })
  if (error) { queue({ key, value, updated_at: new Date().toISOString() }); throw error }
  return { synced: true }
}
export async function flushQueue() {
  if (!supabase || !navigator.onLine || !getActiveCampaign()) return
  let q = []; try { q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch {}
  if (!q.length) return
  const remaining = []
  for (const item of q) { try { const r = await syncDocument(item.key, item.value); if (!r.synced && !r.skipped) remaining.push(item) } catch { remaining.push(item) } }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
}
export async function fetchCampaignDocuments(campaignId) {
  if (!supabase) return []
  const { data, error } = await supabase.from('campaign_documents').select('document_key,content,updated_at').eq('campaign_id', campaignId)
  if (error) throw error
  return data || []
}
export async function createCampaign(name) {
  const { data, error } = await supabase.rpc('create_campaign', { campaign_name: name })
  if (error) throw error
  return data
}
export async function joinCampaign(code) {
  const { data, error } = await supabase.rpc('join_campaign', { invite_code: code.trim().toUpperCase() })
  if (error) throw error
  return data
}
export async function listCampaigns() {
  const { data, error } = await supabase.from('campaign_members').select('campaign_id, role, campaigns(id,name,invite_code,owner_id)')
  if (error) throw error
  return (data || []).map(x => ({ ...x.campaigns, role: x.role }))
}
