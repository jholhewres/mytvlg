# Desenvolvimento

**English:** [../en/development.md](../en/development.md)

O app é HTML, CSS e JavaScript puros em `app/`, sem etapa de build e sem dependências.

```
app/
  index.html          estrutura
  css/app.css         estilos
  js/i18n.js          traduções (en, pt, es)
  js/util.js          utilitários e localStorage
  js/catalog.js       apps conhecidos, aparelhos, categorias, feeds
  js/tv.js            chamadas Luna e a API SSAP (controle remoto da LG)
  js/services.js      clima, TMDB, TVMaze, notícias, vídeos Kids, IPTV
  js/nav.js           foco por D-pad
  js/main.js          telas, navegação e ajustes
tools/
  package.py          gera dist/<id>_<versão>_all.ipk (só biblioteca padrão)
  deploy.py           pair, install, launch, uninstall, renew
```

## Alvo

webOS 5+ (Chromium 68+). Escreva JavaScript no estilo ES5 e evite sintaxe e APIs mais novas (optional
chaining, `??`, `Array.prototype.flat`, `gap` em flexbox, `clamp()`, `aspect-ratio`) ou ofereça alternativa.

## Rodar no navegador

```bash
python3 -m http.server 8000 -d app
```

Abra <http://localhost:8000>. Abrir apps, a conexão com a TV e alguns feeds (CORS) só funcionam na TV.

## Gerar e instalar

```bash
python3 tools/package.py                                  # dist/*.ipk
python3 tools/deploy.py install --host <IP_DA_TV>         # gera + instala + abre
python3 tools/deploy.py launch --host <IP_DA_TV>
```

## Depurar na TV

Apps instalados pelo Developer Mode expõem o protocolo do Chrome DevTools na porta 9998:
abra `http://<IP_DA_TV>:9998` no Chrome para inspecionar a página, ler o console ou tirar screenshots.

## Releases

1. Aumente `version` em `app/appinfo.json` e atualize o `CHANGELOG.md`.
2. Envie uma tag `vX.Y.Z`. A CI gera o `.ipk` e anexa ao release do GitHub.

## Contribuindo

Leia o [CONTRIBUTING.md](../../CONTRIBUTING.md) (em inglês) e o [Código de Conduta](codigo-de-conduta.md).
Issues e pull requests podem ser em português ou inglês.
