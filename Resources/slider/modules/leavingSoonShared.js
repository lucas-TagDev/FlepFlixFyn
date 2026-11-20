// leavingSoonShared.js — dados da seção "Saindo do catálogo" (FlepFlixFyn)
import { withServer } from "./jfUrl.js";

const ENDPOINT = "/Plugins/JMSFusion/leaving-soon";
const CACHE_TTL_MS = 60_000;

export const LEAVING_SOON_DEFAULT_MESSAGES = Object.freeze([
  "Última semana para aproveitar",
  "Vai nos deixar em breve",
  "Últimos dias no catálogo",
  "Assista antes que saia"
]);

let __cache = null;
let __cacheAt = 0;
let __inflight = null;

function getToken() {
  try {
    return window.ApiClient?.accessToken?.() || window.ApiClient?._accessToken || "";
  } catch {
    return "";
  }
}

function getUserId() {
  try {
    return window.ApiClient?.getCurrentUserId?.() || window.ApiClient?._currentUserId || "";
  } catch {
    return "";
  }
}

function buildHeaders(json = false) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  const userId = getUserId();
  if (token) {
    headers["X-Emby-Token"] = token;
    headers.Authorization = `MediaBrowser Client="FlepFlixFyn", Token="${token}"`;
  }
  if (userId) headers["X-Emby-UserId"] = userId;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function readError(res) {
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function normalizeLeavingSoonSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const messages = Array.isArray(src.messages)
    ? src.messages.map((m) => String(m || "").trim()).filter(Boolean)
    : [];
  const sections = (Array.isArray(src.sections) ? src.sections : []).map((section, index) => ({
    id: String(section?.id || `s${index + 1}`),
    title: String(section?.title || "").trim(),
    itemTypes: String(section?.itemTypes || "Movie,Series"),
    enabled: section?.enabled !== false,
    items: (Array.isArray(section?.items) ? section.items : [])
      .filter((item) => item && item.itemId)
      .map((item) => ({
        itemId: String(item.itemId),
        name: String(item.name || ""),
        type: item.type ? String(item.type) : "",
        year: Number.isFinite(Number(item.year)) && Number(item.year) > 0 ? Number(item.year) : null,
        message: item.message ? String(item.message) : "",
        leaveDate: item.leaveDate ? String(item.leaveDate) : ""
      }))
  }));
  return {
    initialized: src.initialized === true,
    updatedAtUtc: Number(src.updatedAtUtc) || 0,
    messages: messages.length ? messages : LEAVING_SOON_DEFAULT_MESSAGES.slice(),
    sections
  };
}

export async function fetchLeavingSoonSettings({ force = false } = {}) {
  if (!force && __cache && (Date.now() - __cacheAt) < CACHE_TTL_MS) {
    return __cache;
  }
  if (!force && __inflight) return __inflight;

  __inflight = (async () => {
    const res = await fetch(withServer(`${ENDPOINT}?ts=${Date.now()}`), {
      method: "GET",
      cache: "no-store",
      headers: buildHeaders(false)
    });
    if (!res.ok) throw new Error(await readError(res));
    const payload = await res.json().catch(() => ({}));
    __cache = normalizeLeavingSoonSettings(payload?.settings);
    __cacheAt = Date.now();
    return __cache;
  })();

  try {
    return await __inflight;
  } finally {
    __inflight = null;
  }
}

export async function saveLeavingSoonSettings(settings) {
  const body = normalizeLeavingSoonSettings(settings);
  const res = await fetch(withServer(ENDPOINT), {
    method: "POST",
    cache: "no-store",
    headers: buildHeaders(true),
    body: JSON.stringify({
      messages: body.messages,
      sections: body.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          year: item.year || null,
          message: item.message || null,
          leaveDate: item.leaveDate || null
        }))
      }))
    })
  });
  if (!res.ok) throw new Error(await readError(res));
  const payload = await res.json().catch(() => ({}));
  __cache = normalizeLeavingSoonSettings(payload?.settings);
  __cacheAt = Date.now();
  try {
    window.dispatchEvent(new CustomEvent("jms:leaving-soon-updated", { detail: __cache }));
  } catch {}
  return __cache;
}

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Item ainda deve aparecer? (sem data, ou data de saída hoje ou no futuro) */
export function isLeavingSoonItemActive(item) {
  const date = String(item?.leaveDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  return date >= todayIso();
}

export function getActiveLeavingSoonSections(settings) {
  return (settings?.sections || [])
    .filter((section) => section.enabled !== false)
    .map((section) => ({
      ...section,
      items: section.items.filter(isLeavingSoonItemActive)
    }))
    .filter((section) => section.items.length > 0);
}

/** "Sai em 25/11" a partir de "2026-11-25" */
export function formatLeaveDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!m) return "";
  return `${m[3]}/${m[2]}`;
}

export function daysUntil(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}
