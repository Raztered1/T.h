# Central de Mestragem D&D

Primeira versão funcional (MVP) de um painel de mapas táticos para mestragem.

## O que já está incluído
- Importar mapas PNG, JPG e WEBP.
- Adicionar peças de personagem, inimigo e NPC.
- Arrastar peças pelo mapa e removê-las.
- Zoom real do mapa e de todos os elementos da cena (botões + e -).
- Redimensionamento individual das miniaturas selecionadas.
- Grid configurável e névoa de guerra básica.
- Janela de projeção independente (`?projection=1`).
- Congelar/descongelar a cena publicada.
- Publicar cena manualmente.
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

## Observações desta versão
- A sincronização entre mestre e projeção usa BroadcastChannel e funciona entre abas/janelas do mesmo navegador e mesma origem.
- A cena publicada é mantida no localStorage para que a janela de projeção possa carregá-la ao abrir.
- Imagens grandes podem exceder a capacidade do localStorage. Para uso contínuo, a próxima etapa recomendada é migrar imagens e campanhas para IndexedDB e implementar exportação/importação de projetos.
- A névoa desta versão é um marcador circular simples; a próxima evolução deve incluir desenho de regiões, borracha e revelação por pincel.
- O modo congelar bloqueia a atualização da cena projetada; alterações no rascunho continuam no painel do mestre.
- O botão de tela preta é uma próxima melhoria de interface; nesta base, a mensagem de blackout já está preparada no canal de comunicação.
