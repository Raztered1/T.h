import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const normalize = value => String(value || '').trim().toLowerCase()
const validUsername = value => /^[a-z0-9_]{3,20}$/.test(value)
const emailFor = username => `${createHash('sha256').update(username).digest('hex')}@users.centraldemestragem.invalid`
const hashCode = value => createHash('sha256').update(String(value).replace(/[^a-z0-9]/gi, '').toUpperCase()).digest('hex')
const makeRecoveryCode = () => {
  const raw = randomBytes(12).toString('hex').toUpperCase()
  return raw.match(/.{1,4}/g).join('-')
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' })
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Solicitação inválida.' }) }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const configStatus = {
    urlPresent: Boolean(url),
    anonKeyPresent: Boolean(anonKey),
    serviceKeyPresent: Boolean(serviceKey),
    urlSource: process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : (process.env.SUPABASE_URL ? 'SUPABASE_URL' : 'missing'),
    anonKeySource: process.env.VITE_SUPABASE_ANON_KEY ? 'VITE_SUPABASE_ANON_KEY' : (process.env.SUPABASE_ANON_KEY ? 'SUPABASE_ANON_KEY' : 'missing'),
    serviceKeySource: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : 'missing'
  }
  // Never log credential values; only presence/source information is recorded.
  console.info('[username-auth] Supabase environment check', configStatus)
  if (!url || !anonKey || !serviceKey) {
    console.error('[username-auth] Missing Supabase environment variable(s)', configStatus)
    return json(503, { error: 'Autenticação não configurada no servidor. Confira as variáveis do Supabase no Netlify.' })
  }

  let parsedUrl
  try { parsedUrl = new URL(url) } catch {
    console.error('[username-auth] SUPABASE URL is not a valid URL')
    return json(503, { error: 'A URL do Supabase configurada no servidor é inválida.' })
  }
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    console.error('[username-auth] SUPABASE URL has an unsupported protocol')
    return json(503, { error: 'A URL do Supabase configurada no servidor é inválida.' })
  }

  let admin, publicClient
  try {
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  } catch (error) {
    console.error('[username-auth] Supabase client initialization failed:', error?.message || 'unknown error')
    return json(503, { error: 'Não foi possível inicializar a conexão com o Supabase. Confira a configuração do servidor.' })
  }
  const username = normalize(body.username)
  const password = String(body.password || '')
  if (!validUsername(username)) return json(400, { error: 'O nome de usuário deve ter de 3 a 20 caracteres, usando apenas letras sem acento, números e _. ' })

  try {
    if (body.action === 'register') {
      if (password.length < 8) return json(400, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
      const recoveryCode = makeRecoveryCode()
      const { error: reserveError } = await admin.from('username_accounts').insert({ username, recovery_code_hash: hashCode(recoveryCode) })
      if (reserveError) {
        if (reserveError.code === '23505') return json(409, { error: 'Esse nome de usuário já está em uso. Escolha outro.' })
        throw reserveError
      }
      const email = emailFor(username)
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } })
      if (createError) {
        await admin.from('username_accounts').delete().eq('username', username)
        throw createError
      }
      const { error: linkError } = await admin.from('username_accounts').update({ auth_user_id: created.user.id }).eq('username', username)
      if (linkError) {
        await admin.auth.admin.deleteUser(created.user.id)
        await admin.from('username_accounts').delete().eq('username', username)
        throw linkError
      }
      const { data: signed, error: signError } = await publicClient.auth.signInWithPassword({ email, password })
      if (signError) throw signError
      return json(200, { access_token: signed.session.access_token, refresh_token: signed.session.refresh_token, recoveryCode })
    }

    if (body.action === 'login') {
      if (!password) return json(400, { error: 'Informe sua senha.' })
      const { data: account, error } = await admin.from('username_accounts').select('username').eq('username', username).maybeSingle()
      if (error) throw error
      if (!account) return json(401, { error: 'Nome de usuário ou senha incorretos.' })
      const { data, error: signError } = await publicClient.auth.signInWithPassword({ email: emailFor(username), password })
      if (signError || !data.session) return json(401, { error: 'Nome de usuário ou senha incorretos.' })
      return json(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    }

    if (body.action === 'recover') {
      const recoveryCode = String(body.recoveryCode || '')
      const newPassword = String(body.newPassword || '')
      if (newPassword.length < 8) return json(400, { error: 'A nova senha precisa ter pelo menos 8 caracteres.' })
      if (!recoveryCode) return json(400, { error: 'Informe o código de recuperação.' })
      const { data: account, error } = await admin.from('username_accounts').select('auth_user_id,recovery_code_hash').eq('username', username).maybeSingle()
      if (error) throw error
      if (!account?.auth_user_id || !account.recovery_code_hash) return json(400, { error: 'Usuário ou código de recuperação inválido.' })
      const expected = Buffer.from(account.recovery_code_hash, 'hex')
      const received = Buffer.from(hashCode(recoveryCode), 'hex')
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return json(400, { error: 'Usuário ou código de recuperação inválido.' })
      const nextCode = makeRecoveryCode()
      const { error: updateError } = await admin.auth.admin.updateUserById(account.auth_user_id, { password: newPassword })
      if (updateError) throw updateError
      const { error: rotateError } = await admin.from('username_accounts').update({ recovery_code_hash: hashCode(nextCode) }).eq('username', username)
      if (rotateError) throw rotateError
      const { data, error: signError } = await publicClient.auth.signInWithPassword({ email: emailFor(username), password: newPassword })
      if (signError || !data.session) throw signError || new Error('Senha alterada, mas não foi possível iniciar a sessão automaticamente.')
      return json(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token, recoveryCode: nextCode })
    }

    return json(400, { error: 'Ação desconhecida.' })
  } catch (error) {
    console.error('username-auth:', error)
    return json(500, { error: 'Não foi possível concluir a operação. Verifique a configuração do Supabase e tente novamente.' })
  }
}
