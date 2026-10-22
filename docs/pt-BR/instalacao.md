# Instalação

**English:** [../en/installation.md](../en/installation.md)

## Requisitos

- TV LG com webOS 5 ou mais novo (testado no webOS 6 / TV Lite 6.5).
- Um computador na mesma rede com Python 3.9+, `ssh`, `scp` e `openssl`.
- Uma conta gratuita de [desenvolvedor LG](https://webostv.developer.lge.com).

## 1. Ative o Developer Mode na TV

1. Instale o **Developer Mode** pela LG Content Store e entre com sua conta de desenvolvedor LG.
2. Ligue **Dev Mode Status** e deixe a TV reiniciar.
3. Abra o Developer Mode de novo e ligue **Key Server**. Anote o **endereço IP** e a **passphrase**.

## 2. Instale

```bash
git clone https://github.com/jholhewres/mytvlg.git
cd mytvlg
python3 tools/deploy.py pair --host <IP_DA_TV>                   # pede a passphrase
python3 tools/deploy.py install --host <IP_DA_TV> --auto-renew   # gera, instala e abre o app
```

Em vez de `--host`, você pode exportar `MYTVLG_TV_HOST=<IP_DA_TV>`.

Para instalar sem linha de comando, gere o pacote (`python3 tools/package.py`) e instale o
`dist/*.ipk` com o [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop).

## Mantenha instalado

A sessão do Developer Mode expira e a TV remove os apps instalados por ele.

- Com `--auto-renew`, o token da sessão fica só no pacote instalado e o próprio app renova a sessão uma vez
  por dia enquanto é usado. O token nunca vai para o repositório nem para `dist/`.
- `python3 tools/deploy.py renew --host <IP_DA_TV>` renova uma vez manualmente (dá para agendar no cron).

## Abra rápido

O webOS não deixa apps sem root abrirem ao ligar a TV nem substituírem o botão Home. Dois atalhos:

- Dentro do MyTVLG, **segure uma tecla numérica** (por exemplo `1`) no controle e associe o MyTVLG a ela.
- Na Home da TV, edite a lista de apps e mova o MyTVLG para a primeira posição.

Com o **Quick Start+** ligado, a TV costuma voltar ao app que estava aberto quando foi desligada.

## Primeiro uso

- Aceite o pedido de conexão que a TV mostra: ele permite listar todos os apps e entradas HDMI.
- Abra **Ajustes** (engrenagem) e cole uma [chave gratuita do TMDB](https://www.themoviedb.org/settings/api)
  para ativar lançamentos, recomendações, busca e onde assistir.

## Desinstalar

```bash
python3 tools/deploy.py uninstall --host <IP_DA_TV>
```
