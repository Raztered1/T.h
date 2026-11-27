import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CampaignHub from './CampaignHub'
import { getCampaignFeatureContext, createCampaignCharacter } from './campaignFeatures'
import { cloudConfigured, supabase, syncDocument, flushQueue, fetchCampaignDocuments, createCampaign, joinCampaign, listCampaigns, getActiveCampaign, setActiveCampaign } from './cloud'
import {
  Swords, Cloud, Upload, Grid3X3, Eye, EyeOff, Plus, Trash2, ZoomIn, ZoomOut,
  Maximize, Monitor, Lock, Unlock, Image as ImageIcon, MousePointer2,
  Hand, RotateCcw, Shield, Users, Skull, Save, PanelLeftClose, PanelLeftOpen,
  BookOpen, ScrollText, NotebookPen, Flag, UsersRound, Clock3, Dices, CalendarDays,
  ChevronRight, PlusCircle, CircleHelp, ListChecks, Swords as SwordsIcon, Heart, Footprints, Backpack, UserRound, ArrowLeft
} from 'lucide-react'

const CHANNEL_NAME = 'central-mestragem-dnd'
const DB_NAME = 'central-mestragem-dnd-db'
const DB_STORE = 'scenes'
const DRAFT_KEY = 'draft'
const PUBLISHED_KEY = 'published'

// Símbolos disponíveis para representar as classes clássicas de D&D.
const CLASS_ICONS = [
  { name: 'Artífice', symbol: '⚙️' },
  { name: 'Bárbaro', symbol: '🪓' },
  { name: 'Bardo', symbol: '🎵' },
  { name: 'Clérigo', symbol: '✨' },
  { name: 'Druida', symbol: '🍃' },
  { name: 'Guerreiro', symbol: '⚔️' },
  { name: 'Monge', symbol: '👊' },
  { name: 'Paladino', symbol: '🛡️' },
  { name: 'Patrulheiro', symbol: '🏹' },
  { name: 'Ladino', symbol: '🗡️' },
  { name: 'Feiticeiro', symbol: '🔥' },
  { name: 'Bruxo', symbol: '🌑' },
  { name: 'Mago', symbol: '🪄' },
  { name: 'Monstro', symbol: '💀' },
  { name: 'NPC', symbol: '🧙' },
  { name: 'Personagem', symbol: '🎭' },
]

function openSceneDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveScene(key, value) {
  const db = await openSceneDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, key)
    tx.oncomplete = () => { db.close(); syncDocument(key, value).catch(() => {}); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function saveSceneLocalOnly(key, value) {
  const db = await openSceneDB()
  return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(value, key); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => { db.close(); reject(tx.error) } })
}

async function loadScene(key) {
  const db = await openSceneDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const request = tx.objectStore(DB_STORE).get(key)
    request.onsuccess = () => { const value = request.result; db.close(); resolve(value) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

const initialScene = {
  title: 'Novo encontro',
  mapUrl: '',
  mapName: '',
  grid: true,
  gridSize: 64,
  zoom: 1,
  panX: 0,
  panY: 0,
  tokens: [],
  fog: [],
  background: '#171713'
}

function useChannel() {
  const channelRef = useRef(null)
  useEffect(() => {
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME)
    }
    return () => channelRef.current?.close()
  }, [])
  return channelRef
}

function Projection() {
  const [scene, setScene] = useState(initialScene)
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const [frozen, setFrozen] = useState(false)
  const [showBlack, setShowBlack] = useState(false)
  const [transition, setTransition] = useState('fade')
  const [changing, setChanging] = useState(false)
  const panDragRef = useRef(null)
  const projectionStageRef = useRef(null)
  const channelRef = useChannel()

  useEffect(() => {
    loadScene(PUBLISHED_KEY).then(saved => { if (saved) setScene(saved) }).catch(() => {})
  }, [])

  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return
    channel.onmessage = async (event) => {
      const message = event.data
      if (message?.type === 'freeze') setFrozen(Boolean(message.value))
      if (message?.type === 'blackout') setShowBlack(Boolean(message.value))
      if (message?.type === 'transition') setTransition(message.value)
      if (message?.type === 'publish' && !frozen) {
        if (message.transition) setTransition(message.transition)
        const nextScene = await loadScene(PUBLISHED_KEY).catch(() => null)
        if (!nextScene) return
        if (transition === 'fade') {
          setChanging(true)
          window.setTimeout(() => { setScene(nextScene); setChanging(false) }, 350)
        } else setScene(nextScene)
      }
    }
  }, [channelRef, frozen, transition])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') document.exitFullscreen?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const projectionPointerDown = (event, token) => {
    if (event.button !== 0 || frozen) return
    if (token) {
      event.preventDefault(); event.stopPropagation()
      panDragRef.current = { type: 'token', id: token.id }
    } else {
      panDragRef.current = { type: 'pan', x: event.clientX, y: event.clientY, panX: scene.panX || 0, panY: scene.panY || 0 }
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const projectionPointerMove = (event) => {
    const drag = panDragRef.current
    if (!drag || frozen || !projectionStageRef.current) return
    if (drag.type === 'pan') {
      setScene(current => ({ ...current, panX: drag.panX + event.clientX - drag.x, panY: drag.panY + event.clientY - drag.y }))
      return
    }
    const rect = projectionStageRef.current.getBoundingClientRect()
    const zoom = scene.zoom || 1
    const x = Math.max(0, Math.min(100, (((event.clientX - rect.left - rect.width / 2 - (scene.panX || 0)) / zoom) + rect.width / 2) / rect.width * 100))
    const y = Math.max(0, Math.min(100, (((event.clientY - rect.top - rect.height / 2 - (scene.panY || 0)) / zoom) + rect.height / 2) / rect.height * 100))
    setScene(current => ({ ...current, tokens: current.tokens.map(item => item.id === drag.id ? { ...item, x, y } : item) }))
  }
  const projectionPointerUp = () => {
    const drag = panDragRef.current
    if (drag?.type === 'token' || drag?.type === 'pan') {
      const latestScene = sceneRef.current
      saveScene(PUBLISHED_KEY, latestScene).catch(() => {})
      channelRef.current?.postMessage({ type: 'projection-edit', scene: latestScene })
    }
    panDragRef.current = null
  }

  return (
    <main className={`projection ${changing ? 'projection-changing' : ''}`}>
      {showBlack ? <div className="blackout" /> : (
        <div className="projection-stage">
          <div ref={projectionStageRef} className="projection-canvas" onPointerDown={e => projectionPointerDown(e, null)} onPointerMove={projectionPointerMove} onPointerUp={projectionPointerUp} onPointerCancel={projectionPointerUp}>
          <div className="scene-content" style={{ transform: `translate(${scene.panX || 0}px, ${scene.panY || 0}px) scale(${scene.zoom || 1})` }}>
            {scene.mapUrl ? <img className="projection-map" src={scene.mapUrl} alt="Mapa da sessão" /> : (
              <div className="projection-empty"><Swords size={46}/><span>Aguardando mapa do mestre</span></div>
            )}
            {scene.grid && <div className="projection-grid" style={{ backgroundSize: `${scene.gridSize}px ${scene.gridSize}px` }} />}
            <div className="projection-tokens">
              {(scene.tokens || []).map(token => (
                <div key={token.id} className={`token token-${token.kind}`} style={{ left: `${token.x}%`, top: `${token.y}%`, width: token.size, height: token.size, fontSize: Math.max(7, token.size * 0.48) }} onPointerDown={e => projectionPointerDown(e, token)}>
                  <span>{token.symbol}</span>
                  {token.label && token.size >= 22 && <small>{token.label}</small>}
                </div>
              ))}
            </div>
            <FogLayer fog={scene.fog || []} />
          </div>
          </div>
        </div>
      )}
      <div className="projection-status">
        {frozen && <span><Lock size={13}/> CENA CONGELADA</span>}
      </div>
    </main>
  )
}

function FogLayer({ fog }) {
  return <div className="fog-layer">{fog.map((spot, i) => (
    <div key={i} className="fog-spot" style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.size}%`, height: `${spot.size}%` }} />
  ))}</div>
}

const SHIELD_KEY = 'master-shield'
const defaultShield = {
  session: { campaign: '', session: '1', date: '', place: '', weather: '', time: '' },
  rules: [
    { id: 'easy', name: 'Muito fácil', dc: 5 }, { id: 'simple', name: 'Fácil', dc: 10 },
    { id: 'moderate', name: 'Moderada', dc: 15 }, { id: 'hard', name: 'Difícil', dc: 20 },
    { id: 'very-hard', name: 'Muito difícil', dc: 25 }, { id: 'nearly-impossible', name: 'Quase impossível', dc: 30 },
  ],
  combat: { round: 1, turn: 0, active: false, participants: [] },
  npcs: [], missions: [], clues: [], locations: [], history: [], notes: ''
}
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

function ShieldPanel() {
  const [data, setData] = useState(defaultShield)
  const [tab, setTab] = useState('overview')
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState({ name: '', detail: '' })
  const [newName, setNewName] = useState('')
  const [saved, setSaved] = useState('Carregando dados…')
  useEffect(() => { loadScene(SHIELD_KEY).then(v => { if (v) setData({ ...defaultShield, ...v, session: { ...defaultShield.session, ...(v.session || {}) }, combat: { ...defaultShield.combat, ...(v.combat || {}) } }) }).catch(() => {}).finally(() => setLoaded(true)) }, [])
  useEffect(() => { if (!loaded) return; const timer = setTimeout(() => saveScene(SHIELD_KEY, data).then(() => setSaved('Salvo automaticamente')).catch(() => setSaved('Falha ao salvar')), 250); return () => clearTimeout(timer) }, [data, loaded])
  const patch = (key, value) => setData(d => ({ ...d, [key]: value }))
  const patchSession = (key, value) => setData(d => ({ ...d, session: { ...d.session, [key]: value } }))
  const addRecord = (key, name, detail = '') => { if (!name.trim()) return; patch(key, [...(data[key] || []), { id: makeId(), name: name.trim(), detail, important: false }]); setNewName(''); setDraft({ name: '', detail: '' }) }
  const removeRecord = (key, id) => patch(key, data[key].filter(x => x.id !== id))
  const updateRecord = (key, id, changes) => patch(key, data[key].map(x => x.id === id ? { ...x, ...changes } : x))
  const addLog = () => addRecord('history', `Registro — ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, '')
  const addCombatant = () => { if (!newName.trim()) return; const item = { id: makeId(), name: newName.trim(), initiative: 0, hp: '', maxHp: '', conditions: '' }; setData(d => ({ ...d, combat: { ...d.combat, active: true, participants: [...d.combat.participants, item].sort((a,b) => b.initiative-a.initiative) } })); setNewName('') }
  const updateCombatant = (id, changes) => setData(d => ({ ...d, combat: { ...d.combat, participants: d.combat.participants.map(x => x.id === id ? { ...x, ...changes } : x).sort((a,b) => b.initiative-a.initiative) } }))
  const removeCombatant = id => setData(d => ({ ...d, combat: { ...d.combat, participants: d.combat.participants.filter(x => x.id !== id), turn: 0 } }))
  const advanceTurn = (direction = 1) => setData(d => { const count = d.combat.participants.length; if (!count) return d; let next = d.combat.turn + direction, round = d.combat.round; if (next >= count) { next = 0; round++ } if (next < 0) { next = count - 1; round = Math.max(1, round - 1) } return { ...d, combat: { ...d.combat, active: true, turn: next, round } } })
  const nav = [ ['overview','Visão geral',Shield], ['rules','Regras rápidas',BookOpen], ['initiative','Iniciativa',SwordsIcon], ['npcs','NPCs e personagens',UsersRound], ['adventure','Aventura',Flag], ['history','Histórico',Clock3], ['notes','Anotações',NotebookPen] ]
  return <section className="shield-workspace">
    <aside className="shield-sidebar"><div className="shield-side-title"><span>ESCUDO DO MESTRE</span><small>CONSULTA RÁPIDA</small></div>
      {nav.map(([id,label,Icon]) => <button key={id} className={`shield-nav ${tab===id?'active':''}`} onClick={() => setTab(id)}><Icon size={17}/><span>{label}</span><ChevronRight size={14}/></button>)}
      <div className="shield-side-foot"><Shield size={15}/> Dados salvos neste navegador</div>
    </aside>
    <main className="shield-main">
      <div className="shield-heading"><div><span className="eyebrow">CENTRAL DE MESTRAGEM / ESCUDO</span><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1><p>Seu painel de consulta e organização durante a sessão.</p></div><span className="shield-save"><span className="live-dot"/>{saved}</span></div>
      {tab==='overview' && <div className="shield-content">
        <div className="shield-section-head"><h2>Informações da sessão</h2><span>EDITÁVEL</span></div>
        <div className="shield-form-grid">
          {[['campaign','Campanha','Ex.: Nome da campanha'],['session','Sessão','Número ou identificação'],['date','Data',''],['place','Local','Onde a sessão acontece'],['weather','Clima','Ex.: chuva forte'],['time','Horário / período','Ex.: noite']].map(([key,label,placeholder])=><label className="shield-field" key={key}><span>{label}</span><input value={data.session[key]||''} placeholder={placeholder} type={key==='date'?'date':'text'} onChange={e=>patchSession(key,e.target.value)}/></label>)}
        </div>
        <div className="shield-overview-grid"><button className="shield-summary-card" onClick={()=>setTab('initiative')}><Swords size={20}/><strong>{data.combat.participants.length} participantes</strong><small>{data.combat.active?'Combate em andamento':'Abrir controle de iniciativa'}</small></button><button className="shield-summary-card" onClick={()=>setTab('npcs')}><UsersRound size={20}/><strong>{data.npcs.length} NPCs / personagens</strong><small>Consultar fichas rápidas</small></button><button className="shield-summary-card" onClick={()=>setTab('adventure')}><Flag size={20}/><strong>{data.missions.length} objetivos</strong><small>Missões e elementos da aventura</small></button><button className="shield-summary-card" onClick={()=>setTab('history')}><Clock3 size={20}/><strong>{data.history.length} registros</strong><small>Eventos anotados nesta sessão</small></button></div>
        <div className="shield-tip"><CircleHelp size={17}/><span>Use o menu lateral para acessar regras, iniciativa, NPCs, pistas, locais e histórico sem sair do escudo.</span></div>
      </div>}
      {tab==='rules' && <div className="shield-content"><div className="shield-section-head"><h2>Referência de CDs</h2><button className="shield-text-button" onClick={()=>patch('rules', defaultShield.rules.map(x=>({...x})))}>Restaurar padrões</button></div><p className="shield-muted">Ajuste os valores para o seu estilo de mestragem. As alterações ficam salvas automaticamente.</p><div className="rule-list">{data.rules.map(rule=><div className="rule-row" key={rule.id}><span>{rule.name}</span><label>CD <input type="number" min="0" max="99" value={rule.dc} onChange={e=>patch('rules',data.rules.map(x=>x.id===rule.id?{...x,dc:Number(e.target.value)}:x))}/></label><button className="rule-reset" title="Restaurar este valor" onClick={()=>patch('rules',data.rules.map(x=>x.id===rule.id?{...x,dc:defaultShield.rules.find(base=>base.id===rule.id)?.dc ?? x.dc}:x))}>Padrão</button></div>)}</div><div className="shield-subcard"><h3>Lembretes de regras</h3><p>Condições · Concentração · Ações e ações bônus · Descanso · Testes de resistência · Morte e estabilização</p><small>Espaço de consulta rápida; os detalhes podem ser registrados em Anotações.</small></div></div>}
      {tab==='initiative' && <div className="shield-content"><div className="shield-section-head"><h2>Ordem de combate</h2><div className="shield-inline-actions"><span className="round-pill">Rodada {data.combat.round}</span><button className="shield-text-button" onClick={()=>setData(d=>({...d,history:[...d.history,{id:makeId(),name:`Combate encerrado — rodada ${d.combat.round}`,detail:d.combat.participants.map(p=>`${p.name}: iniciativa ${p.initiative}${p.hp?`, PV ${p.hp}`:''}`).join('\n'),important:false}],combat:{...d.combat,active:false,turn:0,round:1,participants:[]}}))}>Encerrar combate</button></div></div><div className="add-line"><input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCombatant()} placeholder="Nome do personagem, monstro ou NPC"/><button className="shield-add" onClick={addCombatant}><Plus size={16}/> Adicionar</button></div><div className="combat-list">{data.combat.participants.length===0?<div className="shield-empty">Nenhum participante. Adicione combatentes para montar a iniciativa.</div>:data.combat.participants.map((p,i)=><div className={`combat-row ${data.combat.active&&i===data.combat.turn?'current':''}`} key={p.id}><span className="combat-order">{i+1}</span><div className="combat-fields"><input aria-label="Nome" value={p.name} onChange={e=>updateCombatant(p.id,{name:e.target.value})}/><div className="combat-subfields"><label>Iniciativa <input type="number" value={p.initiative} onChange={e=>updateCombatant(p.id,{initiative:Number(e.target.value)})}/></label><label>PV <input value={p.hp} placeholder="Atual" onChange={e=>updateCombatant(p.id,{hp:e.target.value})}/></label><label>Máx. PV <input value={p.maxHp} placeholder="Máximo" onChange={e=>updateCombatant(p.id,{maxHp:e.target.value})}/></label></div><input className="combat-condition" value={p.conditions} placeholder="Condições / observações" onChange={e=>updateCombatant(p.id,{conditions:e.target.value})}/></div><div className="combat-row-actions"><button className="shield-icon-button" onClick={()=>updateCombatant(p.id,{initiative:Math.floor(Math.random()*20)+1})} title="Rolar iniciativa (1d20)"><Dices size={15}/></button><button className="shield-icon-delete" onClick={()=>removeCombatant(p.id)} title="Remover"><Trash2 size={15}/></button></div></div>)}</div><div className="combat-controls"><button className="shield-control" disabled={!data.combat.participants.length} onClick={()=>advanceTurn(-1)}>Turno anterior</button><button className="shield-control primary" disabled={!data.combat.participants.length} onClick={()=>advanceTurn(1)}>Próximo turno <ChevronRight size={15}/></button></div><p className="shield-muted">A lista é ordenada automaticamente pela iniciativa, da maior para a menor. Empates podem ser reorganizados alterando os valores.</p></div>}
      {tab==='npcs' && <div className="shield-content"><div className="shield-section-head"><h2>NPCs e personagens</h2></div><div className="add-line"><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Nome do NPC ou personagem"/><input value={draft.detail} onChange={e=>setDraft(d=>({...d,detail:e.target.value}))} placeholder="Descrição, função ou informação"/><button className="shield-add" onClick={()=>addRecord('npcs',draft.name,draft.detail)}><Plus size={16}/> Adicionar</button></div><RecordList items={data.npcs} onUpdate={(id,c)=>updateRecord('npcs',id,c)} onRemove={id=>removeRecord('npcs',id)} empty="Nenhum NPC cadastrado."/></div>}
      {tab==='adventure' && <div className="shield-content"><div className="shield-section-head"><h2>Elementos da aventura</h2></div>{[['missions','Missões e objetivos'],['clues','Pistas e segredos'],['locations','Locais importantes']].map(([key,label])=><div className="adventure-block" key={key}><h3>{label}</h3><div className="add-line"><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder={`Adicionar: ${label.toLowerCase()}`}/><input value={draft.detail} onChange={e=>setDraft(d=>({...d,detail:e.target.value}))} placeholder="Detalhes / consequências / observações"/><button className="shield-add" onClick={()=>addRecord(key,draft.name,draft.detail)}><Plus size={16}/></button></div><RecordList items={data[key]} onUpdate={(id,c)=>updateRecord(key,id,c)} onRemove={id=>removeRecord(key,id)} empty="Nenhum item registrado."/></div>)}</div>}
      {tab==='history' && <div className="shield-content"><div className="shield-section-head"><h2>Histórico da sessão</h2><button className="shield-add" onClick={addLog}><Plus size={16}/> Novo registro</button></div><p className="shield-muted">Registre acontecimentos, decisões, descobertas e consequências em ordem cronológica.</p><RecordList items={data.history} onUpdate={(id,c)=>updateRecord('history',id,c)} onRemove={id=>removeRecord('history',id)} empty="Ainda não há acontecimentos registrados." showTime/></div>}
      {tab==='notes' && <div className="shield-content"><div className="shield-section-head"><h2>Anotações do mestre</h2><span className="shield-muted">SALVAMENTO AUTOMÁTICO</span></div><textarea className="master-notes" value={data.notes} onChange={e=>patch('notes',e.target.value)} placeholder="Anote ideias, falas, lembretes, informações secretas e acontecimentos que não quer esquecer…"/><div className="shield-tip"><Lock size={16}/><span>Este painel é destinado à consulta do mestre e não aparece na janela de projeção.</span></div></div>}
    </main>
  </section>
}

function RecordList({ items, onUpdate, onRemove, empty, showTime=false }) {
  if (!items?.length) return <div className="shield-empty">{empty}</div>
  return <div className="record-list">{items.map(item=><article className="record-card" key={item.id}><div className="record-card-head"><input value={item.name} onChange={e=>onUpdate(item.id,{name:e.target.value})}/><div><button className={`shield-icon-button ${item.important?'marked':''}`} title="Marcar importante" onClick={()=>onUpdate(item.id,{important:!item.important})}>★</button><button className="shield-icon-delete" title="Excluir" onClick={()=>onRemove(item.id)}><Trash2 size={15}/></button></div></div><textarea value={item.detail||''} onChange={e=>onUpdate(item.id,{detail:e.target.value})} placeholder="Detalhes e observações…"/>{showTime&&<small>{item.name.startsWith('Registro —')?'Registro da sessão':'Acontecimento'}</small>}</article>)}</div>
}

const CHARACTER_KEY = 'character-sheets-v1'
const blankCharacter = () => ({
  id: makeId(), name: 'Novo personagem', player: '', species: '', className: '', subclass: '', level: 1, background: '', alignment: '', portrait: '',
  hp: 10, maxHp: 10, tempHp: 0, ac: 10, initiative: 0, speed: '9 m', proficiency: 2, hitDice: '1d8', exhaustion: 0,
  abilities: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 }, saves: [], skills: [], attacks: [], spells: [], inventory: [], features: '', personality: '', ideals: '', bonds: '', flaws: '', notes: '', currency: { po: 0, pp: 0, pe: 0, pc: 0 }
})
const ABILITY_LABELS = [['for','Força'],['des','Destreza'],['con','Constituição'],['int','Inteligência'],['sab','Sabedoria'],['car','Carisma']]
const SKILL_LABELS = ['Acrobacia','Arcanismo','Atletismo','Atuação','Enganação','Furtividade','História','Intimidação','Intuição','Investigação','Lidar com Animais','Medicina','Natureza','Percepção','Persuasão','Prestidigitação','Religião','Sobrevivência']

function CharacterSheet() {
  const [characters, setCharacters] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState('overview')
  const [spellId, setSpellId] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saveLabel, setSaveLabel] = useState('Carregando…')
  const [shareBusy, setShareBusy] = useState(false)
  const [spellDraft, setSpellDraft] = useState({ name: '', level: 'Truque', school: '', casting: '', range: '', components: '', duration: '', description: '', prepared: true })
  const [attackDraft, setAttackDraft] = useState({ name: '', bonus: '', damage: '', type: '' })
  const active = characters.find(c => c.id === activeId) || characters[0] || null
  useEffect(() => {
    loadScene(CHARACTER_KEY).then(saved => {
      if (Array.isArray(saved) && saved.length) { setCharacters(saved); setActiveId(saved[0].id) }
      else { const first = blankCharacter(); setCharacters([first]); setActiveId(first.id) }
    }).catch(() => { const first = blankCharacter(); setCharacters([first]); setActiveId(first.id) }).finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (!loaded) return
    setSaveLabel('Salvando…')
    const timer = window.setTimeout(() => saveScene(CHARACTER_KEY, characters).then(() => setSaveLabel('Salvo neste dispositivo')).catch(() => setSaveLabel('Falha ao salvar')), 300)
    return () => window.clearTimeout(timer)
  }, [characters, loaded])
  const patch = (changes) => setCharacters(list => list.map(c => c.id === active?.id ? { ...c, ...changes } : c))
  const patchAbility = (key, value) => patch({ abilities: { ...active.abilities, [key]: Number(value) } })
  const addCharacter = () => { const c = blankCharacter(); setCharacters(list => [...list, c]); setActiveId(c.id); setTab('overview'); setSpellId(null) }
  const deleteCharacter = () => { if (!active || !window.confirm(`Excluir a ficha de ${active.name}?`)) return; const next = characters.filter(c => c.id !== active.id); setCharacters(next); setActiveId(next[0]?.id || null); setSpellId(null) }
  const uploadPortrait = (file) => { if (!file) return; if (!file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => patch({ portrait: reader.result }); reader.readAsDataURL(file) }
  const updateListItem = (key, id, changes) => patch({ [key]: (active[key] || []).map(item => item.id === id ? { ...item, ...changes } : item) })
  const removeListItem = (key, id) => patch({ [key]: (active[key] || []).filter(item => item.id !== id) })
  const addSpell = () => { if (!spellDraft.name.trim()) return; patch({ spells: [...(active.spells || []), { ...spellDraft, id: makeId(), name: spellDraft.name.trim() }] }); setSpellDraft({ name: '', level: 'Truque', school: '', casting: '', range: '', components: '', duration: '', description: '', prepared: true }) }
  const addAttack = () => { if (!attackDraft.name.trim()) return; patch({ attacks: [...(active.attacks || []), { ...attackDraft, id: makeId() }] }); setAttackDraft({ name: '', bonus: '', damage: '', type: '' }) }
  const modifier = score => Math.floor((Number(score || 10) - 10) / 2)
  const fmt = value => `${value >= 0 ? '+' : ''}${value}`
  const nav = [['overview','Visão geral',Shield],['combat','Combate',Swords],['spells','Magias',BookOpen],['skills','Perícias',Dices],['inventory','Inventário',Backpack],['identity','Personagem',UserRound]]
  if (!active) return <section className="character-workspace"><div className="character-empty">Nenhuma ficha criada. <button className="character-primary" onClick={addCharacter}>Criar personagem</button></div></section>
  const currentSpell = active.spells?.find(s => s.id === spellId)
  return <section className="character-workspace">
    <aside className="character-sidebar">
      <div className="character-side-head"><div><span>FICHAS</span><small>PERSONAGENS</small></div><button className="character-add-mini" onClick={addCharacter} title="Nova ficha"><Plus size={17}/></button></div>
      <div className="character-list">{characters.map(c => <button key={c.id} className={`character-list-item ${c.id === active.id ? 'active' : ''}`} onClick={() => { setActiveId(c.id); setTab('overview'); setSpellId(null) }}><span className="character-avatar-small">{c.portrait ? <img src={c.portrait} alt=""/> : <UserRound size={17}/>}</span><span><strong>{c.name || 'Sem nome'}</strong><small>{[c.species,c.className,c.level ? `Nv. ${c.level}` : ''].filter(Boolean).join(' · ') || 'Ficha em branco'}</small></span></button>)}</div>
      <div className="character-side-foot"><span className="live-dot"/>{saveLabel}</div>
    </aside>
    <main className="character-main">
      <div className="character-topline"><div><span className="eyebrow">CENTRAL DE MESTRAGEM / PERSONAGENS</span><h1>Ficha de personagem</h1></div><button className="character-secondary" disabled={shareBusy} onClick={async()=>{try{setShareBusy(true);const c=await getCampaignFeatureContext();if(!c.isGM)throw new Error("Somente o mestre pode compartilhar fichas.");await createCampaignCharacter(c.campaign.id,active.name||"Personagem sem nome",active);window.alert("Cópia da ficha enviada à campanha. Agora abra Campanha / Itens para gerar o link de convite.")}catch(e){window.alert(e.message)}finally{setShareBusy(false)}}}>{shareBusy?"Enviando…":"Compartilhar na campanha"}</button> <button className="character-delete" onClick={deleteCharacter}><Trash2 size={14}/> Excluir ficha</button></div>
      <div className="character-hero">
        <label className="character-portrait" title="Alterar retrato">{active.portrait ? <img src={active.portrait} alt="Retrato de personagem"/> : <span><UserRound size={35}/><small>Adicionar retrato</small></span>}<input type="file" accept="image/*" onChange={e => uploadPortrait(e.target.files?.[0])}/><i><Upload size={13}/></i></label>
        <div className="character-identity"><input className="character-name" value={active.name} onChange={e=>patch({name:e.target.value})} aria-label="Nome do personagem" placeholder="Nome do personagem"/><div className="character-subline"><input value={active.species} onChange={e=>patch({species:e.target.value})} placeholder="Espécie"/><span>·</span><input value={active.className} onChange={e=>patch({className:e.target.value})} placeholder="Classe"/><span>·</span><label>Nível <input type="number" min="1" max="20" value={active.level} onChange={e=>patch({level:Math.max(1,Math.min(20,Number(e.target.value)))})}/></label></div><div className="character-subline"><input value={active.subclass} onChange={e=>patch({subclass:e.target.value})} placeholder="Subclasse"/><span>·</span><input value={active.background} onChange={e=>patch({background:e.target.value})} placeholder="Antecedente"/></div></div>
      </div>
      <div className="character-vitals">
        <label className="vital-card"><span><Heart size={15}/> Pontos de vida</span><div><input type="number" value={active.hp} onChange={e=>patch({hp:Number(e.target.value)})}/><b>/</b><input aria-label="PV máximos" type="number" value={active.maxHp} onChange={e=>patch({maxHp:Number(e.target.value)})}/></div><small>Temporários <input type="number" value={active.tempHp} onChange={e=>patch({tempHp:Number(e.target.value)})}/></small></label>
        <label className="vital-card"><span><Shield size={15}/> Classe de armadura</span><input className="vital-big" type="number" value={active.ac} onChange={e=>patch({ac:Number(e.target.value)})}/></label>
        <label className="vital-card"><span><Dices size={15}/> Iniciativa</span><input className="vital-big" type="number" value={active.initiative} onChange={e=>patch({initiative:Number(e.target.value)})}/></label>
        <label className="vital-card"><span><Footprints size={15}/> Deslocamento</span><input className="vital-text" value={active.speed} onChange={e=>patch({speed:e.target.value})}/></label>
      </div>
      <div className="character-ability-strip">{ABILITY_LABELS.map(([key,label])=><label className="ability-card" key={key}><span>{label}</span><input className="ability-score-input" aria-label={`${label}: pontuação`} type="number" min="1" max="30" step="1" value={active.abilities?.[key] ?? 10} onChange={e=>patchAbility(key,e.target.value === '' ? 0 : e.target.value)} title={`Editar ${label}`}/><small>{fmt(modifier(active.abilities?.[key]))}</small></label>)}<div className="ability-card proficiency"><span>Bônus de prof.</span><strong>{fmt(Number(active.proficiency || 2))}</strong><small>Salvamentos / perícias</small></div></div>
      <nav className="character-tabs">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setSpellId(null)}}><Icon size={16}/>{label}</button>)}</nav>
      <div className="character-content">
        {tab==='overview' && <><div className="character-section-title"><div><h2>Resumo do aventureiro</h2><p>Informações essenciais para consultar durante a sessão.</p></div></div><div className="character-overview-grid"><article className="character-panel"><h3>Dados gerais</h3><div className="character-data-grid"><label>Jogador<input value={active.player} onChange={e=>patch({player:e.target.value})} placeholder="Nome do jogador"/></label><label>Alinhamento<input value={active.alignment} onChange={e=>patch({alignment:e.target.value})} placeholder="Ex.: Neutro e bom"/></label><label>Dados de vida<input value={active.hitDice} onChange={e=>patch({hitDice:e.target.value})} placeholder="Ex.: 5d10"/></label><label>Deslocamento<input value={active.speed} onChange={e=>patch({speed:e.target.value})}/></label></div></article><article className="character-panel"><h3>Testes de resistência</h3><div className="save-check-list">{ABILITY_LABELS.map(([key,label])=><label key={key}><input type="checkbox" checked={(active.saves||[]).includes(key)} onChange={e=>patch({saves:e.target.checked?[...(active.saves||[]),key]:(active.saves||[]).filter(x=>x!==key)})}/><span>{label}</span><b>{fmt(modifier(active.abilities?.[key]) + ((active.saves||[]).includes(key)?Number(active.proficiency||2):0))}</b></label>)}</div></article></div><article className="character-panel character-notes-panel"><h3>Características e anotações</h3><textarea value={active.features} onChange={e=>patch({features:e.target.value})} placeholder="Características raciais, talentos, habilidades de classe e outras informações importantes…"/></article></>}
        {tab==='combat' && <><div className="character-section-title"><div><h2>Combate</h2><p>Armas, ataques, recursos e condições do personagem.</p></div></div><div className="character-overview-grid"><article className="character-panel"><h3>Recursos</h3><div className="character-data-grid"><label>Bônus de proficiência<input type="number" value={active.proficiency} onChange={e=>patch({proficiency:Number(e.target.value)})}/></label><label>Dados de vida<input value={active.hitDice} onChange={e=>patch({hitDice:e.target.value})}/></label><label>Exaustão<input type="number" min="0" max="6" value={active.exhaustion} onChange={e=>patch({exhaustion:Number(e.target.value)})}/></label></div></article><article className="character-panel"><h3>Condições ativas</h3><input className="character-wide-input" value={active.conditions||''} onChange={e=>patch({conditions:e.target.value})} placeholder="Ex.: Caído, Envenenado, Amedrontado…"/></article></div><article className="character-panel"><h3>Ataques e armas</h3><div className="character-add-row"><input value={attackDraft.name} onChange={e=>setAttackDraft(d=>({...d,name:e.target.value}))} placeholder="Arma ou ataque"/><input value={attackDraft.bonus} onChange={e=>setAttackDraft(d=>({...d,bonus:e.target.value}))} placeholder="Bônus (ex. +6)"/><input value={attackDraft.damage} onChange={e=>setAttackDraft(d=>({...d,damage:e.target.value}))} placeholder="Dano (ex. 1d8+3)"/><input value={attackDraft.type} onChange={e=>setAttackDraft(d=>({...d,type:e.target.value}))} placeholder="Tipo de dano"/><button className="character-primary" onClick={addAttack}><Plus size={15}/> Adicionar</button></div><div className="character-item-list">{(active.attacks||[]).map(a=><div className="character-item-row" key={a.id}><input value={a.name} onChange={e=>updateListItem('attacks',a.id,{name:e.target.value})}/><span>{a.bonus}</span><span>{a.damage}</span><span>{a.type}</span><button onClick={()=>removeListItem('attacks',a.id)}><Trash2 size={14}/></button></div>)}</div></article></>}
        {tab==='spells' && <>{currentSpell ? <article className="character-panel spell-detail"><button className="character-back" onClick={()=>setSpellId(null)}><ArrowLeft size={15}/> Voltar às magias</button><div className="spell-detail-heading"><div><span className="eyebrow">{currentSpell.level} {currentSpell.school ? `· ${currentSpell.school}` : ''}</span><h2>{currentSpell.name}</h2></div><button className="character-delete" onClick={()=>removeListItem('spells',currentSpell.id)}><Trash2 size={14}/> Excluir</button></div><div className="spell-meta-grid">{[['Tempo de conjuração',currentSpell.casting],['Alcance',currentSpell.range],['Componentes',currentSpell.components],['Duração',currentSpell.duration]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value||'—'}</strong></div>)}</div><h3>Descrição</h3><p className="spell-description">{currentSpell.description||'Nenhuma descrição cadastrada.'}</p><button className="character-secondary" onClick={()=>setSpellId(null)}>Voltar à lista</button></article> : <><div className="character-section-title"><div><h2>Magias</h2><p>Toque no nome de uma magia para abrir sua descrição.</p></div><span className="character-count">{(active.spells||[]).length} magias</span></div><div className="character-spell-layout"><article className="character-panel"><h3>Adicionar magia</h3><div className="character-spell-form"><input value={spellDraft.name} onChange={e=>setSpellDraft(d=>({...d,name:e.target.value}))} placeholder="Nome da magia"/><div className="character-form-pair"><select value={spellDraft.level} onChange={e=>setSpellDraft(d=>({...d,level:e.target.value}))}>{['Truque','1º círculo','2º círculo','3º círculo','4º círculo','5º círculo','6º círculo','7º círculo','8º círculo','9º círculo'].map(x=><option key={x}>{x}</option>)}</select><input value={spellDraft.school} onChange={e=>setSpellDraft(d=>({...d,school:e.target.value}))} placeholder="Escola"/></div><div className="character-form-pair"><input value={spellDraft.casting} onChange={e=>setSpellDraft(d=>({...d,casting:e.target.value}))} placeholder="Tempo de conjuração"/><input value={spellDraft.range} onChange={e=>setSpellDraft(d=>({...d,range:e.target.value}))} placeholder="Alcance"/></div><div className="character-form-pair"><input value={spellDraft.components} onChange={e=>setSpellDraft(d=>({...d,components:e.target.value}))} placeholder="Componentes"/><input value={spellDraft.duration} onChange={e=>setSpellDraft(d=>({...d,duration:e.target.value}))} placeholder="Duração"/></div><textarea value={spellDraft.description} onChange={e=>setSpellDraft(d=>({...d,description:e.target.value}))} placeholder="Descrição completa da magia…"/><button className="character-primary" onClick={addSpell}><Plus size={15}/> Adicionar à ficha</button></div></article><article className="character-panel"><h3>Lista de magias</h3>{(active.spells||[]).length===0?<div className="character-empty-inline">Nenhuma magia cadastrada ainda.</div>:<div className="character-spell-list">{(active.spells||[]).map(s=><div className="character-spell-row" key={s.id}><button className="spell-name-button" onClick={()=>setSpellId(s.id)}><strong>{s.name}</strong><small>{s.level}{s.school?` · ${s.school}`:''}</small></button><label><input type="checkbox" checked={!!s.prepared} onChange={e=>updateListItem('spells',s.id,{prepared:e.target.checked})}/> Preparada</label><button className="spell-remove" onClick={()=>removeListItem('spells',s.id)} title="Excluir magia"><Trash2 size={14}/></button></div>)}</div>}</article></div></>}</>}
        {tab==='skills' && <><div className="character-section-title"><div><h2>Perícias e proficiências</h2><p>Marque as perícias em que o personagem é proficiente.</p></div></div><article className="character-panel"><h3>Perícias</h3><div className="character-skills-grid">{SKILL_LABELS.map((name,i)=>{const ability=['des','int','for','car','des','des','int','car','sab','int','sab','sab','int','sab','car','des','int','sab'][i];const trained=(active.skills||[]).includes(name);return <label key={name}><input type="checkbox" checked={trained} onChange={e=>patch({skills:e.target.checked?[...(active.skills||[]),name]:(active.skills||[]).filter(x=>x!==name)})}/><span>{name}<small>{ABILITY_LABELS.find(x=>x[0]===ability)?.[1]}</small></span><b>{fmt(modifier(active.abilities?.[ability])+ (trained?Number(active.proficiency||2):0))}</b></label>})}</div></article></>}
        {tab==='inventory' && <><div className="character-section-title"><div><h2>Inventário</h2><p>Equipamentos, objetos carregados e moedas.</p></div></div><article className="character-panel"><h3>Moedas</h3><div className="character-currency-grid">{['po','pp','pe','pc'].map((coin,i)=><label key={coin}>{['Ouro','Prata','Electro','Cobre'][i]}<input type="number" min="0" value={active.currency?.[coin]||0} onChange={e=>patch({currency:{...active.currency,[coin]:Number(e.target.value)}})}/></label>)}</div></article><article className="character-panel"><h3>Itens e equipamentos</h3><div className="character-add-row"><input id="new-item-name" placeholder="Nome do item"/><input id="new-item-qty" type="number" min="1" defaultValue="1" placeholder="Qtd."/><input id="new-item-detail" placeholder="Descrição / peso"/><button className="character-primary" onClick={()=>{const name=document.getElementById('new-item-name')?.value?.trim();if(!name)return;const qty=document.getElementById('new-item-qty')?.value||1;const detail=document.getElementById('new-item-detail')?.value||'';patch({inventory:[...(active.inventory||[]),{id:makeId(),name,qty,detail}]});document.getElementById('new-item-name').value='';document.getElementById('new-item-detail').value=''}}> <Plus size={15}/> Adicionar</button></div><div className="character-item-list">{(active.inventory||[]).map(item=><div className="character-item-row" key={item.id}><input value={item.name} onChange={e=>updateListItem('inventory',item.id,{name:e.target.value})}/><span>Qtd. {item.qty}</span><input value={item.detail||''} onChange={e=>updateListItem('inventory',item.id,{detail:e.target.value})}/><button onClick={()=>removeListItem('inventory',item.id)}><Trash2 size={14}/></button></div>)}</div></article></>}
        {tab==='identity' && <><div className="character-section-title"><div><h2>História e identidade</h2><p>Personalidade, vínculos e informações narrativas.</p></div></div><article className="character-panel"><div className="character-data-grid"><label>Jogador<input value={active.player} onChange={e=>patch({player:e.target.value})}/></label><label>Antecedente<input value={active.background} onChange={e=>patch({background:e.target.value})}/></label><label>Alinhamento<input value={active.alignment} onChange={e=>patch({alignment:e.target.value})}/></label></div>{[['personality','Traços de personalidade'],['ideals','Ideais'],['bonds','Vínculos'],['flaws','Defeitos'],['notes','História e anotações']].map(([key,label])=><label className="character-long-field" key={key}>{label}<textarea value={active[key]||''} onChange={e=>patch({[key]:e.target.value})} placeholder={`${label} do personagem…`}/></label>)}</article></>}
      </div>
    </main>
  </section>
}


function CloudAccount() {
  const [session, setSession] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState(getActiveCampaign() || '')
  const [campaignName, setCampaignName] = useState('')
  const [invite, setInvite] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  const refresh = async () => { if (!session) return; try { const rows = await listCampaigns(); setCampaigns(rows) } catch (e) { setMessage(e.message) } }
  useEffect(() => { refresh() }, [session?.user?.id])
  useEffect(() => { if (!supabase || !session || !campaignId) return; const channel = supabase.channel(`campaign-${campaignId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_documents', filter: `campaign_id=eq.${campaignId}` }, payload => { const row = payload.new; if (row?.document_key && row.updated_by !== session.user.id) saveScene(row.document_key, row.content).catch(() => {}) }).subscribe(); return () => { supabase.removeChannel(channel) } }, [session?.user?.id, campaignId])
  const run = async fn => { setBusy(true); setMessage(''); try { await fn() } catch (e) { setMessage(e.message || 'Não foi possível concluir a operação.') } finally { setBusy(false) } }
  const usernameRequest = async (action, extra={}) => {
    const response = await fetch('/.netlify/functions/username-auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action, username, ...extra }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.')
    return result
  }
  const acceptSession = async result => {
    if (!result.access_token || !result.refresh_token) throw new Error('A autenticação não retornou uma sessão válida.')
    const { error } = await supabase.auth.setSession({ access_token:result.access_token, refresh_token:result.refresh_token })
    if (error) throw error
  }
  const activate = async id => run(async () => {
    const docs = await fetchCampaignDocuments(id)
    const backup = {}; for (const key of [DRAFT_KEY,PUBLISHED_KEY,SHIELD_KEY,CHARACTER_KEY]) backup[key] = await loadScene(key)
    await saveSceneLocalOnly(`backup-before-campaign-${Date.now()}`, { createdAt: new Date().toISOString(), documents: backup })
    for (const doc of docs) await saveScene(doc.document_key, doc.content)
    setActiveCampaign(id); setCampaignId(id); await flushQueue(); setMessage('Campanha carregada. Dados locais e nuvem conectados.')
  })
  if (!cloudConfigured) return <div className="cloud-entry"><button className="btn cloud-account-button" onClick={() => setOpen(!open)} aria-label="Conta e nuvem"><Cloud size={18}/><span>Nuvem</span></button>{open && <div className="cloud-popover"><strong>Conectar salvamento online</strong><p>Configure as variáveis do Supabase no Netlify e publique novamente.</p><small>O modo local continua funcionando normalmente.</small></div>}</div>
  const displayName = session?.user?.user_metadata?.username || 'Conta conectada'
  return <div className="cloud-entry"><button className="btn cloud-account-button" onClick={() => setOpen(!open)} aria-label="Conta e nuvem"><Cloud size={18}/><span>{session ? displayName : 'Conta / Nuvem'}</span></button>{open && <div className="cloud-popover">
    {!session ? <>
      {mode === 'login' && <><strong>Entrar na Central</strong><input autoComplete="username" placeholder="Nome de usuário" value={username} onChange={e=>setUsername(e.target.value)}/><input autoComplete="current-password" type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)}/><button className="btn btn-gold" disabled={busy||!username.trim()||!password} onClick={()=>run(async()=>{const result=await usernameRequest('login',{password});await acceptSession(result);setMessage('Login realizado.')})}>Entrar</button><button className="btn btn-quiet" onClick={()=>{setMode('register');setMessage('')}}>Criar conta</button><button className="text-link-button" onClick={()=>{setMode('recover');setMessage('')}}>Esqueci minha senha</button></>}
      {mode === 'register' && <><strong>Criar conta</strong><input autoComplete="username" placeholder="Nome de usuário único" value={username} onChange={e=>setUsername(e.target.value)}/><small>Use de 3 a 20 caracteres: letras, números e _ (sublinhado).</small><input autoComplete="new-password" type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={e=>setPassword(e.target.value)}/><input autoComplete="new-password" type="password" placeholder="Confirmar senha" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/><button className="btn btn-gold" disabled={busy||!username.trim()||password.length<8||password!==confirmPassword} onClick={()=>run(async()=>{const result=await usernameRequest('register',{password});setRecoveryCode(result.recoveryCode);await acceptSession(result);setMessage('Conta criada. Guarde o código de recuperação exibido abaixo.')})}>Criar conta</button><button className="btn btn-quiet" onClick={()=>{setMode('login');setMessage('')}}>Voltar ao login</button></>}
      {mode === 'recover' && <><strong>Recuperar acesso</strong><p>Informe seu nome de usuário e o código de recuperação que recebeu ao criar a conta.</p><input autoComplete="username" placeholder="Nome de usuário" value={username} onChange={e=>setUsername(e.target.value)}/><input placeholder="Código de recuperação" value={recoveryInput} onChange={e=>setRecoveryInput(e.target.value)}/><input autoComplete="new-password" type="password" placeholder="Nova senha (mín. 8 caracteres)" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button className="btn btn-gold" disabled={busy||!username.trim()||!recoveryInput.trim()||newPassword.length<8} onClick={()=>run(async()=>{const result=await usernameRequest('recover',{recoveryCode:recoveryInput,newPassword});setRecoveryCode(result.recoveryCode);await acceptSession(result);setRecoveryInput('');setNewPassword('');setMessage('Senha alterada. Guarde seu novo código de recuperação.')})}>Redefinir senha</button><button className="btn btn-quiet" onClick={()=>{setMode('login');setMessage('')}}>Voltar ao login</button></>}
      {recoveryCode && <div className="recovery-code-box"><strong>Seu código de recuperação</strong><code>{recoveryCode}</code><small>Guarde em local seguro. Ele só será exibido agora e será substituído sempre que usado.</small><button className="btn btn-quiet" onClick={()=>{navigator.clipboard?.writeText(recoveryCode);setMessage('Código copiado, se o navegador permitiu.')}}>Copiar código</button><button className="text-link-button" onClick={()=>setRecoveryCode('')}>Já guardei</button></div>}
    </> : <><strong>Olá, {displayName}</strong><strong>Campanhas compartilhadas</strong><select value={campaignId} onChange={e=>activate(e.target.value)}><option value="">Selecione uma campanha</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}</select><input value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="Nome da nova campanha"/><button className="btn btn-gold" disabled={busy||!campaignName.trim()} onClick={()=>run(async()=>{const id=await createCampaign(campaignName.trim());setCampaignName('');setActiveCampaign(id);setCampaignId(id);for (const key of [DRAFT_KEY,PUBLISHED_KEY,SHIELD_KEY,CHARACTER_KEY]) { const value=await loadScene(key); if (value !== undefined) await syncDocument(key,value) };await refresh();setMessage('Campanha criada e dados locais importados para a nuvem.')})}>Criar campanha</button><input value={invite} onChange={e=>setInvite(e.target.value)} placeholder="Código de convite"/><button className="btn btn-quiet" disabled={busy||!invite.trim()} onClick={()=>run(async()=>{const id=await joinCampaign(invite);setInvite('');await refresh();await activate(id)})}>Entrar por convite</button><button className="btn btn-quiet" onClick={()=>run(async()=>{await supabase.auth.signOut();setActiveCampaign(null);setCampaignId('');setCampaigns([]);setRecoveryCode('')})}>Sair da conta</button></>}
    {message && <small className="cloud-message">{message}</small>}<small>Modo offline: alterações ficam no navegador e aguardam conexão para sincronizar. Selecione uma campanha para compartilhar seus documentos.</small>
  </div>}</div>
}


export default function App() {
  const isProjection = new URLSearchParams(window.location.search).get('projection') === '1'
  if (isProjection) return <Projection />

  const [scene, setScene] = useState(initialScene)
  const [selected, setSelected] = useState(null)
  const [tool, setTool] = useState('select')
  const [frozen, setFrozen] = useState(false)
  const [transition, setTransition] = useState('fade')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toolView, setToolView] = useState('map')
  const [status, setStatus] = useState('Edições ainda não publicadas')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const panDragRef = useRef(null)
  const channelRef = useChannel()

  useEffect(() => { const online = () => flushQueue(); window.addEventListener('online', online); return () => window.removeEventListener('online', online) }, [])

  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return
    channel.onmessage = (event) => {
      if (event.data?.type === 'projection-edit' && event.data.scene) {
        setScene(event.data.scene)
        setStatus('Peças atualizadas pela projeção')
      }
    }
    return () => { channel.onmessage = null }
  }, [channelRef])

  useEffect(() => {
    loadScene(DRAFT_KEY).then(async saved => {
      if (saved) {
        setScene(saved)
        return
      }
      // Migra automaticamente um rascunho antigo que tenha sido salvo em localStorage.
      try {
        const legacy = localStorage.getItem('central-mestragem-dnd-draft-v1')
        if (legacy) {
          const parsed = JSON.parse(legacy)
          setScene(parsed)
          await saveScene(DRAFT_KEY, parsed)
        }
      } catch { /* ignora dados antigos inválidos */ }
    }).catch(() => {
      setStatus('Não foi possível acessar o armazenamento local do navegador.')
    }).finally(() => setDraftLoaded(true))
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    saveScene(DRAFT_KEY, scene).catch(() => {
      setStatus('Falha ao salvar o rascunho. Verifique o espaço disponível no navegador.')
    })
  }, [scene, draftLoaded])

  useEffect(() => {
    if (!draftLoaded || frozen) return
    saveScene(PUBLISHED_KEY, scene).then(() => {
      channelRef.current?.postMessage({ type: 'publish', transition })
    }).catch(() => setStatus('Falha ao atualizar a projeção. Verifique o espaço disponível no navegador.'))
  }, [scene, frozen, draftLoaded, transition])

  const updateScene = useCallback((patch) => {
    setScene(current => ({ ...current, ...patch }))
    setStatus('Edições ainda não publicadas')
  }, [])

  const addToken = (kind = 'hero') => {
    const defaults = {
      hero: { symbol: '⚔️', label: 'Herói', kind: 'hero' },
      enemy: { symbol: '💀', label: 'Inimigo', kind: 'enemy' },
      npc: { symbol: '🧙', label: 'NPC', kind: 'npc' }
    }
    const item = defaults[kind]
    const token = { id: crypto.randomUUID(), ...item, x: 50, y: 50, size: 48 }
    updateScene({ tokens: [...scene.tokens, token] })
    setSelected(token.id)
    setTool('select')
  }

  const updateSelectedToken = (patch) => {
    updateScene({ tokens: scene.tokens.map(t => t.id === selected ? { ...t, ...patch } : t) })
  }

  const resizeSelected = (size) => updateSelectedToken({ size: Number(size) })

  const removeSelected = () => {
    updateScene({ tokens: scene.tokens.filter(t => t.id !== selected) })
    setSelected(null)
  }

  const handleMapUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatus('Escolha um arquivo de imagem válido.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => updateScene({ mapUrl: reader.result, mapName: file.name, fog: [] })
    reader.readAsDataURL(file)
    event.target.value = ''
  }


  const setFreeze = (value) => {
    setFrozen(value)
    channelRef.current?.postMessage({ type: 'freeze', value })
    setStatus(value ? 'Projeção congelada' : 'Projeção descongelada')
  }

  const toggleBlackout = () => {
    const value = !window.__blackout
    window.__blackout = value
    channelRef.current?.postMessage({ type: 'blackout', value })
  }

  const openProjection = () => {
    const win = window.open(`${window.location.pathname}?projection=1`, 'dnd-projection', 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=no')
    if (!win) setStatus('O navegador bloqueou a janela. Permita pop-ups para este site.')
  }

  const changeZoom = (amount) => updateScene({ zoom: Math.max(0.1, Math.min(5, +((scene.zoom || 1) + amount).toFixed(2))) })

  const stagePointerDown = (event, token) => {
    if (token && tool === 'select') {
      event.preventDefault(); event.stopPropagation()
      setSelected(token.id)
      dragRef.current = { id: token.id }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    if (tool === 'pan' || (tool === 'select' && !token)) {
      event.preventDefault()
      panDragRef.current = { x: event.clientX, y: event.clientY, panX: scene.panX || 0, panY: scene.panY || 0 }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }

  const stagePointerMove = (event) => {
    if (panDragRef.current) {
      updateScene({ panX: panDragRef.current.panX + event.clientX - panDragRef.current.x, panY: panDragRef.current.panY + event.clientY - panDragRef.current.y })
      return
    }
    if (!dragRef.current || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const zoom = scene.zoom || 1
    const px = scene.panX || 0, py = scene.panY || 0
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left - rect.width * (1 - zoom) / 2 - px) / (rect.width * zoom)) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top - rect.height * (1 - zoom) / 2 - py) / (rect.height * zoom)) * 100))
    setScene(current => ({ ...current, tokens: current.tokens.map(t => t.id === dragRef.current.id ? { ...t, x, y } : t) }))
  }

  const stagePointerUp = () => { dragRef.current = null; panDragRef.current = null }

  const addFogSpot = (event) => {
    if (tool !== 'fog' || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const zoom = scene.zoom || 1
    const px = scene.panX || 0, py = scene.panY || 0
    const x = ((event.clientX - rect.left - rect.width * (1 - zoom) / 2 - px) / (rect.width * zoom)) * 100
    const y = ((event.clientY - rect.top - rect.height * (1 - zoom) / 2 - py) / (rect.height * zoom)) * 100
    updateScene({ fog: [...scene.fog, { x, y, size: 18 }] })
  }

  const clearFog = () => updateScene({ fog: [] })

  if (isProjection) return <Projection />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="header-identity">
          <CloudAccount />
          <div className="brand"><div className="brand-mark"><Swords size={20}/></div><div><strong>Central de Mestragem</strong><small>PAINEL DO MESTRE</small></div></div>
        </div>
        <div className="top-actions">
          {toolView === 'map' && <>
            <span className="save-status"><Save size={14}/>{status}</span>
            <button className="btn btn-quiet" onClick={() => setFreeze(!frozen)}>{frozen ? <Unlock size={16}/> : <Lock size={16}/>} {frozen ? 'Descongelar' : 'Congelar'}</button>
            <button className="btn btn-gold" onClick={openProjection}><Monitor size={16}/> Abrir projeção</button>
          </>}
        </div>
      </header>

      {toolView === 'campaign' ? <CampaignHub /> : toolView === 'map' ? <div className="workspace">
        {sidebarOpen && <aside className="sidebar">
          <div className="side-heading"><span>FERRAMENTAS</span><button className="icon-btn" onClick={() => setSidebarOpen(false)} title="Recolher painel"><PanelLeftClose size={16}/></button></div>
          <label className="upload-card">
            <Upload size={20}/><strong>Importar mapa</strong><small>PNG, JPG ou WEBP</small>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleMapUpload}/>
          </label>
          <div className="side-section">
            <div className="section-title">PEÇAS</div>
            <button className="tool-row" onClick={() => addToken('hero')}><span className="tool-emoji">⚔️</span><span>Adicionar personagem</span><Plus size={15}/></button>
            <button className="tool-row" onClick={() => addToken('enemy')}><span className="tool-emoji">💀</span><span>Adicionar inimigo</span><Plus size={15}/></button>
            <button className="tool-row" onClick={() => addToken('npc')}><span className="tool-emoji">🧙</span><span>Adicionar NPC</span><Plus size={15}/></button>
            <button className="tool-row danger-row" disabled={!selected} onClick={removeSelected}><Trash2 size={16}/><span>Remover selecionado</span></button>
            {selected && scene.tokens.some(t => t.id === selected) && <div className="token-size-control token-edit-control">
              <div className="section-title">EDITAR PEÇA SELECIONADA</div>
              <label className="field-label" htmlFor="selected-token-name">Nome da peça</label>
              <input
                id="selected-token-name"
                className="token-name-input"
                type="text"
                maxLength={32}
                value={scene.tokens.find(t => t.id === selected)?.label || ''}
                placeholder="Ex.: Tharion, Dragão Vermelho..."
                onChange={e => updateSelectedToken({ label: e.target.value })}
              />
              <label className="field-label">Símbolo / classe</label>
              <div className="class-icon-grid">
                {CLASS_ICONS.map(option => {
                  const active = scene.tokens.find(t => t.id === selected)?.symbol === option.symbol
                  return <button key={option.name} type="button" className={`class-icon-option ${active ? 'active' : ''}`} title={option.name} aria-label={`Usar símbolo de ${option.name}`} onClick={() => updateSelectedToken({ symbol: option.symbol })}>
                    <span>{option.symbol}</span><small>{option.name}</small>
                  </button>
                })}
              </div>
              <label className="setting-row"><span>Tamanho da miniatura</span><strong>{scene.tokens.find(t => t.id === selected)?.size || 48}px</strong></label>
              <input className="range" type="range" min="10" max="112" step="1" value={scene.tokens.find(t => t.id === selected)?.size || 48} onChange={e => resizeSelected(e.target.value)}/>
            </div>}
          </div>
          <div className="side-section">
            <div className="section-title">FERRAMENTAS DO MAPA</div>
            <button className={`tool-row ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={16}/><span>Selecionar peças</span></button>
            <button className={`tool-row ${tool === 'pan' ? 'active' : ''}`} onClick={() => setTool('pan')}><Hand size={16}/><span>Mover mapa</span></button>
            <button className={`tool-row ${tool === 'fog' ? 'active' : ''}`} onClick={() => setTool('fog')}><EyeOff size={16}/><span>Adicionar névoa</span></button>
            <button className="tool-row" onClick={clearFog}><Eye size={16}/><span>Limpar névoa</span></button>
          </div>
          <div className="side-section">
            <div className="section-title">CONFIGURAÇÕES</div>
            <label className="setting-row"><span><Grid3X3 size={16}/> Grid visível</span><input type="checkbox" checked={scene.grid} onChange={e => updateScene({ grid: e.target.checked })}/></label>
            <label className="setting-row"><span>Tamanho do grid</span><strong>{scene.gridSize}px</strong></label>
            <input className="range" type="range" min="24" max="120" value={scene.gridSize} onChange={e => updateScene({ gridSize: Number(e.target.value) })}/>
            <label className="setting-row"><span>Transição</span>
              <select value={transition} onChange={e => { setTransition(e.target.value); channelRef.current?.postMessage({ type: 'transition', value: e.target.value }) }}>
                <option value="instant">Instantânea</option><option value="fade">Fade suave</option>
              </select>
            </label>
          </div>
          <div className="side-footer"><Shield size={14}/> Seus rascunhos ficam neste navegador.</div>
        </aside>}

        <main className="editor">
          <div className="editor-toolbar">
            {!sidebarOpen && <button className="icon-btn" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={17}/></button>}
            <div className="map-title"><span className="live-dot"/><input value={scene.title} onChange={e => updateScene({ title: e.target.value })} aria-label="Nome da cena"/></div>
            <div className="toolbar-spacer"/>
            <button className="icon-btn" onClick={() => changeZoom(-0.1)} title="Diminuir zoom"><ZoomOut size={17}/></button>
            <span className="zoom-value">{Math.round(scene.zoom * 100)}%</span>
            <button className="icon-btn" onClick={() => changeZoom(0.1)} title="Aumentar zoom"><ZoomIn size={17}/></button>
            <button className="icon-btn" onClick={() => updateScene({ zoom: 1, panX: 0, panY: 0 })} title="Redefinir zoom"><Maximize size={16}/></button>
          </div>

          <div className={`stage-wrap ${tool === 'fog' ? 'fog-cursor' : ''}`}>
            <div
              ref={stageRef}
              className="map-stage"
              onPointerDown={e => stagePointerDown(e, null)}
              onPointerMove={stagePointerMove}
              onPointerUp={stagePointerUp}
              onPointerLeave={stagePointerUp}
              onClick={addFogSpot}
              style={{ backgroundColor: scene.background }}
            >
              <div className="scene-content" style={{ transform: `translate(${scene.panX || 0}px, ${scene.panY || 0}px) scale(${scene.zoom})` }}>
                {scene.mapUrl ? <img className="map-image" src={scene.mapUrl} alt="Mapa importado" draggable="false" /> : (
                  <div className="map-placeholder"><div className="placeholder-emblem"><Swords size={42}/></div><h2>Seu campo de batalha começa aqui</h2><p>Importe uma imagem de mapa para começar a preparar o encontro.</p><label className="btn btn-primary"><Upload size={16}/> Escolher mapa<input type="file" accept="image/*" onChange={handleMapUpload}/></label></div>
                )}
                {scene.grid && <div className="grid-overlay" style={{ backgroundSize: `${scene.gridSize}px ${scene.gridSize}px` }}/>}
                <div className="token-layer">
                  {scene.tokens.map(token => (
                    <div key={token.id} className={`token token-${token.kind} ${selected === token.id ? 'token-selected' : ''}`} style={{ left: `${token.x}%`, top: `${token.y}%`, width: token.size, height: token.size, fontSize: Math.max(7, token.size * 0.48) }} onPointerDown={e => stagePointerDown(e, token)}>
                      <span>{token.symbol}</span>
                      {token.label && token.size >= 22 && <small>{token.label}</small>}
                    </div>
                  ))}
                </div>
                <FogLayer fog={scene.fog}/>
              </div>
            </div>
          </div>

          <footer className="editor-footer">
            <div><span className="footer-indicator"/>{scene.mapName || 'Nenhum mapa importado'} <span className="footer-separator">·</span> {scene.tokens.length} peças</div>
            <div className="footer-hint">{tool === 'fog' ? 'Clique no mapa para adicionar áreas de névoa' : tool === 'pan' ? 'Arraste para movimentar o mapa' : 'Arraste peças; arraste o fundo para mover o mapa'}</div>
            <button className="btn btn-quiet btn-small" onClick={() => { setScene(initialScene); setSelected(null) }}><RotateCcw size={14}/> Novo mapa</button>
          </footer>
        </main>
      </div> : toolView === 'shield' ? <ShieldPanel /> : <CharacterSheet />}
      <nav className="floating-tools" aria-label="Ferramentas principais">
        <button className={toolView === 'shield' ? 'active' : ''} onClick={() => setToolView('shield')}><Shield size={17}/><span>Escudo do Mestre</span></button>
        <button className={toolView === 'map' ? 'active' : ''} onClick={() => setToolView('map')}><Swords size={17}/><span>Mapa Tático</span></button>
        <button className={toolView === 'characters' ? 'active' : ''} onClick={() => setToolView('characters')}><UserRound size={17}/><span>Personagens</span></button>
        <button className={toolView === 'campaign' ? 'active' : ''} onClick={() => setToolView('campaign')}><Backpack size={17}/><span>Campanha / Itens</span></button>
      </nav>
    </div>
  )
}