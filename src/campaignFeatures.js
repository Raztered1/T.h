import { supabase } from './cloud'

export async function getCampaignFeatureContext() {
  if (!supabase) throw new Error('Configure o Supabase para usar os recursos de campanha.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Entre na sua conta para continuar.')
  const campaignId = localStorage.getItem('central-dnd-active-campaign-v1')
  if (!campaignId) throw new Error('Selecione ou crie uma campanha no menu Conta / Nuvem.')
  const { data: campaign, error } = await supabase.from('campaigns').select('id,name,owner_id').eq('id', campaignId).single()
  if (error) throw error
  return { user, campaign, isGM: campaign.owner_id === user.id }
}

export async function listCampaignCharacters(campaignId) {
  const { data, error } = await supabase.from('campaign_characters').select('id,name,sheet_data,assigned_user_id,edit_mode,created_at').eq('campaign_id', campaignId).order('created_at')
  if (error) throw error
  return data || []
}
export async function createCampaignCharacter(campaignId, name, sheetData = {}) {
  const { data, error } = await supabase.from('campaign_characters').insert({ campaign_id: campaignId, name, sheet_data: sheetData }).select().single()
  if (error) throw error
  return data
}
export async function createCharacterInvite(characterId) {
  const { data, error } = await supabase.rpc('create_character_invite', { target_character: characterId })
  if (error) throw error
  return data
}
export async function acceptCharacterInvite(token) {
  const { data, error } = await supabase.rpc('accept_character_invite', { invite_token: token })
  if (error) throw error
  return data
}
export async function listCampaignItems(campaignId) {
  const { data, error } = await supabase.from('campaign_items').select('*').eq('campaign_id', campaignId).eq('archived', false).order('name')
  if (error) throw error
  return data || []
}
export async function saveCampaignItem(item) {
  const { data, error } = await supabase.from('campaign_items').upsert(item).select().single()
  if (error) throw error
  return data
}
export async function archiveCampaignItem(id) {
  const { error } = await supabase.from('campaign_items').update({ archived: true }).eq('id', id)
  if (error) throw error
}
export async function listCharacterInventory(characterId) {
  const { data, error } = await supabase.from('character_inventory').select('*,item:campaign_items(id,name,image_url,category,rarity,description,effect,healing,weight,value)').eq('character_id', characterId).order('created_at')
  if (error) throw error
  return (data || []).map(row => ({ ...row, item: row.item || row.item_snapshot || null }))
}
export async function grantCharacterItem(characterId, itemId, quantity) {
  const { error } = await supabase.rpc('grant_character_item', { target_character: characterId, target_item: itemId, item_quantity: quantity })
  if (error) throw error
}
export async function updateInventoryQuantity(inventoryId, quantity) {
  const { error } = await supabase.from('character_inventory').update({ quantity }).eq('id', inventoryId)
  if (error) throw error
}
export async function removeInventoryItem(inventoryId) {
  const { error } = await supabase.from('character_inventory').delete().eq('id', inventoryId)
  if (error) throw error
}
