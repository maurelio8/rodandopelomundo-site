/* =====================================================================
   RPM · Rodando Pelo Mundo — comportamento do site
   ---------------------------------------------------------------------
   Duas coisas pequenas, sem bibliotecas:
   1. os números do painel "contam" até o valor ao abrir a página,
      como na tela Início do app;
   2. a escolha da cor do app (os botões coloridos), que troca a cor de
      destaque do site inteiro e fica lembrada neste navegador.
   ===================================================================== */

(function () {
  "use strict";

  /* ---------- 1. Números que contam ---------- */

  // A pessoa pediu ao sistema para reduzir animações? Então não anima.
  var semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Formata no padrão brasileiro: 4262.3 -> "4.262,3"
  function formatar(valor, casas) {
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas
    });
  }

  // Cada elemento com data-alvo vai de 0 até o alvo em ~1,2 s,
  // desacelerando no fim (como um ponteiro que se acomoda).
  function contar(elemento) {
    var alvo = parseFloat(elemento.getAttribute("data-alvo"));
    var casas = parseInt(elemento.getAttribute("data-casas") || "0", 10);
    var duracao = 1200;
    var inicio = null;

    function quadro(agora) {
      if (inicio === null) inicio = agora;
      var t = Math.min((agora - inicio) / duracao, 1);
      var suavizado = 1 - Math.pow(1 - t, 3);
      elemento.textContent = formatar(alvo * suavizado, casas);
      if (t < 1) window.requestAnimationFrame(quadro);
    }

    if (semAnimacao) {
      elemento.textContent = formatar(alvo, casas);
    } else {
      window.requestAnimationFrame(quadro);
    }
  }

  document.querySelectorAll("[data-alvo]").forEach(contar);

  /* ---------- 2. Cor do app ---------- */

  var CHAVE = "rpm-cor";
  var nomes = {
    laranja: "Laranja RPM",
    vermelho: "Vermelho",
    amarelo: "Amarelo",
    verde: "Verde",
    azul: "Azul",
    prata: "Prata"
  };

  var botoes = document.querySelectorAll("[data-escolher-cor]");
  var rotuloCor = document.getElementById("nome-cor");

  // Aplica a cor: o CSS lê o atributo data-cor do <html> e troca a paleta.
  function aplicar(cor) {
    if (cor === "laranja") {
      document.documentElement.removeAttribute("data-cor");
    } else {
      document.documentElement.setAttribute("data-cor", cor);
    }
    botoes.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-escolher-cor") === cor));
    });
    if (rotuloCor) rotuloCor.textContent = "Cor escolhida: " + nomes[cor];
  }

  // Guarda a escolha no navegador. O try/catch evita erro em navegação
  // anônima ou quando o navegador bloqueia o armazenamento.
  function guardar(cor) {
    try { window.localStorage.setItem(CHAVE, cor); } catch (e) { /* segue sem guardar */ }
  }

  var atual = document.documentElement.getAttribute("data-cor") || "laranja";
  if (botoes.length) aplicar(atual);

  botoes.forEach(function (botao) {
    botao.addEventListener("click", function () {
      var cor = botao.getAttribute("data-escolher-cor");
      aplicar(cor);
      guardar(cor);
    });
  });
})();
