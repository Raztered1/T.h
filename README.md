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
