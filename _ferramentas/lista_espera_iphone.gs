/**
 * @OnlyCurrentDoc
 *
 * Lista de espera do iPhone — Rodando Pelo Mundo (RPM)
 * ====================================================
 *
 * Recebe o formulário "Tenho iPhone, me avise" do site
 * (rodandopelomundo.com.br/#iphone), guarda o e-mail numa planilha da
 * conta do app e manda um e-mail de confirmação dizendo como sair.
 *
 * Este arquivo é só a cópia versionada. O código que roda de verdade é o
 * que está colado no Apps Script da planilha "RPM — Lista de espera do
 * iPhone", na conta approdandopelomundo@gmail.com. Ao mudar um, mude o
 * outro. A pasta _ferramentas não é publicada pelo GitHub Pages.
 *
 * O "@OnlyCurrentDoc" lá em cima limita o script a esta planilha: o Google
 * pede autorização só para ela, e não para todas as planilhas da conta.
 *
 * Publicar (primeira vez)
 *   1. Rodar configurarPlanilha() uma vez no editor e autorizar.
 *   2. Implantar › Nova implantação › App da Web
 *      Executar como: Eu · Quem pode acessar: Qualquer pessoa.
 *   3. Copiar a URL que termina em /exec (vai no index.html do site).
 *
 * Mudou o código depois?
 *   Implantar › Gerenciar implantações › lápis › Versão: Nova versão.
 *   Assim a URL /exec continua a mesma e o site não precisa mudar.
 *
 * Alguém pediu para sair?
 *   Apagar a linha do e-mail na aba "Lista" (clique direito › Excluir linha).
 */

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

/** Nome da aba onde ficam as inscrições. */
const NOME_ABA = 'Lista';

/** Títulos das colunas, na ordem em que cada inscrição é gravada. */
const CABECALHO = [
  'Data e hora',
  'E-mail',
  'Quer testar antes',
  'Como conheceu',
  'Versão do aviso',
  'Confirmação',
];

/** Número da coluna "Confirmação" (1 = A). Usado para atualizar o envio. */
const COLUNA_CONFIRMACAO = 6;

/** Número da coluna "Quer testar antes". */
const COLUNA_TESTAR = 3;

/**
 * Respostas aceitas em "Como conheceu o RPM". Precisam ser idênticas às
 * opções do <select> do site. Qualquer outra coisa é gravada em branco,
 * assim ninguém consegue escrever texto livre na planilha por aqui.
 */
const ORIGENS_ACEITAS = [
  'Instagram',
  'WhatsApp',
  'Amigo ou grupo de moto',
  'Evento de moto',
  'Influenciador ou vídeo',
  'Busca na internet',
  'Outro',
];

/**
 * Tempo mínimo (em milissegundos) entre abrir a página e enviar. Robôs
 * costumam enviar na hora; uma pessoa leva mais que 1,5 s para digitar.
 */
const TEMPO_MINIMO_MS = 1500;

/** Endereço da seção da lista na política de privacidade. */
const LINK_POLITICA = 'https://rodandopelomundo.com.br/privacidade.html#lista-iphone';

/** Nome que aparece como remetente no e-mail de confirmação. */
const NOME_REMETENTE = 'Rodando Pelo Mundo';

// ---------------------------------------------------------------------------
// Entrada do site
// ---------------------------------------------------------------------------

/**
 * Recebe o envio do formulário do site.
 *
 * O site manda os campos como um formulário comum (email, testar, origem,
 * aviso, t e site). O Apps Script entrega esses campos em e.parameter,
 * um objeto parecido com um dicionário do Python.
 *
 * Responde sempre em JSON:
 *   { ok: true }                 → o site mostra "Pronto, você está na lista"
 *   { ok: false, erro: 'email' } → o site pede para conferir o e-mail
 *   { ok: false, erro: ... }     → o site pede para tentar de novo
 *
 * Para e-mail repetido a resposta é a mesma de um e-mail novo, para o
 * formulário não revelar quem já está na lista.
 */
function doPost(e) {
  const campos = (e && e.parameter) || {};

  // 1) Robôs: o campo "site" fica escondido na página (só robô preenche),
  //    e "t" diz quantos milissegundos se passaram desde a abertura.
  //    O robô recebe "ok" para não perceber que foi barrado.
  const campoEscondido = String(campos.site || '').trim();
  const tempoNaPagina = Number(campos.t || 0);
  if (campoEscondido !== '' || tempoNaPagina < TEMPO_MINIMO_MS) {
    return responder_({ ok: true });
  }

  // 2) E-mail: tira espaços, passa para minúsculas e confere o formato.
  const email = String(campos.email || '').trim().toLowerCase();
  if (!emailValido_(email)) {
    return responder_({ ok: false, erro: 'email' });
  }

  // 3) Demais campos, sempre dentro de valores conhecidos.
  const querTestar = campos.testar === 'sim';
  const origem = ORIGENS_ACEITAS.indexOf(campos.origem) >= 0 ? campos.origem : '';
  const aviso = /^\d{4}-\d{2}-\d{2}$/.test(campos.aviso || '') ? campos.aviso : '';

  // 4) Trava: se duas pessoas enviarem no mesmo instante, uma espera a
  //    outra terminar. Sem isso, o mesmo e-mail poderia entrar duas vezes.
  const trava = LockService.getScriptLock();
  try {
    trava.waitLock(10000);
  } catch (erro) {
    return responder_({ ok: false, erro: 'ocupado' });
  }

  let aba;
  let linhaNova = 0;
  try {
    aba = abaLista_();
    const linhaExistente = acharEmail_(aba, email);

    if (linhaExistente) {
      // Já estava na lista. Se agora marcou "quero testar", atualiza;
      // não manda outro e-mail de confirmação.
      if (querTestar) {
        aba.getRange(linhaExistente, COLUNA_TESTAR).setValue('sim');
      }
      return responder_({ ok: true });
    }

    aba.appendRow([
      new Date(),
      email,
      querTestar ? 'sim' : 'não',
      origem,
      aviso,
      'pendente',
    ]);
    linhaNova = aba.getLastRow();
    SpreadsheetApp.flush();
  } finally {
    // "finally" roda sempre, como no Python: a trava é solta mesmo se der erro.
    trava.releaseLock();
  }

  // 5) Confirmação por e-mail, fora da trava (o envio é a parte mais lenta).
  const situacao = enviarConfirmacao_(email, querTestar);
  aba.getRange(linhaNova, COLUNA_CONFIRMACAO).setValue(situacao);

  return responder_({ ok: true });
}

/**
 * Quem abrir a URL do script direto no navegador vê só um aviso.
 */
function doGet() {
  return ContentService.createTextOutput(
    'Lista de espera do iPhone do Rodando Pelo Mundo. ' +
    'Para entrar, use o formulário em https://rodandopelomundo.com.br/#iphone'
  );
}

// ---------------------------------------------------------------------------
// Funções para rodar à mão no editor
// ---------------------------------------------------------------------------

/**
 * Rodar uma vez, antes de publicar. Cria a aba "Lista" com o cabeçalho e
 * faz o Google pedir as autorizações (esta planilha e enviar e-mail).
 * O registro de execução mostra quantos e-mails ainda podem sair hoje.
 */
function configurarPlanilha() {
  const aba = abaLista_();
  Logger.log('Aba pronta: ' + aba.getName());
  Logger.log('E-mails que ainda podem sair hoje: ' + MailApp.getRemainingDailyQuota());
}

/**
 * Manda as confirmações que ficaram "pendente" porque a cota diária de
 * e-mails do Google acabou (cerca de 100 por dia numa conta Gmail).
 * Só faz diferença num dia de muitas inscrições, por exemplo depois do
 * post de um influenciador. Rodar à mão no dia seguinte.
 */
function enviarConfirmacoesPendentes() {
  const aba = abaLista_();
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return;

  // getValues devolve uma lista de linhas, e cada linha é uma lista de
  // células (como uma lista de listas no Python). A linha 2 da planilha
  // é o índice 0 aqui, por isso o "i + 2" abaixo.
  const linhas = aba.getRange(2, 1, ultimaLinha - 1, CABECALHO.length).getValues();
  let enviadas = 0;

  linhas.forEach(function (linha, i) {
    if (linha[COLUNA_CONFIRMACAO - 1] !== 'pendente') return;
    const situacao = enviarConfirmacao_(linha[1], linha[COLUNA_TESTAR - 1] === 'sim');
    aba.getRange(i + 2, COLUNA_CONFIRMACAO).setValue(situacao);
    if (situacao === 'enviada') enviadas++;
  });

  Logger.log('Confirmações enviadas agora: ' + enviadas);
}

// ---------------------------------------------------------------------------
// Peças internas. O "_" no fim do nome deixa a função privada: ela não
// aparece no menu Executar do editor e não pode ser chamada de fora.
// ---------------------------------------------------------------------------

/**
 * Devolve a aba "Lista", criando a aba e o cabeçalho se ainda não existirem.
 */
function abaLista_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA);
  }
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
  }
  return aba;
}

/**
 * Procura o e-mail na coluna B. Devolve o número da linha ou 0.
 * O TextFinder compara o texto exato da célula inteira, sem tratar
 * "." e "+" como símbolos especiais.
 */
function acharEmail_(aba, email) {
  const achado = aba.getRange('B:B')
    .createTextFinder(email)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
  return achado ? achado.getRow() : 0;
}

/**
 * Confere se o texto tem cara de e-mail.
 *
 * A regra é de propósito mais rígida que a oficial: começa com letra ou
 * número, só usa letras sem acento, números e . _ % + -, e termina em
 * domínio com ponto. Começar com letra ou número também impede que a
 * planilha leia o e-mail como fórmula (textos que começam com =, + ou -).
 */
function emailValido_(email) {
  if (email.length > 254) return false;
  return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email);
}

/**
 * Manda o e-mail de confirmação e devolve o que aconteceu, para a coluna
 * "Confirmação": "enviada", "pendente" (cota do dia acabou) ou "erro: ...".
 */
function enviarConfirmacao_(email, querTestar) {
  if (MailApp.getRemainingDailyQuota() < 1) {
    return 'pendente';
  }
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Você está na lista do RPM para iPhone',
      body: textoConfirmacao_(querTestar),
      name: NOME_REMETENTE,
    });
    return 'enviada';
  } catch (erro) {
    return 'erro: ' + String((erro && erro.message) || erro).slice(0, 80);
  }
}

/**
 * Texto do e-mail de confirmação. O parágrafo do TestFlight só entra para
 * quem marcou "Quero testar antes".
 */
function textoConfirmacao_(querTestar) {
  const partes = [
    'Olá!',
    'Seu e-mail entrou na lista de espera do Rodando Pelo Mundo (RPM) para iPhone. ' +
      'Quando o app chegar à App Store, você recebe um aviso neste endereço.',
  ];

  if (querTestar) {
    partes.push(
      'Você também pediu para testar antes. Se abrir uma versão de teste para iPhone ' +
        '(pelo TestFlight, da Apple), o convite chega aqui.'
    );
  }

  partes.push(
    'Ainda não há data prevista. O RPM chega primeiro ao Android, e o tamanho desta ' +
      'lista ajuda a decidir quando levá-lo ao iPhone.',
    'Seu e-mail serve só para isso: não mandamos propaganda nem usamos o endereço ' +
      'para outra coisa.',
    'Para sair da lista, responda a esta mensagem com a palavra "sair". Se não foi ' +
      'você quem se inscreveu, responda do mesmo jeito e o endereço é apagado.',
    'Como guardamos e apagamos a lista: ' + LINK_POLITICA,
    'Saia da tela. Caia na estrada.\nRodando Pelo Mundo (RPM)\nInstagram: @app.rodandopelomundo'
  );

  return partes.join('\n\n');
}

/**
 * Transforma um objeto em resposta JSON para o site.
 */
function responder_(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
}
