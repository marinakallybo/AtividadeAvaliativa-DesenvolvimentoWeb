/* =====================================================================
   SCRIPT.JS — Sistema de pedidos (POO + CRUD)
   Fluxo: Repositorio (dados) -> render*() (tela) -> eventos (ações)
   ===================================================================== */

/* ---------- Utilidades ---------- */
const $ = (s) => document.querySelector(s);
// Formata número como moeda brasileira: 22 -> "R$ 22,00"
const moeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Escapa HTML: evita que um nome digitado como <script> quebre a página
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* =====================================================================
   CLASSE 1 — Produto
   Atributos PRIVADOS (#) = encapsulamento: só se acessa por getters/setters,
   e os setters VALIDAM o valor (não existe produto com preço negativo).
   ===================================================================== */
class Produto {
  #id; #nome; #descricao; #preco; #categoria; #imagem;

  constructor({ id, nome, descricao, preco, categoria, imagem }) {
    this.#id = id;
    // Usa os setters (this.nome = ...) para já validar na criação
    this.nome = nome; this.descricao = descricao; this.preco = preco;
    this.categoria = categoria; this.imagem = imagem;
  }

  get id() { return this.#id; }                 // id: só leitura (sem setter)
  get nome() { return this.#nome; }
  set nome(v) {
    if (!v || !String(v).trim()) throw new Error("O nome é obrigatório.");
    this.#nome = String(v).trim();
  }
  get descricao() { return this.#descricao; }
  set descricao(v) { this.#descricao = String(v ?? "").trim(); }
  get preco() { return this.#preco; }
  set preco(v) {
    const n = Number(String(v).replace(",", "."));   // aceita "22,50" ou "22.50"
    if (!(n > 0)) throw new Error("O preço deve ser maior que zero.");
    this.#preco = Math.round(n * 100) / 100;         // 2 casas decimais
  }
  get categoria() { return this.#categoria; }
  set categoria(v) { this.#categoria = v || "Prato"; }
  get imagem() { return this.#imagem; }
  set imagem(v) { this.#imagem = v || `https://picsum.photos/seed/${encodeURIComponent(this.#nome)}/800/450`; }

  // JSON.stringify chama este método: necessário para salvar no localStorage
  toJSON() {
    return { id: this.#id, nome: this.#nome, descricao: this.#descricao, preco: this.#preco, categoria: this.#categoria, imagem: this.#imagem };
  }
}

/* =====================================================================
   CLASSE 2 — ItemCarrinho
   RELACIONAMENTO: "tem um" Produto (composição) + uma quantidade.
   ===================================================================== */
class ItemCarrinho {
  #produto; #quantidade;
  constructor(produto, quantidade = 1) { this.#produto = produto; this.quantidade = quantidade; }
  get produto() { return this.#produto; }
  get quantidade() { return this.#quantidade; }
  set quantidade(q) {
    if (!Number.isInteger(q) || q < 1) throw new Error("Quantidade inválida.");
    this.#quantidade = q;
  }
  // Getter calculado: usa o preço ATUAL do produto (se editar o preço, atualiza aqui)
  get subtotal() { return this.#produto.preco * this.#quantidade; }
}

/* =====================================================================
   CLASSE 3 — Carrinho
   Agrupa ItemCarrinho e calcula subtotal, taxa e total.
   ===================================================================== */
class Carrinho {
  static TAXA_DELIVERY = 2.5;   // static = pertence à classe, não ao objeto
  #itens = [];

  get itens() { return [...this.#itens]; }   // devolve CÓPIA (protege o array interno)
  get totalItens() { return this.#itens.reduce((s, i) => s + i.quantidade, 0); }
  get subtotal() { return this.#itens.reduce((s, i) => s + i.subtotal, 0); }

  // CREATE: adiciona produto (se já existe, só soma 1 na quantidade)
  adicionar(produto) {
    const item = this.#itens.find((i) => i.produto.id === produto.id);
    if (item) item.quantidade++;
    else this.#itens.push(new ItemCarrinho(produto, 1));
  }
  // UPDATE: soma/subtrai quantidade (delta = +1 ou -1); mínimo 1
  alterarQuantidade(id, delta) {
    const item = this.#itens.find((i) => i.produto.id === id);
    if (item && item.quantidade + delta >= 1) item.quantidade += delta;
  }
  // DELETE: remove um item / limpa tudo
  remover(id) { this.#itens = this.#itens.filter((i) => i.produto.id !== id); }
  limpar() { this.#itens = []; }

  // Taxa só no delivery e só se houver itens
  taxaEntrega(tipo) { return tipo === "delivery" && this.#itens.length ? Carrinho.TAXA_DELIVERY : 0; }
  total(tipo) { return this.subtotal + this.taxaEntrega(tipo); }
}

/* =====================================================================
   CLASSE 4 — Pedido (pedido finalizado)
   Guarda uma "foto" dos itens (nome/preço/qtd) para o histórico não
   mudar se o cardápio for editado depois.
   ===================================================================== */
class Pedido {
  #dados;
  constructor({ id, cliente, itens, tipoEntrega, taxa, total, status = "Recebido", data = new Date().toISOString() }) {
    this.#dados = { id, cliente, itens, tipoEntrega, taxa, total, status, data };
  }
  get id() { return this.#dados.id; }
  get cliente() { return this.#dados.cliente; }
  get itens() { return this.#dados.itens; }
  get tipoEntrega() { return this.#dados.tipoEntrega; }
  get taxa() { return this.#dados.taxa; }
  get total() { return this.#dados.total; }
  get status() { return this.#dados.status; }
  get data() { return new Date(this.#dados.data); }
  toJSON() { return this.#dados; }
}

/* =====================================================================
   CLASSE 5 — Repositorio (gerenciador do CRUD)
   Única classe que mexe nos dados e no localStorage (bônus).
   ===================================================================== */
class Repositorio {
  #produtos = [];
  #pedidos = [];

  constructor() {
    this.#carregar();
    // Primeira vez (sem nada salvo): cria cardápio inicial
    if (!this.#produtos.length && !localStorage.getItem("produtos")) {
      [
        ["Iphone 17 Pro Max", "Celular muito aclamado pela mídia", 11999.99, "Celular"],
        ["Monitor ACER", "Monitor perfeito para você assistir séries ou jogar seus jogos favoritos", 599.99, "Eletrônico"],
        ["MacBook M1", "Notebook muito rápido e perfeito para qualquer atividade", 16999.99, "Notebook"]
        ["Mouse Lenovo", "Mouse adequado para qualquer público", 159.99, "Eletrônico"],
        ["Mousepad", "Mousepad para tornar a sua experiência com o mouse mais agradável", 69.99, "Utilidades"]
        ["Headset", "Fones de ouvido excelentes com total redução de ruído", 399.99, "Eletrônico"]
        ["Cadeira Ergonômica", "Cadeira perfeita e super confortável", 699.99, "Utilidades"]
      ].forEach(([nome, descricao, preco, categoria]) => this.criarProduto({ nome, descricao, preco, categoria }));
    }
  }

  // Persistência (privados: ninguém de fora precisa chamar)
  #carregar() {
    try {
      this.#produtos = (JSON.parse(localStorage.getItem("produtos")) || []).map((p) => new Produto(p));
      this.#pedidos = (JSON.parse(localStorage.getItem("pedidos")) || []).map((p) => new Pedido(p));
    } catch { this.#produtos = []; this.#pedidos = []; }   // dados corrompidos: começa do zero
  }
  #salvar() {
    localStorage.setItem("produtos", JSON.stringify(this.#produtos));
    localStorage.setItem("pedidos", JSON.stringify(this.#pedidos));
  }

  // ----- CRUD de produtos -----
  criarProduto(dados) {                                   // CREATE
    const p = new Produto({ ...dados, id: Date.now() + Math.floor(Math.random() * 1000) });
    this.#produtos.push(p); this.#salvar(); return p;
  }
  listarProdutos() { return [...this.#produtos]; }        // READ (todos)
  buscarProduto(id) { return this.#produtos.find((p) => p.id === id); }   // READ (um)
  atualizarProduto(id, d) {                               // UPDATE
    const p = this.buscarProduto(id);
    if (!p) throw new Error("Produto não encontrado.");
    p.nome = d.nome; p.descricao = d.descricao; p.preco = d.preco; p.categoria = d.categoria;
    p.imagem = d.imagem;                                  // setters validam
    this.#salvar(); return p;
  }
  removerProduto(id) {                                    // DELETE
    this.#produtos = this.#produtos.filter((p) => p.id !== id); this.#salvar();
  }

  // ----- Pedidos -----
  criarPedido(dados) {
    const pedido = new Pedido({ ...dados, id: Date.now() });
    this.#pedidos.unshift(pedido); this.#salvar(); return pedido;   // unshift = mais recente primeiro
  }
  listarPedidos() { return [...this.#pedidos]; }
}

/* =====================================================================
   INTERFACE
   ===================================================================== */
const repo = new Repositorio();
const carrinho = new Carrinho();
let slideAtual = 0;

const tipoEntrega = () => document.querySelector('input[name="entrega"]:checked').value;

/* FEEDBACK (IHC): mensagem temporária após cada ação */
let timerToast;
function aviso(msg, tipo = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "mostrar " + (tipo === "erro" ? "erro" : "");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (t.className = ""), 3000);
}

/* ---------- CARDÁPIO (READ) ---------- */
function renderCardapio() {
  const ps = repo.listarProdutos();
  $("#lista").innerHTML = ps.length ? ps.map((p) => `
    <article class="prod">
      <img src="${esc(p.imagem)}" alt="Foto do prato ${esc(p.nome)}" loading="lazy" onerror="this.src='https://picsum.photos/seed/prato/800/450'">
      <div class="prod__corpo">
        <span class="cat">${esc(p.categoria)}</span>
        <h3>${esc(p.nome)}</h3>
        <p class="desc">${esc(p.descricao)}</p>
        <p class="preco">${moeda(p.preco)}</p>
        <div class="linha-btn">
          <button class="btn btn-pq" type="button" data-acao="add" data-id="${p.id}">Adicionar</button>
          <button class="btn btn-pq btn-sec" type="button" data-acao="editar" data-id="${p.id}">Editar</button>
          <button class="btn btn-pq btn-perigo" type="button" data-acao="excluir" data-id="${p.id}">Excluir</button>
        </div>
      </div>
    </article>`).join("") : '<p class="vazio">Nenhum produto. Clique em "+ Novo produto".</p>';
}

/* ---------- CARRINHO (READ) ---------- */
function renderCarrinho() {
  const itens = carrinho.itens;
  $("#itens").innerHTML = itens.length ? itens.map((i) => `
    <li>
      <span>${esc(i.produto.nome)}<br><small>${moeda(i.produto.preco)} cada</small></span>
      <span class="qtd">
        <button type="button" data-acao="menos" data-id="${i.produto.id}" aria-label="Diminuir quantidade de ${esc(i.produto.nome)}">−</button>
        <strong aria-label="Quantidade">${i.quantidade}</strong>
        <button type="button" data-acao="mais" data-id="${i.produto.id}" aria-label="Aumentar quantidade de ${esc(i.produto.nome)}">+</button>
      </span>
      <span>${moeda(i.subtotal)}</span>
      <button class="btn btn-pq btn-perigo" type="button" data-acao="remover" data-id="${i.produto.id}" aria-label="Remover ${esc(i.produto.nome)}">✕</button>
    </li>`).join("") : '<li class="vazio">Seu carrinho está vazio.</li>';

  const tipo = tipoEntrega();
  $("#bloco-end").hidden = tipo !== "delivery";           // endereço só no delivery
  $("#r-sub").textContent = moeda(carrinho.subtotal);
  $("#r-taxa").textContent = moeda(carrinho.taxaEntrega(tipo));   // visibilidade da taxa
  $("#r-total").textContent = moeda(carrinho.total(tipo));
  $("#contador").textContent = carrinho.totalItens;
}

/* ---------- PEDIDOS ---------- */
function renderPedidos() {
  const ps = repo.listarPedidos();
  $("#lista-pedidos").innerHTML = ps.length ? ps.map((p) => `
    <li>
      <strong>#${p.id}</strong> · ${esc(p.cliente.nome)} · ${p.data.toLocaleString("pt-BR")}
      <span class="status">${esc(p.status)}</span><br>
      ${p.itens.map((i) => `${i.quantidade}x ${esc(i.nome)}`).join(", ")}<br>
      ${p.tipoEntrega === "delivery" ? `Delivery para ${esc(p.cliente.endereco)} (taxa ${moeda(p.taxa)})` : "Retirada / consumo no local"}
      — <strong>Total ${moeda(p.total)}</strong>
    </li>`).join("") : '<li class="vazio">Nenhum pedido ainda.</li>';
}

const renderTudo = () => { renderCarrossel(); renderCardapio(); renderCarrinho(); };

/* ---------- FORMULÁRIO DE PRODUTO (CREATE / UPDATE) ---------- */
const dlg = $("#dlg");
function abrirForm(produto) {
  $("#form-produto").reset();
  $("#erro-form").textContent = "";
  $("#t-form").textContent = produto ? "Editar produto" : "Novo produto";
  $("#p-id").value = produto ? produto.id : "";            // id preenchido = modo edição
  if (produto) {
    $("#p-nome").value = produto.nome; $("#p-desc").value = produto.descricao;
    $("#p-preco").value = String(produto.preco).replace(".", ","); $("#p-cat").value = produto.categoria;
    $("#p-img").value = produto.imagem;
  }
  dlg.showModal();
  $("#p-nome").focus();
}
$("#novo").addEventListener("click", () => abrirForm(null));
$("#cancelar").addEventListener("click", () => dlg.close());

$("#form-produto").addEventListener("submit", (e) => {
  e.preventDefault();
  const dados = { nome: $("#p-nome").value, descricao: $("#p-desc").value, preco: $("#p-preco").value, categoria: $("#p-cat").value, imagem: $("#p-img").value.trim() };
  try {                                                    // validação: os setters lançam Error
    const id = Number($("#p-id").value);
    if (id) { repo.atualizarProduto(id, dados); aviso("Produto atualizado!"); }
    else { repo.criarProduto(dados); aviso("Produto cadastrado!"); }
    dlg.close(); renderTudo();
  } catch (err) { $("#erro-form").textContent = err.message; }   // mostra o erro no formulário
});

/* ---------- AÇÕES DOS BOTÕES (delegação de eventos) ---------- */
document.addEventListener("click", (e) => {
  const ponto = e.target.closest("[data-ponto]");

  const b = e.target.closest("[data-acao]");
  if (!b) return;
  const id = Number(b.dataset.id);
  const prod = repo.buscarProduto(id);

  switch (b.dataset.acao) {
    case "add":
      carrinho.adicionar(prod); renderCarrinho(); aviso(`${prod.nome} adicionado ao carrinho.`); break;
    case "mais": carrinho.alterarQuantidade(id, 1); renderCarrinho(); break;
    case "menos": carrinho.alterarQuantidade(id, -1); renderCarrinho(); break;
    case "remover":                                        // prevenção de erros: confirmação
      if (confirm(`Remover "${prod?.nome ?? "item"}" do carrinho?`)) { carrinho.remover(id); renderCarrinho(); aviso("Item removido."); }
      break;
    case "editar": abrirForm(prod); break;
    case "excluir":
      if (confirm(`Excluir "${prod.nome}" do cardápio?`)) {
        repo.removerProduto(id); carrinho.remover(id);     // também sai do carrinho
        renderTudo(); aviso("Produto excluído do cardápio.");
      }
      break;
  }
});


document.querySelectorAll('input[name="entrega"]').forEach((r) => r.addEventListener("change", renderCarrinho));

$("#limpar").addEventListener("click", () => {
  if (!carrinho.itens.length) return aviso("O carrinho já está vazio.", "erro");
  if (confirm("Limpar todo o carrinho?")) { carrinho.limpar(); renderCarrinho(); aviso("Carrinho limpo."); }
});

/* ---------- FINALIZAR PEDIDO ---------- */
$("#finalizar").addEventListener("click", () => {
  const tipo = tipoEntrega();
  const nome = $("#cli-nome").value.trim();
  const end = $("#cli-end").value.trim();

  // Validação (prevenção de erros) com foco no campo problemático
  if (!carrinho.itens.length) return aviso("Adicione itens antes de finalizar.", "erro");
  if (nome.length < 2) { $("#cli-nome").focus(); return aviso("Informe o nome do cliente.", "erro"); }
  if (tipo === "delivery" && end.length < 5) { $("#cli-end").focus(); return aviso("Informe o endereço de entrega.", "erro"); }

  const pedido = repo.criarPedido({
    cliente: { nome, endereco: tipo === "delivery" ? end : "" },
    itens: carrinho.itens.map((i) => ({ nome: i.produto.nome, preco: i.produto.preco, quantidade: i.quantidade })),
    tipoEntrega: tipo, taxa: carrinho.taxaEntrega(tipo), total: carrinho.total(tipo),
  });
  carrinho.limpar();
  $("#cli-nome").value = ""; $("#cli-end").value = "";
  renderCarrinho(); renderPedidos();
  aviso(`Pedido #${pedido.id} realizado! Total: ${moeda(pedido.total)}`);
});

/* ---------- Tema claro/escuro (+ localStorage) ---------- */
function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("#btn-tema").textContent = t === "dark" ? "Claro" : "Escuro";
  }
  aplicarTema(localStorage.getItem("tema") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#btn-tema").addEventListener("click", () => {
    const novo = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    aplicarTema(novo); localStorage.setItem("tema", novo);
  });
  

/* ---------- INÍCIO ---------- */
renderTudo();
renderPedidos();
iniciarAuto();
