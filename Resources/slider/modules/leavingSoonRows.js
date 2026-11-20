// leavingSoonRows.js — seções "Saindo do catálogo" na página inicial (FlepFlixFyn, por lucas-TagDev)
import { getSessionInfo, makeApiRequest } from "../../Plugins/JMSFusion/runtime/api.js";
import { getConfig, getHomeSectionsRuntimeConfig } from "./config.js";
import { withServer } from "./jfUrl.js";
import { faIconHtml } from "./faIcons.js";
import { openDetailsModal } from "./detailsModalLoader.js";
import { resolveManagedCardTitleRender, setupScroller } from "./personalRecommendations.js";
import { getActiveHomePageEl, bindManagedSectionsBelowNative } from "./homeSectionNative.js";
import { enqueueManagedSectionRender } from "./homeSectionChain.js";
import {
  daysUntil,
  fetchLeavingSoonSettings,
  formatLeaveDate,
  getActiveLeavingSoonSections
} from "./leavingSoonShared.js";

const SECTION_PREFIX = "leaving-soon-rows--";
const DONE_EVENT = "jms:leaving-soon-rows-done";
const ITEM_FIELDS = "ProductionYear,Genres,OfficialRating,CommunityRating,RunTimeTicks,CumulativeRunTimeTicks";

let __mountSeq = 0;

function setDone(value) {
  try { window.__jmsLeavingSoonRowsDone = value === true; } catch {}
  if (value === true) {
    try { window.dispatchEvent(new CustomEvent(DONE_EVENT)); } catch {}
    try { document.dispatchEvent(new CustomEvent(DONE_EVENT)); } catch {}
  }
}

function isHomeRoute() {
  const h = String(window.location.hash || "").toLowerCase();
  return h.startsWith("#/home") || h.startsWith("#/index") || h === "" || h === "#";
}

function resolveMountState() {
  const page =
    getActiveHomePageEl?.() ||
    document.querySelector("#indexPage:not(.hide)") ||
    document.querySelector("#homePage:not(.hide)") ||
    null;
  const container = page?.querySelector?.(".homeSectionsContainer") || null;
  return { page, container };
}

function getRenderedSections(root = document) {
  return Array.from(root.querySelectorAll(`[id^="${SECTION_PREFIX}"]`)).filter((el) => el.isConnected);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureStyles() {
  if (document.getElementById("jms-leaving-soon-rows-style")) return;
  const style = document.createElement("style");
  style.id = "jms-leaving-soon-rows-style";
  style.textContent = `
    .leaving-soon-section .ls-card-badge {
      position: absolute; left: 0; right: 0; top: 0; z-index: 3;
      display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
      padding: 8px 8px 18px;
      background: linear-gradient(180deg, rgba(10,6,24,.88) 0%, rgba(10,6,24,.55) 60%, rgba(10,6,24,0) 100%);
      pointer-events: none;
    }
    .leaving-soon-section .ls-card-badge-msg {
      display: inline-flex; align-items: center; gap: 5px; max-width: 100%;
      padding: 4px 9px; border-radius: 999px;
      background: linear-gradient(135deg, #7a5cff 0%, #b04bff 100%);
      color: #fff; font-weight: 700; font-size: .78em; line-height: 1.2;
      box-shadow: 0 2px 10px rgba(122,92,255,.45);
      border-radius: 10px; overflow: hidden;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    }
    .leaving-soon-section .ls-card-badge-date {
      padding: 2px 8px; border-radius: 6px; background: rgba(0,0,0,.6);
      color: #fff; font-size: .72em; font-weight: 600;
    }
    .leaving-soon-section .ls-card-badge-date.is-urgent { background: rgba(220,38,38,.85); }
    .leaving-soon-section .ls-title-icon { margin-right: .4em; color: #9978ff; }
  `;
  document.head.appendChild(style);
}

function buildPosterUrl(item) {
  const tag = item?.ImageTags?.Primary;
  const qs = ["maxWidth=540", "quality=72", "EnableImageEnhancers=false"];
  if (tag) qs.unshift(`tag=${encodeURIComponent(tag)}`);
  return withServer(`/Items/${item.Id}/Images/Primary?${qs.join("&")}`);
}

function buildBadge(entry) {
  const message = String(entry?.message || "").trim();
  const date = String(entry?.leaveDate || "").trim();
  const days = daysUntil(date);
  let dateText = "";
  if (days !== null) {
    if (days <= 0) dateText = "Sai hoje";
    else if (days === 1) dateText = "Sai amanhã";
    else dateText = `Sai em ${formatLeaveDate(date)}`;
  }
  if (!message && !dateText) return "";
  return `
    <div class="ls-card-badge">
      ${message ? `<span class="ls-card-badge-msg" title="${escapeHtml(message)}">⏳ ${escapeHtml(message)}</span>` : ""}
      ${dateText ? `<span class="ls-card-badge-date${days !== null && days <= 7 ? " is-urgent" : ""}">${escapeHtml(dateText)}</span>` : ""}
    </div>
  `;
}

function createCard(item, entry, serverId, aboveFold) {
  const card = document.createElement("div");
  card.className = "card personal-recs-card leaving-soon-card";
  card.dataset.itemId = item.Id;
  card.setAttribute("role", "listitem");

  const name = item.Name || entry?.name || "";
  const year = item.ProductionYear || "";
  const typeIsSeries = item.Type === "Series";
  const typeLabel = typeIsSeries ? "Série" : "Filme";
  const genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 2).join(", ") : "";
  const rating = Number.isFinite(item.CommunityRating)
    ? `<div class="community-rating" title="Community Rating">⭐ ${item.CommunityRating.toFixed(1)}</div>`
    : "";
  const logoTag = item?.ImageTags?.Logo;
  const titleRender = resolveManagedCardTitleRender({
    titleText: name,
    logoUrl: logoTag
      ? withServer(`/Items/${item.Id}/Images/Logo?tag=${encodeURIComponent(logoTag)}&maxWidth=220&quality=80`)
      : "",
    logoAltText: `${name} logo`,
    aboveFold,
    maxTitleLength: 42
  });
  const href = `#/details?id=${encodeURIComponent(item.Id)}&serverId=${encodeURIComponent(serverId || "")}`;

  card.innerHTML = `
    <div class="cardBox">
      <a class="cardLink" href="${href}">
        <div class="cardImageContainer" style="position:relative">
          <img class="cardImage" alt="${escapeHtml(name)}" loading="${aboveFold ? "eager" : "lazy"}" decoding="async">
          ${buildBadge(entry)}
          <div class="prc-top-badges" style="top:auto;bottom:62px">
            ${rating}
            <div class="prc-type-badge">${faIconHtml(typeIsSeries ? "tv" : "film", "prc-type-icon")} ${typeLabel}</div>
          </div>
          <div class="prc-gradient"></div>
          <div class="prc-overlay">
            ${titleRender.html}
            <div class="prc-meta">${year ? `<span class="prc-year">${year}</span>` : ""}</div>
            ${genres ? `<div class="prc-genres">${escapeHtml(genres)}</div>` : ""}
          </div>
        </div>
      </a>
    </div>
  `;

  const logoImg = card.querySelector(".prc-card-logo img");
  logoImg?.addEventListener("error", () => logoImg.closest(".prc-card-logo")?.remove(), { once: true });

  const img = card.querySelector(".cardImage");
  img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });
  img.src = buildPosterUrl(item);

  const link = card.querySelector(".cardLink");
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await openDetailsModal({
        itemId: item.Id,
        serverId,
        preferBackdropIndex: localStorage.getItem("jms_backdrop_index") || "0",
        originEl: img,
        originEvent: e
      });
    } catch {
      window.location.hash = href.slice(1);
    }
  });
  return card;
}

function buildSection(section, index) {
  const el = document.createElement("section");
  el.id = `${SECTION_PREFIX}${index}`;
  el.className = "homeSection recent-row-section dir-row-section leaving-soon-section";
  el.dataset.leavingSoonSection = section.id;

  const title = document.createElement("div");
  title.className = "sectionTitleContainer sectionTitleContainer-cards";
  title.innerHTML = `
    <h2 class="sectionTitle sectionTitle-cards dir-row-title">
      <span class="dir-row-title-text"><span class="ls-title-icon">⏳</span>${escapeHtml(section.title || "Saindo do catálogo")}</span>
    </h2>
  `;

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "personal-recs-scroll-wrap";
  scrollWrap.style.position = "relative";

  const arrow = (dir) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `hub-scroll-btn hub-scroll-${dir}`;
    btn.setAttribute("aria-label", dir === "left" ? "Rolar para a esquerda" : "Rolar para a direita");
    btn.innerHTML = dir === "left"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>`;
    return btn;
  };

  const row = document.createElement("div");
  row.className = "itemsContainer personal-recs-row";
  row.setAttribute("role", "list");

  scrollWrap.append(arrow("left"), row, arrow("right"));
  el.append(title, scrollWrap);
  return { el, row };
}

async function fetchItems(ids, userId) {
  if (!ids.length || !userId) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const params = new URLSearchParams({
      Ids: chunk.join(","),
      Fields: ITEM_FIELDS,
      EnableImageTypes: "Primary,Logo",
      ImageTypeLimit: "1",
      EnableUserData: "false"
    });
    const data = await makeApiRequest(`/Users/${userId}/Items?${params.toString()}`);
    for (const item of (Array.isArray(data?.Items) ? data.Items : [])) {
      if (item?.Id) out.set(String(item.Id).replace(/-/g, "").toLowerCase(), item);
    }
  }
  return out;
}

async function renderInto(container, sections) {
  const { userId, serverId } = getSessionInfo();
  const allIds = [...new Set(sections.flatMap((s) => s.items.map((i) => i.itemId)))];
  const byId = await fetchItems(allIds, userId);

  getRenderedSections(container).forEach((el) => el.remove());

  let rendered = 0;
  sections.forEach((section) => {
    const allowed = new Set(String(section.itemTypes || "Movie,Series").split(","));
    const cards = section.items
      .map((entry) => ({ entry, item: byId.get(String(entry.itemId).replace(/-/g, "").toLowerCase()) }))
      .filter(({ item }) => item && allowed.has(item.Type));
    if (!cards.length) return;

    const { el, row } = buildSection(section, rendered);
    cards.forEach(({ entry, item }, index) => row.appendChild(createCard(item, entry, serverId, index < 6)));
    container.appendChild(el);
    try { setupScroller(row); } catch {}
    rendered += 1;
  });

  if (rendered) {
    try { bindManagedSectionsBelowNative(container); } catch {}
    try { container.__jmsManagedBelowNativeSchedule?.(); } catch {}
  }
  return rendered;
}

export function cleanupLeavingSoonRows() {
  __mountSeq += 1;
  __inflightMount = null;
  getRenderedSections().forEach((el) => el.remove());
  setDone(false);
}

let __inflightMount = null;

export function mountLeavingSoonRowsLazy(options = {}) {
  if (__inflightMount && options?.force !== true) return __inflightMount;
  const run = mountLeavingSoonRowsInternal(options);
  __inflightMount = run;
  run.finally(() => {
    if (__inflightMount === run) __inflightMount = null;
  }).catch(() => {});
  return run;
}

async function mountLeavingSoonRowsInternal({ force = false } = {}) {
  const cfg = getConfig?.() || {};
  const runtime = getHomeSectionsRuntimeConfig(cfg);
  const mount = resolveMountState();
  // Mantém a ordenação/ocultação das seções ativa mesmo sem conteúdo nesta seção.
  if (runtime.masterEnabled !== false && mount.container && isHomeRoute()) {
    try { bindManagedSectionsBelowNative(mount.container); } catch {}
  }

  if (runtime.enableLeavingSoonRows === false) {
    cleanupLeavingSoonRows();
    setDone(true);
    return false;
  }

  const seq = ++__mountSeq;
  if (!mount.container || !isHomeRoute()) return false;

  if (!force && getRenderedSections(mount.container).length) {
    setDone(true);
    return true;
  }

  setDone(false);
  let sections = [];
  try {
    sections = getActiveLeavingSoonSections(await fetchLeavingSoonSettings());
  } catch (e) {
    console.warn("leavingSoonRows: falha ao carregar configurações:", e);
  }
  if (seq !== __mountSeq) return false;

  if (!sections.length) {
    getRenderedSections(mount.container).forEach((el) => el.remove());
    setDone(true);
    return false;
  }

  ensureStyles();
  try {
    return await enqueueManagedSectionRender("leavingSoonRows", async () => {
      try {
        const current = resolveMountState();
        if (seq !== __mountSeq || !current.container?.isConnected) return false;
        const count = await renderInto(current.container, sections);
        return count > 0;
      } catch (e) {
        console.warn("leavingSoonRows: falha ao renderizar:", e);
        return false;
      } finally {
        if (seq === __mountSeq) setDone(true);
      }
    }, {
      timeoutMs: 15000,
      force,
      getAnchor: () => {
        const list = getRenderedSections();
        return list.length ? list[list.length - 1] : null;
      },
      isStillValid: () => seq === __mountSeq && !!resolveMountState().container?.isConnected
    });
  } finally {
    if (seq === __mountSeq && window.__jmsLeavingSoonRowsDone !== true) setDone(true);
  }
}
