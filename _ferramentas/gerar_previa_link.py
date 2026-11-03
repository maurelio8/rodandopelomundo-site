"""
Gera a imagem de prévia do link do site do RPM (a "og:image").

É a figura que aparece quando alguém manda rodandopelomundo.com.br no
WhatsApp, Telegram, Instagram Direct, Facebook, LinkedIn ou iMessage.

Como usar (na pasta do site):
    pip install --user pillow fonttools brotli
    python3 _ferramentas/gerar_previa_link.py

O resultado sai em assets/img/previa-link-v1.jpg (1200 x 630 px).

Regras da arte:
- 1200 x 630 px (proporção 1,91:1), o tamanho que o WhatsApp mostra grande;
- arquivo abaixo de 300 KB, senão o WhatsApp às vezes não mostra a imagem;
- logo, nome e frase dentro do quadrado do meio (x de 285 a 915), porque
  em alguns casos o WhatsApp mostra só uma miniatura quadrada cortada do
  centro;
- nada que "vence" escrito na imagem (ex.: "em breve"), porque quem já
  recebeu o link continua vendo a prévia antiga guardada no celular.

Ao trocar a arte, suba o número da versão em ARQUIVO_SAIDA (v2, v3...) e
no <head> das páginas: o nome novo obriga o WhatsApp a buscar a imagem nova.

A pasta começa com "_" de propósito: o GitHub Pages (Jekyll) não publica
pastas assim, então este script fica no repositório mas não vai para o site.
"""

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import math

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# --------------------------------------------------------------------------
# 1. Caminhos e medidas
# --------------------------------------------------------------------------

# Path(__file__) é o caminho deste script; .parent.parent sobe de
# _ferramentas/ para a raiz do site. Assim o script funciona de qualquer
# pasta em que for chamado.
PASTA_SITE = Path(__file__).resolve().parent.parent
PASTA_FONTES = PASTA_SITE / "assets" / "fonts"
PASTA_TELAS = PASTA_SITE / "assets" / "img" / "telas"
ARQUIVO_SAIDA = PASTA_SITE / "assets" / "img" / "previa-link-v1.jpg"

LARGURA, ALTURA = 1200, 630

# Tudo é desenhado no dobro do tamanho (2400 x 1260) e reduzido no fim.
# É o mesmo truque de "supersampling": as bordas de círculos, letras e
# cantos arredondados ficam lisas em vez de serrilhadas.
ESCALA = 2

# Textos da arte. Só coisas que não vencem com o tempo.
TEXTO_SIGLA = "RPM"
TEXTO_NOME = "Rodando Pelo Mundo"
TEXTO_FRASE = "O app dos seus passeios de moto"
TEXTO_RECURSOS = "Passeios · Manutenção · Segurança · Eventos"

# Prints usados nos dois celulares (os mesmos da seção "Telas" do site)
PRINT_ESQUERDA = PASTA_TELAS / "inicio.webp"
PRINT_DIREITA = PASTA_TELAS / "garagem.webp"

# Paleta copiada do assets/css/style.css (tema escuro, Laranja RPM)
COR_FUNDO = (11, 11, 13)          # --fundo   #0b0b0d
COR_BORDA = (44, 44, 49)          # --borda   #2c2c31
COR_TINTA = (244, 244, 245)       # --tinta   #f4f4f5
COR_T70 = (169, 169, 178)         # --t70     #a9a9b2
COR_ACENTO = (255, 90, 31)        # --cor-escuro #ff5a1f (Laranja RPM)
COR_BUSSOLA_CLARA = (242, 242, 242)   # #F2F2F2 do simbolo.svg
COR_BUSSOLA_AGULHA = (229, 57, 53)    # #E53935 do simbolo.svg


def px(valor):
    """Converte uma medida da arte final (1200 x 630) para a tela grande
    em que desenhamos (multiplica pela ESCALA e arredonda)."""
    return int(round(valor * ESCALA))


# --------------------------------------------------------------------------
# 2. Fontes (as mesmas do site: Saira nos títulos, Barlow nos textos)
# --------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _bytes_da_fonte(arquivo, peso=None, largura=None):
    """Abre uma fonte .woff2 do site e devolve os bytes de uma fonte .ttf
    comum, que o Pillow sabe usar.

    - A Saira é "variável": um arquivo só guarda todos os pesos (wght) e
      larguras (wdth). O instancer "congela" o peso e a largura pedidos,
      como se escolhesse um estilo fixo (ex.: Saira ExtraBold Condensed).
    - flavor = None tira a compressão do woff2.
    - @lru_cache guarda o resultado: se pedirmos a mesma fonte de novo,
      não refaz a conversão (é um dicionário de cache automático)."""
    fonte = TTFont(PASTA_FONTES / arquivo)
    if "fvar" in fonte:  # "fvar" é a tabela que existe só em fonte variável
        eixos = {}
        if peso is not None:
            eixos["wght"] = peso
        if largura is not None:
            eixos["wdth"] = largura
        fonte = instancer.instantiateVariableFont(fonte, eixos)
    fonte.flavor = None
    memoria = BytesIO()
    fonte.save(memoria)
    return memoria.getvalue()


def fonte(arquivo, tamanho, peso=None, largura=None):
    """Devolve a fonte pronta para desenhar, já no tamanho da tela grande.

    Exemplo: fonte("saira-variavel.woff2", 50, peso=700, largura=75)
    é a Saira negrito condensada (75%), como os títulos do site."""
    dados = _bytes_da_fonte(arquivo, peso, largura)
    return ImageFont.truetype(BytesIO(dados), px(tamanho))


# --------------------------------------------------------------------------
# 3. Peças de desenho
# --------------------------------------------------------------------------

def brilho_radial(tamanho, cor, opacidade):
    """Cria uma "mancha de luz" redonda e suave (camada RGBA transparente).

    Image.radial_gradient("L") gera um círculo cinza: preto no centro e
    branco na borda. Invertendo, o centro fica forte e a borda some; isso
    vira o canal de transparência (alpha) da camada colorida."""
    largura, altura = tamanho
    gradiente = Image.radial_gradient("L").resize((largura, altura))
    alpha = gradiente.point(lambda v: int(max(0, 255 - v) * opacidade))
    camada = Image.new("RGBA", (largura, altura), cor + (0,))
    camada.putalpha(alpha)
    return camada


def fundo():
    """Fundo da arte: o preto do app, um brilho laranja bem fraco atrás do
    texto e linhas de "mapa genérico" (curvas de nível inventadas, sem
    nenhum lugar real), como o fundo do modelo Traçado do compartilhar."""
    base = Image.new("RGBA", (px(LARGURA), px(ALTURA)), COR_FUNDO + (255,))

    # Brilho laranja atrás da coluna do meio
    luz = brilho_radial((px(900), px(760)), COR_ACENTO, 0.16)
    base.alpha_composite(luz, (px(150), px(-60)))

    # Curvas de nível: ondas senoidais suaves, quase invisíveis
    linhas = Image.new("RGBA", base.size, (0, 0, 0, 0))
    traco = ImageDraw.Draw(linhas)
    for i in range(9):
        y_base = 40 + i * 70
        pontos = []
        for x in range(-20, LARGURA + 40, 10):
            y = (y_base
                 + 18 * math.sin(x / 140 + i * 0.9)
                 + 10 * math.sin(x / 57 + i * 2.1))
            pontos.append((px(x), px(y)))
        traco.line(pontos, fill=COR_TINTA + (12,), width=px(1.2))
    base.alpha_composite(linhas)

    # Uma "estrada" laranja tracejada cruzando a parte de baixo
    estrada = Image.new("RGBA", base.size, (0, 0, 0, 0))
    traco = ImageDraw.Draw(estrada)
    pontos = []
    for x in range(-40, LARGURA + 60, 6):
        y = 585 - 40 * math.sin((x - 120) / 260) + 14 * math.sin(x / 90)
        pontos.append((x, y))
    # Desenha só trechos alternados da curva para ficar tracejada
    for i in range(0, len(pontos) - 4, 6):
        trecho = [(px(x), px(y)) for x, y in pontos[i:i + 4]]
        traco.line(trecho, fill=COR_ACENTO + (110,), width=px(3))
    base.alpha_composite(estrada)
    return base


def girar_ponto(x, y, cx, cy, graus):
    """Gira o ponto (x, y) em volta de (cx, cy), no sentido horário da tela
    (igual ao rotate() do SVG, em que o eixo y cresce para baixo)."""
    rad = math.radians(graus)
    dx, dy = x - cx, y - cy
    return (cx + dx * math.cos(rad) - dy * math.sin(rad),
            cy + dx * math.sin(rad) + dy * math.cos(rad))


def bussola(tamanho):
    """Desenha o símbolo do app (o mesmo do assets/img/simbolo.svg).

    O SVG usa coordenadas de 0 a 100; aqui cada coordenada é convertida
    para pixels com a função interna p(). A bússola fica num quadrado
    preto de cantos arredondados, com uma borda fina para se destacar do
    fundo quase preto."""
    lado = px(tamanho)
    s = lado / 100  # quantos pixels vale 1 unidade do SVG

    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, lado - 1, lado - 1), radius=24 * s,
                        fill=(0, 0, 0, 255), outline=COR_BORDA + (255,),
                        width=max(1, px(1.5)))

    # No SVG o desenho interno tem translate(15 15) scale(.7)
    def p(x, y):
        return ((15 + 0.7 * x) * s, (15 + 0.7 * y) * s)

    # Aro da bússola
    cx, cy = p(50, 50)
    raio = 47 * 0.7 * s
    d.ellipse((cx - raio, cy - raio, cx + raio, cy + raio),
              outline=COR_BUSSOLA_CLARA, width=round(6 * 0.7 * s))

    # Quatro marcas (N, L, S, O), com pontas arredondadas
    espessura = 4.8 * 0.7 * s
    for (x1, y1), (x2, y2) in [((50, 10), (50, 17)), ((90, 50), (83, 50)),
                               ((50, 90), (50, 83)), ((10, 50), (17, 50))]:
        a, b = p(x1, y1), p(x2, y2)
        d.line((a, b), fill=COR_BUSSOLA_CLARA, width=round(espessura))
        for ponta in (a, b):
            r = espessura / 2
            d.ellipse((ponta[0] - r, ponta[1] - r, ponta[0] + r, ponta[1] + r),
                      fill=COR_BUSSOLA_CLARA)

    # Agulha girada 35 graus: metade vermelha e metade clara
    def agulha(pontos):
        return [p(*girar_ponto(x, y, 50, 50, 35)) for x, y in pontos]

    d.polygon(agulha([(50, 21), (60, 50), (40, 50)]), fill=COR_BUSSOLA_AGULHA)
    d.polygon(agulha([(50, 79), (60, 50), (40, 50)]), fill=COR_BUSSOLA_CLARA)

    # Pino do centro
    r = 3.5 * 0.7 * s
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(11, 11, 11))
    return img


def celular(arquivo_print, largura_tela):
    """Monta um celular com o print dentro: moldura grafite, cantos
    arredondados e a tela recortada no mesmo formato.

    largura_tela é a largura da tela (sem a moldura) na arte final."""
    tela = Image.open(arquivo_print).convert("RGB")
    w = px(largura_tela)
    h = round(w * tela.height / tela.width)  # mantém a proporção do print
    tela = tela.resize((w, h), Image.LANCZOS)

    moldura = round(w * 0.04)       # espessura da borda do aparelho
    raio_externo = round(w * 0.14)  # canto do aparelho
    raio_tela = raio_externo - moldura

    corpo = Image.new("RGBA", (w + 2 * moldura, h + 2 * moldura), (0, 0, 0, 0))
    d = ImageDraw.Draw(corpo)
    d.rounded_rectangle((0, 0, corpo.width - 1, corpo.height - 1),
                        radius=raio_externo, fill=(29, 29, 33, 255),
                        outline=(70, 70, 78, 255), width=max(1, px(1.2)))

    # Máscara: só a área de cantos arredondados do print aparece
    mascara = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, w - 1, h - 1),
                                              radius=raio_tela, fill=255)
    corpo.paste(tela, (moldura, moldura), mascara)
    return corpo


def colar_com_sombra(base, peca, centro, angulo=0.0, opacidade_sombra=0.65):
    """Gira a peça, desenha uma sombra borrada embaixo dela e cola tudo
    na base, com o centro da peça no ponto 'centro' (medidas da arte final).

    - rotate(..., expand=True) aumenta a imagem para a peça girada caber;
    - a sombra é o próprio contorno da peça (canal alpha) pintado de preto,
      borrado com GaussianBlur e um pouco deslocado para baixo."""
    if angulo:
        peca = peca.rotate(angulo, resample=Image.BICUBIC, expand=True)

    folga = px(60)  # espaço em volta para o borrão da sombra não cortar
    sombra = Image.new("RGBA", (peca.width + 2 * folga, peca.height + 2 * folga),
                       (0, 0, 0, 0))
    alpha = peca.getchannel("A").point(lambda v: int(v * opacidade_sombra))
    preto = Image.new("RGBA", peca.size, (0, 0, 0, 255))
    preto.putalpha(alpha)
    sombra.alpha_composite(preto, (folga, folga + px(14)))
    sombra = sombra.filter(ImageFilter.GaussianBlur(px(22)))

    cx, cy = px(centro[0]), px(centro[1])
    _colar_cortando(base, sombra, cx - sombra.width // 2, cy - sombra.height // 2)
    _colar_cortando(base, peca, cx - peca.width // 2, cy - peca.height // 2)


def _colar_cortando(base, peca, x, y):
    """Cola a peça na posição (x, y) mesmo que ela passe da borda da base.

    O alpha_composite do Pillow não aceita posições negativas nem peças
    que saiam da imagem; então recortamos antes só a parte visível."""
    esq, topo = max(0, -x), max(0, -y)
    dir_ = min(peca.width, base.width - x)
    baixo = min(peca.height, base.height - y)
    if dir_ <= esq or baixo <= topo:
        return  # nada da peça aparece na base
    pedaco = peca.crop((esq, topo, dir_, baixo))
    base.alpha_composite(pedaco, (x + esq, y + topo))


def texto_espacado(draw, centro_x, linha_base, texto, fonte_, cor, espaco):
    """Escreve um texto centralizado com espaço extra entre as letras
    (o letter-spacing do CSS, que o Pillow não tem pronto).

    Mede cada letra com getlength(), soma os espaços e desenha letra por
    letra a partir da esquerda. 'espaco' é em em (fração do tamanho da
    fonte), igual ao CSS: 0.14 = .14em."""
    extra = fonte_.size * espaco
    larguras = [fonte_.getlength(letra) for letra in texto]
    total = sum(larguras) + extra * (len(texto) - 1)
    x = centro_x - total / 2
    for letra, larg in zip(texto, larguras):
        draw.text((x, linha_base), letra, font=fonte_, fill=cor, anchor="ls")
        x += larg + extra


# --------------------------------------------------------------------------
# 4. Montagem
# --------------------------------------------------------------------------

def montar():
    """Junta as peças na ordem de baixo para cima: fundo, celulares,
    símbolo e textos. Devolve a imagem já no tamanho final (1200 x 630)."""
    arte = fundo()

    # Celulares nas laterais, inclinados para fora e "saindo" por baixo.
    # Ficam fora do quadrado central, então somem na miniatura quadrada
    # sem levar junto nada importante.
    colar_com_sombra(arte, celular(PRINT_ESQUERDA, 232), centro=(138, 405), angulo=9)
    colar_com_sombra(arte, celular(PRINT_DIREITA, 232), centro=(1062, 405), angulo=-9)

    # Símbolo do app no topo da coluna do meio
    simbolo = bussola(104)
    colar_com_sombra(arte, simbolo, centro=(600, 128), opacidade_sombra=0.5)

    d = ImageDraw.Draw(arte)
    meio = px(LARGURA / 2)

    # "RPM" na Saira itálica extra-negrito condensada (como no site)
    d.text((meio, px(318)), TEXTO_SIGLA, anchor="ms", fill=COR_TINTA,
           font=fonte("saira-variavel-italico.woff2", 150, peso=800, largura=75))

    # Nome por extenso, espaçado como o .extenso do site
    texto_espacado(d, meio, px(370), TEXTO_NOME,
                   fonte("barlow-600.woff2", 34), COR_TINTA, espaco=0.14)

    # Frase em laranja: diz em uma olhada o que é o app
    d.text((meio, px(446)), TEXTO_FRASE, anchor="ms", fill=COR_ACENTO,
           font=fonte("saira-variavel.woff2", 48, peso=750, largura=75))

    # Linha de recursos, mais discreta
    d.text((meio, px(494)), TEXTO_RECURSOS, anchor="ms", fill=COR_T70,
           font=fonte("barlow-500.woff2", 25))

    # Reduz para 1200 x 630: é aqui que as bordas ficam lisas
    return arte.resize((LARGURA, ALTURA), Image.LANCZOS).convert("RGB")


def salvar(imagem):
    """Salva em JPEG, mais leve que PNG para arte com prints e degradês.

    - quality=88: bom equilíbrio entre nitidez e tamanho;
    - subsampling=0: mantém a cor cheia nas bordas (o laranja da frase
      não "borra");
    - optimize/progressive: arquivo menor, carrega aos poucos."""
    imagem.save(ARQUIVO_SAIDA, "JPEG", quality=88, subsampling=0,
                optimize=True, progressive=True)
    kb = ARQUIVO_SAIDA.stat().st_size / 1024
    aviso = "ok" if kb < 300 else "ACIMA de 300 KB: baixe o quality"
    print(f"Imagem salva em {ARQUIVO_SAIDA.relative_to(PASTA_SITE)} "
          f"({imagem.width} x {imagem.height} px, {kb:.0f} KB, {aviso})")


if __name__ == "__main__":
    salvar(montar())
