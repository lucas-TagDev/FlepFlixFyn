// leavingSoonPage.js — aba de configurações "Saindo do Catálogo" (FlepFlixFyn, por lucas-TagDev)
import { createSection } from "./shared.js";
import { withServer } from "../jfUrl.js";
import { getSessionInfo, makeApiRequest } from "../../../Plugins/JMSFusion/runtime/api.js";
import {
  LEAVING_SOON_DEFAULT_MESSAGES,
  fetchLeavingSoonSettings,
  saveLeavingSoonSettings
} from "../leavingSoonShared.js";

const SEARCH_PAGE_SIZE = 24;
const TYPE_OPTIONS = [
  { value: "Movie", text: "Filmes" },
  { value: "Series", text: "Séries" },
  { value: "Movie,Series", text: "Filmes e Séries" }
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

function stopEnterSubmit(input) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
}

function posterUrl(itemId, height = 120) {
  return withServer(`/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=${height}&quality=80`);
}

function typeLabel(type) {
  if (type === "Movie") return "Filme";
  if (type === "Series") return "Série";
  return type || "";
}

function newSectionId() {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}

function ensureStyles() {
  if (document.getElementById("jms-leaving-soon-settings-style")) return;
  const style = document.createElement("style");
  style.id = "jms-leaving-soon-settings-style";
  style.textContent = `
    .ls-status { font-size: .85em; opacity: .85; margin: 4px 0 10px; min-height: 1.2em; }
    .ls-status.is-error { color: #ff6b6b; opacity: 1; }
    .ls-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
    .ls-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
      background: rgba(122,92,255,.18); border: 1px solid rgba(122,92,255,.45); font-size: .85em; }
    .ls-chip button { background: none; border: 0; color: inherit; cursor: pointer; font-size: 1em; padding: 0; opacity: .8; }
    .ls-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0; }
    .ls-row input[type=text], .ls-row input[type=search], .ls-row input[type=date], .ls-row select {
      flex: 1 1 180px; min-width: 0; padding: 6px 8px; border-radius: 6px; }
    .ls-btn { padding: 6px 12px; border-radius: 6px; cursor: pointer; border: 1px solid rgba(122,92,255,.55);
      background: rgba(122,92,255,.25); color: inherit; font-weight: 600; }
    .ls-btn:disabled { opacity: .5; cursor: default; }
    .ls-btn.ls-btn-danger { border-color: rgba(255,90,90,.6); background: rgba(255,90,90,.18); }
    .ls-btn.ls-btn-small { padding: 3px 8px; font-size: .85em; }
    .ls-section-card { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 12px; margin: 12px 0;
      background: rgba(255,255,255,.03); }
    .ls-section-card.is-disabled { opacity: .65; }
    .ls-items { list-style: none; margin: 8px 0; padding: 0; border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
      max-height: 360px; overflow: auto; }
    .ls-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .ls-item:last-child { border-bottom: 0; }
    .ls-item img, .ls-result img { width: 40px; height: 60px; object-fit: cover; border-radius: 4px; background: #0004; flex: 0 0 auto; }
    .ls-item-name { flex: 1 1 160px; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
    .ls-item-name small { font-weight: 400; opacity: .7; }
    .ls-item select, .ls-item input[type=date] { flex: 0 1 200px; min-width: 0; padding: 4px 6px; border-radius: 6px; }
    .ls-empty { padding: 10px; opacity: .7; font-size: .9em; }
    .ls-search { margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,.12); }
    .ls-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; margin: 8px 0;
      max-height: 340px; overflow: auto; }
    .ls-result { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.02); }
    .ls-result.is-added { opacity: .5; cursor: default; }
    .ls-result input { flex: 0 0 auto; }
    .ls-result span { min-width: 0; overflow-wrap: anywhere; font-size: .9em; }
  `;
  document.head.appendChild(style);
}

export function createLeavingSoonPanel(config, labels) {
  ensureStyles();
  const panel = el("div", { id: "leaving-soon-panel", className: "settings-panel" });

  const intro = createSection(labels?.leavingSoonTab || "Saindo do Catálogo");
  intro.appendChild(el("div", {
    className: "description-text2",
    text: "Monte seções na página inicial com os títulos que vão sair do catálogo (por exemplo, uma para filmes e outra para séries). " +
      "Escolha os títulos pela busca, marque e adicione, e defina a mensagem de cada um. " +
      "Itens com data de saída já passada somem sozinhos. A posição da seção na página inicial é definida em " +
      "Coleções de Estúdio → Layout das Seções da Página Inicial."
  }));
  const status = el("div", { className: "ls-status" });
  intro.appendChild(status);
  panel.appendChild(intro);

  const body = el("div");
  panel.appendChild(body);

  if (!config?.currentUserIsAdmin) {
    body.appendChild(el("div", {
      className: "ls-empty",
      text: "Somente administradores podem configurar as seções \"Saindo do Catálogo\"."
    }));
    return panel;
  }

  let state = null;
  let saveTimer = null;
  let loaded = false;

  const setStatus = (text, isError = false) => {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
  };

  const save = async () => {
    if (!state) return;
    setStatus("Salvando…");
    try {
      // Mantém o mesmo objeto em memória: a tela edita estas referências diretamente.
      await saveLeavingSoonSettings(state);
      state.initialized = true;
      setStatus("Salvo ✓ — recarregue a página inicial para ver as mudanças.");
    } catch (e) {
      setStatus(`Não foi possível salvar: ${e?.message || e}`, true);
    }
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    setStatus("Alterações pendentes…");
    saveTimer = setTimeout(save, 700);
  };

  const render = () => {
    body.replaceChildren();
    if (!state) return;
    body.appendChild(renderMessages());
    state.sections.forEach((section, index) => body.appendChild(renderSection(section, index)));
    body.appendChild(el("div", { className: "ls-row" }, [
      el("button", {
        type: "button",
        className: "ls-btn",
        text: "+ Adicionar seção",
        onclick: () => {
          state.sections.push({
            id: newSectionId(),
            title: "Saindo do catálogo",
            itemTypes: "Movie,Series",
            enabled: true,
            items: []
          });
          render();
          scheduleSave();
        }
      })
    ]));
  };

  function renderMessages() {
    const section = createSection("Mensagens");
    section.appendChild(el("div", {
      className: "description-text2",
      text: "Mensagens que você pode escolher para cada título (aparecem como um selo no pôster)."
    }));

    const chips = el("div", { className: "ls-chips" });
    state.messages.forEach((message, index) => {
      chips.appendChild(el("span", { className: "ls-chip" }, [
        el("span", { text: message }),
        el("button", {
          type: "button",
          title: "Remover mensagem",
          text: "✕",
          onclick: () => {
            state.messages.splice(index, 1);
            render();
            scheduleSave();
          }
        })
      ]));
    });
    if (!state.messages.length) {
      chips.appendChild(el("span", { className: "ls-empty", text: "Nenhuma mensagem. Adicione abaixo." }));
    }
    section.appendChild(chips);

    const input = el("input", { type: "text", placeholder: "Nova mensagem, ex.: Última semana para aproveitar", maxlength: "120" });
    const add = () => {
      const value = String(input.value || "").trim();
      if (!value) return;
      if (!state.messages.some((m) => m.toLowerCase() === value.toLowerCase())) {
        state.messages.push(value);
      }
      input.value = "";
      render();
      scheduleSave();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); add(); }
    });
    section.appendChild(el("div", { className: "ls-row" }, [
      input,
      el("button", { type: "button", className: "ls-btn", text: "Adicionar", onclick: add }),
      el("button", {
        type: "button",
        className: "ls-btn ls-btn-small",
        text: "Restaurar padrão",
        onclick: () => {
          LEAVING_SOON_DEFAULT_MESSAGES.forEach((m) => {
            if (!state.messages.includes(m)) state.messages.push(m);
          });
          render();
          scheduleSave();
        }
      })
    ]));
    return section;
  }

  function renderSection(section, index) {
    const card = el("div", { className: `ls-section-card${section.enabled ? "" : " is-disabled"}` });

    const title = el("input", { type: "text", value: section.title, placeholder: "Título da seção", maxlength: "120" });
    stopEnterSubmit(title);
    title.addEventListener("input", () => {
      section.title = title.value;
      scheduleSave();
    });

    const typeSelect = el("select");
    TYPE_OPTIONS.forEach((opt) => {
      const option = el("option", { value: opt.value, text: opt.text });
      if (opt.value === section.itemTypes) option.selected = true;
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener("change", () => {
      section.itemTypes = typeSelect.value;
      scheduleSave();
    });

    const enabledId = `ls-enabled-${section.id}`;
    const enabled = el("input", { type: "checkbox", id: enabledId });
    enabled.checked = section.enabled !== false;
    enabled.addEventListener("change", () => {
      section.enabled = enabled.checked;
      card.classList.toggle("is-disabled", !enabled.checked);
      scheduleSave();
    });

    card.appendChild(el("h3", { text: `Seção ${index + 1}`, style: { marginTop: "0" } }));
    card.appendChild(el("div", { className: "ls-row" }, [title, typeSelect]));
    card.appendChild(el("div", { className: "ls-row" }, [
      el("span", {}, [enabled, el("label", { for: enabledId, text: " Exibir esta seção na página inicial" })]),
      el("span", { style: { flex: "1" } }),
      el("button", {
        type: "button",
        className: "ls-btn ls-btn-small",
        text: "↑",
        title: "Mover seção para cima",
        disabled: index === 0 ? "disabled" : null,
        onclick: () => {
          [state.sections[index - 1], state.sections[index]] = [state.sections[index], state.sections[index - 1]];
          render();
          scheduleSave();
        }
      }),
      el("button", {
        type: "button",
        className: "ls-btn ls-btn-small",
        text: "↓",
        title: "Mover seção para baixo",
        disabled: index === state.sections.length - 1 ? "disabled" : null,
        onclick: () => {
          [state.sections[index + 1], state.sections[index]] = [state.sections[index], state.sections[index + 1]];
          render();
          scheduleSave();
        }
      }),
      el("button", {
        type: "button",
        className: "ls-btn ls-btn-small ls-btn-danger",
        text: "Excluir seção",
        onclick: () => {
          const ok = window.confirm(`Excluir a seção "${section.title || `Seção ${index + 1}`}" e seus ${section.items.length} títulos?`);
          if (!ok) return;
          state.sections.splice(index, 1);
          render();
          scheduleSave();
        }
      })
    ]));

    const list = el("ul", { className: "ls-items" });
    const renderItems = () => {
      list.replaceChildren();
      if (!section.items.length) {
        list.appendChild(el("li", { className: "ls-empty", text: "Nenhum título ainda. Use a busca abaixo para adicionar." }));
        return;
      }
      section.items.forEach((item, itemIndex) => list.appendChild(renderItem(section, item, itemIndex, renderItems)));
    };
    renderItems();
    card.appendChild(el("div", { text: `Títulos (${section.items.length})`, style: { fontWeight: "600", marginTop: "8px" } }));
    card.appendChild(list);
    card.appendChild(renderSearch(section, () => {
      card.replaceWith(renderSection(section, index));
    }));
    return card;
  }

  function renderItem(section, item, itemIndex, rerender) {
    const img = el("img", { alt: "", loading: "lazy", src: posterUrl(item.itemId, 90) });
    img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });

    const message = el("select", { title: "Mensagem" });
    message.appendChild(el("option", { value: "", text: "(sem mensagem)" }));
    const options = state.messages.slice();
    if (item.message && !options.includes(item.message)) options.push(item.message);
    options.forEach((m) => {
      const opt = el("option", { value: m, text: m });
      if (m === item.message) opt.selected = true;
      message.appendChild(opt);
    });
    message.addEventListener("change", () => {
      item.message = message.value;
      scheduleSave();
    });

    const date = el("input", { type: "date", title: "Data de saída (opcional)", value: item.leaveDate || "" });
    stopEnterSubmit(date);
    date.addEventListener("change", () => {
      item.leaveDate = date.value || "";
      scheduleSave();
    });

    const move = (delta) => {
      const target = itemIndex + delta;
      if (target < 0 || target >= section.items.length) return;
      [section.items[target], section.items[itemIndex]] = [section.items[itemIndex], section.items[target]];
      rerender();
      scheduleSave();
    };

    return el("li", { className: "ls-item" }, [
      img,
      el("div", { className: "ls-item-name" }, [
        document.createTextNode(item.name || item.itemId),
        el("small", { text: ` ${[typeLabel(item.type), item.year].filter(Boolean).join(" · ")}` })
      ]),
      message,
      date,
      el("button", { type: "button", className: "ls-btn ls-btn-small", text: "↑", title: "Mover para cima", onclick: () => move(-1) }),
      el("button", { type: "button", className: "ls-btn ls-btn-small", text: "↓", title: "Mover para baixo", onclick: () => move(1) }),
      el("button", {
        type: "button",
        className: "ls-btn ls-btn-small ls-btn-danger",
        text: "Remover",
        onclick: () => {
          section.items.splice(itemIndex, 1);
          rerender();
          scheduleSave();
        }
      })
    ]);
  }

  function renderSearch(section, onAdded) {
    const wrap = el("div", { className: "ls-search" });
    const input = el("input", { type: "search", placeholder: "Pesquisar título no seu Jellyfin…" });
    const results = el("div", { className: "ls-results" });
    const info = el("div", { className: "ls-empty" });
    const selected = new Map();
    let startIndex = 0;
    let lastTerm = "";
    let searchSeq = 0;

    const addBtn = el("button", { type: "button", className: "ls-btn", text: "Adicionar marcados (0)", disabled: "disabled" });
    const moreBtn = el("button", { type: "button", className: "ls-btn ls-btn-small", text: "Carregar mais" });
    moreBtn.style.display = "none";

    const refreshAddBtn = () => {
      addBtn.textContent = `Adicionar marcados (${selected.size})`;
      if (selected.size) addBtn.removeAttribute("disabled");
      else addBtn.setAttribute("disabled", "disabled");
    };

    const runSearch = async (append = false) => {
      const seq = ++searchSeq;
      const term = String(input.value || "").trim();
      if (!append) {
        startIndex = 0;
        lastTerm = term;
        results.replaceChildren();
      }
      info.textContent = "Buscando…";
      const { userId } = getSessionInfo();
      const params = new URLSearchParams({
        IncludeItemTypes: section.itemTypes || "Movie,Series",
        Recursive: "true",
        Limit: String(SEARCH_PAGE_SIZE),
        StartIndex: String(startIndex),
        Fields: "ProductionYear",
        EnableImageTypes: "Primary",
        ImageTypeLimit: "1",
        EnableTotalRecordCount: "true"
      });
      if (lastTerm) {
        params.set("SearchTerm", lastTerm);
      } else {
        params.set("SortBy", "DateCreated,SortName");
        params.set("SortOrder", "Descending");
      }
      try {
        const data = await makeApiRequest(`/Users/${userId}/Items?${params.toString()}`);
        if (seq !== searchSeq) return;
        const items = Array.isArray(data?.Items) ? data.Items : [];
        const total = Number(data?.TotalRecordCount) || 0;
        startIndex += items.length;
        const existing = new Set(section.items.map((i) => i.itemId));
        items.forEach((item) => results.appendChild(renderResult(item, existing.has(item.Id))));
        info.textContent = results.children.length
          ? (lastTerm ? `${total} resultado(s) para "${lastTerm}"` : "Adicionados recentemente — marque os que vão sair")
          : "Nenhum título encontrado.";
        moreBtn.style.display = startIndex < total ? "" : "none";
      } catch (e) {
        if (seq !== searchSeq) return;
        info.textContent = `Erro na busca: ${e?.message || e}`;
      }
    };

    const renderResult = (item, alreadyAdded) => {
      const check = el("input", { type: "checkbox" });
      const img = el("img", { alt: "", loading: "lazy", src: posterUrl(item.Id, 90) });
      img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });
      const row = el("label", { className: `ls-result${alreadyAdded ? " is-added" : ""}` }, [
        check,
        img,
        el("span", {
          text: `${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ""} · ${typeLabel(item.Type)}${alreadyAdded ? " — já adicionado" : ""}`
        })
      ]);
      if (alreadyAdded) {
        check.disabled = true;
        check.checked = true;
      } else {
        check.checked = selected.has(item.Id);
        check.addEventListener("change", () => {
          if (check.checked) selected.set(item.Id, item);
          else selected.delete(item.Id);
          refreshAddBtn();
        });
      }
      return row;
    };

    let debounce = null;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => runSearch(false), 350);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(debounce);
        runSearch(false);
      }
    });
    moreBtn.addEventListener("click", () => runSearch(true));

    addBtn.addEventListener("click", () => {
      if (!selected.size) return;
      const defaultMessage = state.messages[0] || "";
      const existing = new Set(section.items.map((i) => i.itemId));
      for (const item of selected.values()) {
        if (existing.has(item.Id)) continue;
        section.items.push({
          itemId: item.Id,
          name: item.Name || "",
          type: item.Type || "",
          year: item.ProductionYear || null,
          message: defaultMessage,
          leaveDate: ""
        });
      }
      selected.clear();
      scheduleSave();
      onAdded();
    });

    wrap.appendChild(el("div", { text: "Adicionar títulos", style: { fontWeight: "600" } }));
    wrap.appendChild(el("div", { className: "ls-row" }, [
      input,
      el("button", { type: "button", className: "ls-btn", text: "Buscar", onclick: () => runSearch(false) })
    ]));
    wrap.appendChild(info);
    wrap.appendChild(results);
    wrap.appendChild(el("div", { className: "ls-row" }, [addBtn, moreBtn]));

    info.textContent = "Digite para pesquisar, ou clique em Buscar para ver os adicionados recentemente.";
    return wrap;
  }

  const load = async () => {
    if (loaded) return;
    loaded = true;
    setStatus("Carregando…");
    try {
      state = await fetchLeavingSoonSettings({ force: true });
      setStatus(state.initialized ? "" : "Modelo inicial criado — adicione títulos e ele será salvo automaticamente.");
      render();
    } catch (e) {
      loaded = false;
      setStatus(`Não foi possível carregar: ${e?.message || e}`, true);
    }
  };

  // Carrega só quando a aba é aberta pela primeira vez.
  const observer = new MutationObserver(() => {
    if (panel.style.display !== "none" && panel.isConnected) {
      void load();
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["style"] });
  setTimeout(() => {
    if (panel.isConnected && panel.style.display !== "none") void load();
  }, 0);

  return panel;
}
