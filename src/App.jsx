import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Swords, Upload, Grid3X3, Eye, EyeOff, Plus, Trash2, ZoomIn, ZoomOut,
  Maximize, Monitor, Lock, Unlock, Send, Image as ImageIcon, MousePointer2,
  Hand, RotateCcw, Shield, Users, Skull, Save, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

const CHANNEL_NAME = 'central-mestragem-dnd'
const STORAGE_KEY = 'central-mestragem-dnd-scene-v1'

const initialScene = {
  title: 'Novo encontro',
  mapUrl: '',
  mapName: '',
  grid: true,
  gridSize: 64,
  zoom: 1,
  tokens: [],
  fog: [],
  background: '#171713'
}

function readPublished() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : initialScene
  } catch {
    return initialScene
  }
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
  const [scene, setScene] = useState(readPublished)
  const [frozen, setFrozen] = useState(false)
  const [showBlack, setShowBlack] = useState(false)
  const [transition, setTransition] = useState('fade')
  const [changing, setChanging] = useState(false)
  const channelRef = useChannel()

  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return
    channel.onmessage = (event) => {
      const message = event.data
      if (message?.type === 'freeze') setFrozen(Boolean(message.value))
      if (message?.type === 'blackout') setShowBlack(Boolean(message.value))
      if (message?.type === 'transition') setTransition(message.value)
      if (message?.type === 'publish' && !frozen) {
        if (transition === 'fade') {
          setChanging(true)
          window.setTimeout(() => {
            setScene(message.scene)
            setChanging(false)
          }, 350)
        } else {
          setScene(message.scene)
        }
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

  return (
    <main className={`projection ${changing ? 'projection-changing' : ''}`}>
      {showBlack ? <div className="blackout" /> : (
        <div className="projection-stage">
          {scene.mapUrl ? <img className="projection-map" src={scene.mapUrl} alt="Mapa da sessão" /> : (
            <div className="projection-empty"><Swords size={46}/><span>Aguardando mapa do mestre</span></div>
          )}
          {scene.grid && <div className="projection-grid" style={{ backgroundSize: `${scene.gridSize * scene.zoom}px ${scene.gridSize * scene.zoom}px` }} />}
          <div className="projection-tokens">
            {(scene.tokens || []).map(token => (
              <div key={token.id} className={`token token-${token.kind}`} style={{ left: `${token.x}%`, top: `${token.y}%`, width: token.size, height: token.size }}>
                <span>{token.symbol}</span>
                {token.label && <small>{token.label}</small>}
              </div>
            ))}
          </div>
          <FogLayer fog={scene.fog || []} />
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

export default function App() {
  const isProjection = new URLSearchParams(window.location.search).get('projection') === '1'
  if (isProjection) return <Projection />

  const [scene, setScene] = useState(initialScene)
  const [selected, setSelected] = useState(null)
  const [tool, setTool] = useState('select')
  const [frozen, setFrozen] = useState(false)
  const [transition, setTransition] = useState('fade')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [status, setStatus] = useState('Edições ainda não publicadas')
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const channelRef = useChannel()

  useEffect(() => {
    try {
      const saved = localStorage.getItem('central-mestragem-dnd-draft-v1')
      if (saved) setScene(JSON.parse(saved))
    } catch { /* ignore invalid local draft */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('central-mestragem-dnd-draft-v1', JSON.stringify(scene)) }
    catch { setStatus('Armazenamento local cheio: exporte ou reduza o tamanho da imagem do mapa.') }
  }, [scene])

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

  const publish = () => {
    if (frozen) {
      setStatus('Descongele a projeção antes de publicar uma nova cena.')
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scene))
      channelRef.current?.postMessage({ type: 'publish', scene })
      setStatus('Cena publicada na projeção')
    } catch {
      setStatus('Não foi possível publicar. A imagem pode ser grande demais para o armazenamento local.')
    }
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
    const win = window.open(`${window.location.pathname}?projection=1`, 'dnd-projection')
    if (!win) setStatus('O navegador bloqueou a janela. Permita pop-ups para este site.')
  }

  const changeZoom = (amount) => updateScene({ zoom: Math.max(0.4, Math.min(2.5, +(scene.zoom + amount).toFixed(2))) })

  const stagePointerDown = (event, token) => {
    if (tool !== 'select' || !token) return
    event.preventDefault()
    event.stopPropagation()
    setSelected(token.id)
    dragRef.current = { id: token.id }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const stagePointerMove = (event) => {
    if (!dragRef.current || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    setScene(current => ({ ...current, tokens: current.tokens.map(t => t.id === dragRef.current.id ? { ...t, x, y } : t) }))
  }

  const stagePointerUp = () => { dragRef.current = null }

  const addFogSpot = (event) => {
    if (tool !== 'fog' || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    updateScene({ fog: [...scene.fog, { x, y, size: 18 }] })
  }

  const clearFog = () => updateScene({ fog: [] })

  if (isProjection) return <Projection />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Swords size={20}/></div><div><strong>Central de Mestragem</strong><small>PAINEL DO MESTRE</small></div></div>
        <div className="top-actions">
          <span className="save-status"><Save size={14}/>{status}</span>
          <button className="btn btn-quiet" onClick={() => setFreeze(!frozen)}>{frozen ? <Unlock size={16}/> : <Lock size={16}/>} {frozen ? 'Descongelar' : 'Congelar'}</button>
          <button className="btn btn-primary" onClick={publish}><Send size={16}/> Publicar cena</button>
          <button className="btn btn-gold" onClick={openProjection}><Monitor size={16}/> Abrir projeção</button>
        </div>
      </header>

      <div className="workspace">
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
          </div>
          <div className="side-section">
            <div className="section-title">FERRAMENTAS DO MAPA</div>
            <button className={`tool-row ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={16}/><span>Selecionar / mover</span></button>
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
            <button className="icon-btn" onClick={() => updateScene({ zoom: 1 })} title="Redefinir zoom"><Maximize size={16}/></button>
          </div>

          <div className={`stage-wrap ${tool === 'fog' ? 'fog-cursor' : ''}`}>
            <div
              ref={stageRef}
              className="map-stage"
              onPointerMove={stagePointerMove}
              onPointerUp={stagePointerUp}
              onPointerLeave={stagePointerUp}
              onClick={addFogSpot}
              style={{ backgroundColor: scene.background }}
            >
              {scene.mapUrl ? <img className="map-image" src={scene.mapUrl} alt="Mapa importado" draggable="false" /> : (
                <div className="map-placeholder"><div className="placeholder-emblem"><Swords size={42}/></div><h2>Seu campo de batalha começa aqui</h2><p>Importe uma imagem de mapa para começar a preparar o encontro.</p><label className="btn btn-primary"><Upload size={16}/> Escolher mapa<input type="file" accept="image/*" onChange={handleMapUpload}/></label></div>
              )}
              {scene.grid && <div className="grid-overlay" style={{ backgroundSize: `${scene.gridSize * scene.zoom}px ${scene.gridSize * scene.zoom}px` }}/>}
              <div className="token-layer">
                {scene.tokens.map(token => (
                  <div
                    key={token.id}
                    className={`token token-${token.kind} ${selected === token.id ? 'token-selected' : ''}`}
                    style={{ left: `${token.x}%`, top: `${token.y}%`, width: token.size, height: token.size }}
                    onPointerDown={e => stagePointerDown(e, token)}
                  >
                    <span>{token.symbol}</span>
                    {token.label && <small>{token.label}</small>}
                  </div>
                ))}
              </div>
              <FogLayer fog={scene.fog}/>
            </div>
          </div>

          <footer className="editor-footer">
            <div><span className="footer-indicator"/>{scene.mapName || 'Nenhum mapa importado'} <span className="footer-separator">·</span> {scene.tokens.length} peças</div>
            <div className="footer-hint">{tool === 'fog' ? 'Clique no mapa para adicionar áreas de névoa' : 'Arraste as peças para posicioná-las'}</div>
            <button className="btn btn-quiet btn-small" onClick={() => { setScene(initialScene); setSelected(null) }}><RotateCcw size={14}/> Novo mapa</button>
          </footer>
        </main>
      </div>
    </div>
  )
}