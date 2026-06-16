Questionário de Identificação Ideológica — versão website fiel ao Python
======================================================================

Esta pasta contém a conversão estática do ficheiro Python:
questionario_python_fontes_integrado.py

Objetivo desta versão:
- manter a lógica, os dados e o método do ficheiro Python;
- trocar apenas a interface Tkinter por HTML/CSS/JavaScript;
- funcionar no GitHub Pages sem servidor e sem dependências externas.

Ficheiros principais:
- index.html: página inicial, biblioteca de ideologias e comparador;
- questionario.html: janela/página separada do questionário integrado e resultados;
- style.css: estética visual;
- app.js: lógica partilhada, biblioteca, comparador e gráficos;
- quiz.js: questionário, cálculo, resultados e exportações;
- data.js: dados embutidos com 168 ideologias e 320 perguntas.

Para publicar no GitHub Pages:
1. Apaga/substitui os ficheiros antigos do repositório.
2. Coloca estes ficheiros na raiz do repositório.
3. Abre o site com cache forçada, por exemplo:
   https://ze2010ofc.github.io/Question-rio-de-Espectro-Pol-tico/?v=python-fiel

Notas:
- As respostas ficam apenas no navegador do utilizador via localStorage.
- Os links das fontes abrem em nova aba.
- O PDF no website é feito através do botão de imprimir/guardar PDF do navegador.
- O cálculo foi testado contra o script Python com o mesmo conjunto de respostas.
