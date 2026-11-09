/* =====================================================================
   RPM · Rodando Pelo Mundo — comportamento do site
   ---------------------------------------------------------------------
   Três coisas pequenas, sem bibliotecas:
   1. os números do painel "contam" até o valor ao abrir a página,
      como na tela Início do app;
   2. a escolha da cor do app (os botões coloridos), que troca a cor de
      destaque do site inteiro e fica lembrada neste navegador;
   3. o envio da lista de espera do iPhone, sem sair da página.
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

  /* ---------- 3. Lista de espera do iPhone ----------
     O formulário vai para o Apps Script da planilha do app (endereço no
     atributo data-endereco do <form>). A resposta é um JSON:
     { ok: true } ou { ok: false, erro: "email" | outro motivo }.
     Para e-mail repetido a resposta é a mesma de um novo, então a página
     nunca diz se alguém já estava na lista. */

  // Hora em que a página abriu: o script recusa envios rápidos demais
  // (coisa de robô), e por isso o envio leva junto quanto tempo passou.
  var aberturaPagina = Date.now();

  var formLista = document.getElementById("form-iphone");
  if (formLista) prepararLista(formLista);

  function prepararLista(form) {
    var endereco = form.getAttribute("data-endereco") || "";
    var campoEmail = form.querySelector("input[name=email]");
    var botao = form.querySelector("button[type=submit]");
    var textoBotao = botao.textContent;
    var estado = document.getElementById("estado-iphone");
    var pronto = document.getElementById("iphone-pronto");
    var emailPronto = document.getElementById("iphone-email-pronto");
    var outro = document.getElementById("iphone-outro");

    var ERRO_EMAIL = "Confira o e-mail: ele parece incompleto ou tem algum caractere a mais.";
    var ERRO_ENVIO = "Não deu para enviar agora. Confira a internet e tente de novo, " +
      "ou escreva para approdandopelomundo@gmail.com.";

    function mostrarErro(texto) { estado.textContent = texto; }

    // Liga e desliga o botão durante o envio, para não mandar duas vezes.
    function enviando(sim) {
      botao.disabled = sim;
      botao.textContent = sim ? "Enviando…" : textoBotao;
    }

    form.addEventListener("submit", function (evento) {
      // O navegador já conferiu o campo (type="email" e required) antes de
      // chegar aqui. preventDefault segura o envio comum, que trocaria de página.
      evento.preventDefault();
      if (botao.disabled) return;
      mostrarErro("");

      if (endereco.indexOf("/exec") === -1) {
        // Endereço do script ainda não preenchido (o marcador do sed)
        mostrarErro(ERRO_ENVIO);
        return;
      }

      // Os campos viram "email=...&testar=sim&origem=...", como num
      // formulário comum. Esse formato não precisa de licença extra do
      // navegador (CORS), por isso o Google responde direto.
      var dados = new URLSearchParams(new FormData(form));
      dados.set("t", String(Date.now() - aberturaPagina));

      // Sem resposta em 15 s, desiste (internet ruim na estrada, por exemplo).
      var controle = window.AbortController ? new AbortController() : null;
      var relogio = controle ? window.setTimeout(function () { controle.abort(); }, 15000) : null;

      enviando(true);
      fetch(endereco, { method: "POST", body: dados, signal: controle ? controle.signal : undefined })
        .then(function (resposta) { return resposta.json(); })
        .then(function (json) {
          if (json && json.ok) {
            emailPronto.textContent = campoEmail.value.trim().toLowerCase();
            form.hidden = true;
            pronto.hidden = false;
            pronto.focus();
            return;
          }
          if (json && json.erro === "email") {
            mostrarErro(ERRO_EMAIL);
            campoEmail.focus();
            return;
          }
          mostrarErro(ERRO_ENVIO);
        })
        .catch(function () { mostrarErro(ERRO_ENVIO); })
        .then(function () {
          // Roda no fim de qualquer caminho, como um "finally"
          if (relogio) window.clearTimeout(relogio);
          enviando(false);
        });
    });

    // "Usar outro e-mail": volta o formulário limpo (o e-mail anterior
    // continua na lista; para tirar, a pessoa responde "sair").
    outro.addEventListener("click", function () {
      form.reset();
      pronto.hidden = true;
      form.hidden = false;
      campoEmail.focus();
    });
  }
})();
