# Central de Mestragem D&D

Primeira versão funcional (MVP) de um painel de mapas táticos para mestragem.

## O que já está incluído
- Importar mapas PNG, JPG e WEBP.
- Adicionar peças de personagem, inimigo e NPC.
- Arrastar peças pelo mapa e removê-las.
- Zoom real do mapa e de todos os elementos da cena, de 10% até 500%.
- Movimentação do mapa arrastando o fundo ou usando a ferramenta “Mover mapa”, inclusive após aproximar o zoom.
- Redimensionamento individual das miniaturas selecionadas, de 10 a 112 px.
- Grid configurável e névoa de guerra básica.
- Janela de projeção independente (`?projection=1`).
- Congelar/descongelar a projeção: enquanto congelada, o painel pode ser editado sem alterar a imagem projetada; ao descongelar, a versão atual é sincronizada.
- Atualização automática da projeção enquanto ela estiver descongelada.
- Transição instantânea ou fade.
- Rascunho salvo no armazenamento local do navegador.

## Requisitos
- Node.js 20 ou superior (recomendado).
- npm.

## Executar localmente
```bash
npm install
npm run dev
```
Abra o endereço local mostrado pelo Vite. Clique em **Abrir projeção** e arraste a janela para a TV/projetor usando o modo de tela estendida do sistema operacional. Na janela de projeção, use F11 para tela cheia (dependendo do navegador).

## Publicar gratuitamente no Netlify
1. Crie um repositório no GitHub e envie estes arquivos.
2. No Netlify, escolha **Add new site > Import an existing project**.
3. Conecte o GitHub e selecione o repositório.
4. Build command: `npm run build`.
5. Publish directory: `dist`.
6. Publique.

O arquivo `netlify.toml` já contém a configuração de build e o redirecionamento SPA.

## Correções da versão 0.2
- Zoom agora aplica escala visual ao mapa, grid, névoa e miniaturas, também na projeção.
- Miniatura selecionada pode ser redimensionada pelo controle lateral (24 a 112 px).
- Rascunhos e cenas publicadas agora usam IndexedDB, que suporta arquivos maiores do que o limite pequeno do localStorage. A projeção recebe apenas um aviso pelo BroadcastChannel e lê a cena salva no IndexedDB.
- Rascunhos antigos no localStorage são migrados automaticamente quando possível.

## Atualizações da versão 0.3
- Removido o botão de publicação manual: a projeção acompanha as alterações automaticamente quando está descongelada.
- Congelar mantém a imagem projetada parada enquanto o mestre prepara alterações; ao descongelar, a cena atual é enviada.
- Zoom ampliado para 500%, com redução até 10%.
- O mapa pode ser arrastado no painel e diretamente na janela de projeção.
- Miniaturas podem ser reduzidas até 10 px.

## Observações
- A sincronização entre mestre e projeção usa BroadcastChannel e funciona entre abas/janelas do mesmo navegador e mesma origem.
- Rascunhos e cena projetada usam IndexedDB.
- A névoa desta versão é um marcador circular simples; uma próxima evolução pode incluir desenho de regiões, borracha e revelação por pincel.


## Atualizações da versão 0.4

- A projeção é aberta em uma janela separada (popup), redimensionável, para facilitar o envio apenas dessa janela à TV/projetor. O navegador pode solicitar permissão para pop-ups.
- A área da projeção usa a mesma proporção 16:10 do palco de edição, reduzindo diferenças de posicionamento entre as telas.
- É possível arrastar personagens, inimigos e NPCs diretamente na janela de projeção. As posições são sincronizadas com o painel do mestre.
- Também é possível arrastar o fundo na projeção para reposicionar o mapa.
- Enquanto a cena estiver congelada, a projeção bloqueia movimentações para preservar a imagem exibida.


## Versão 0.5

- Cada peça selecionada pode receber um nome personalizado.
- Seletor de símbolos com opções para as classes de D&D (Artífice, Bárbaro, Bardo, Clérigo, Druida, Guerreiro, Monge, Paladino, Patrulheiro, Ladino, Feiticeiro, Bruxo e Mago), além de símbolos para monstro, NPC e personagem genérico.
- Nome e símbolo são salvos junto com a cena e aparecem também na projeção.


## Versão 0.6 — Escudo do Mestre

- Barra flutuante minimalista para alternar entre **Escudo do Mestre** e **Mapa Tático**.
- Escudo com visão geral da sessão, regras rápidas e CDs editáveis (restauração individual ou geral), controle de iniciativa, cadastro de NPCs/personagens, missões, pistas, locais, histórico e anotações.
- Iniciativa ordenada automaticamente; cada participante permite editar iniciativa, PV, condições e observações, além de rolar 1d20.
- Encerrar combate registra automaticamente um resumo no histórico antes de limpar a iniciativa.
- Dados do Escudo salvos automaticamente no IndexedDB do navegador, separados dos dados do mapa tático.
- Layout responsivo em grafite e dourado envelhecido.

**Importante:** os dados permanecem no navegador e dispositivo usados. Limpar os dados do site ou trocar de navegador/dispositivo pode removê-los. A janela de projeção continua exibindo somente o mapa tático, não o Escudo do Mestre.


## Ficha de Personagem (v0.6.1)

A barra flutuante agora inclui o módulo **Personagens**. É possível criar várias fichas independentes, alternar entre elas e editar os dados principais de cada aventureiro. A ficha inclui retrato, identidade, atributos, PV, CA, iniciativa, deslocamento, testes de resistência, ataques, magias, perícias, inventário, moedas e informações narrativas.

As fichas são salvas automaticamente no IndexedDB do navegador, na mesma base local do projeto, usando a chave `character-sheets-v1`. Retratos são armazenados como imagens locais na própria ficha. Para consultar uma magia, clique em seu nome na lista; a visualização de detalhes oferece um botão para voltar à lista.

**Observação:** esta versão parte da v0.6 e não inclui a integração Supabase planejada para a v0.7. O salvamento de fichas é local ao navegador/dispositivo.


## Versão 0.6.2

- Corrigida a edição dos seis atributos na faixa principal da ficha de personagem.
- Cada pontuação agora pode ser alterada diretamente no campo numérico; o modificador é recalculado automaticamente e os valores continuam sendo salvos no IndexedDB.

## Versão 0.7 — Contas, campanhas compartilhadas e sincronização

Esta atualização adiciona integração opcional com Supabase mantendo IndexedDB como armazenamento local e fila offline.

### Configuração do Supabase
1. Crie um projeto em https://supabase.com/.
2. No SQL Editor, execute integralmente `supabase/schema.sql`.
3. Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave publicável/anon; nunca use `service_role` no navegador).
4. Execute `npm install` e `npm run build`.
5. No Netlify, cadastre as mesmas variáveis em Site configuration > Environment variables e publique novamente.
6. Em Authentication > URL Configuration no Supabase, configure a URL pública do site e os redirects permitidos.

### Uso
- Entre ou crie uma conta no botão **Conta / Nuvem**.
- Crie uma campanha: os documentos locais conhecidos (`draft`, `published`, `master-shield` e `character-sheets-v1`) são importados para a campanha recém-criada.
- Para compartilhar, envie o código de convite a outro mestre. Ele deve criar sua própria conta e entrar pelo código.
- Selecione uma campanha para carregar os documentos dela neste navegador. Alterações subsequentes são enviadas ao Supabase.
- Sem conexão, as gravações permanecem no IndexedDB e entram numa fila local; ao voltar a conexão, a fila tenta sincronizar.

### Limitações importantes desta primeira integração
- A sincronização é por documento completo (mapa, escudo ou coleção de fichas), não por campo. Edições simultâneas no mesmo documento podem resultar em política de última gravação prevalecer; mantenha cópias/exportações de segurança durante os testes.
- O modo offline mantém alterações locais, mas a fila é vinculada à campanha ativa no momento em que for enviada. Evite alternar de campanha enquanto houver alterações offline pendentes.
- A sincronização em tempo real atualiza documentos recebidos de outros membros; não há mesclagem automática de edições concorrentes.
- Imagens de mapas e retratos continuam incorporadas aos documentos como Data URLs nesta versão. Para campanhas com mapas muito grandes, recomenda-se migrar imagens para Supabase Storage em uma etapa específica, antes de uso intenso.
- O modo local continua disponível sem configurar as variáveis do Supabase.

### Migração dos dados v0.6.2
Use o mesmo navegador/perfil em que a versão 0.6.2 foi utilizada. Ao criar a primeira campanha, a aplicação lê as chaves locais acima e envia os dados para a campanha. Não limpe os dados do navegador até confirmar a presença das fichas, escudo e mapas na campanha. A janela de projeção continua local ao mesmo navegador e origem.
