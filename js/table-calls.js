/* Batch 1b (382): call a waiter / ask for the bill from the table.
 * Only at a table whose scan said service_calls. A bell in the "Table N" card opens a sheet with
 * three choices; the card then shows what the server says about the table's calls
 * (oracy_table_calls_status_v1), read gently while a call is running. Nothing here can stop an order. */
const TABLE_CALL_KINDS = ["waiter", "bill", "other"];
const TABLE_CALL_POLL_MS = 12000;                     // the server asks for 10 s at the least
const TABLE_CALL_POLL_MAX_MS = 60000;                 // after errors
const TABLE_CALL_NOTE_MAX = 80;
const TABLE_CALL_QUIET_MS = 10 * 60 * 1000;           // after "Our staff have been told" the bell rests
/* The server's own words (shown as they are, with Arabic). */
const TABLE_CALL_OFF_EN = "Calling staff is not available here. Please ask our staff.";
const TABLE_CALL_TOLD_EN = "Our staff have been told. Please wait a moment.";
const TABLE_CALL_WRITE_EN = "Please write what you need.";
const TABLE_CALL_TEXT = {
  en: {
    bell: "Call",
    bellLabel: "Call staff",
    sheetTitle: "How can we help?",
    waiter: "Call waiter",
    waiterSub: "Someone will come to your table.",
    bill: "Ask for the bill",
    billSub: "We will bring it to your table.",
    other: "Something else",
    otherSub: "Tell us what you need.",
    otherPlaceholder: "e.g. extra plates, water",
    send: "Send",
    close: "Close",
    cancel: "Cancel request",
    again: "Tap to call again",
    waiterOpen: "Waiter called",
    waiterSeen: "Waiter is on the way",
    billOpen: "Bill requested",
    billSeen: "Your bill is on the way",
    otherOpen: "Request sent",
    otherSeen: "We are on it",
    justNow: "just now",
    mins: "{n} min",
    calledAgain: "Called again",
    already: "Our staff already know.",
    alreadyIn: "Our staff already know. You can call again in {n} min.",
    cancelled: "Request cancelled",
    failed: "Could not reach our staff. Please try again.",
    off: TABLE_CALL_OFF_EN,
    told: TABLE_CALL_TOLD_EN,
    write: TABLE_CALL_WRITE_EN,
  },
  ar: {
    bell: "نداء",
    bellLabel: "نداء الموظف",
    sheetTitle: "كيف نخدمك؟",
    waiter: "نداء النادل",
    waiterSub: "سيأتي أحد موظفينا إلى طاولتك.",
    bill: "طلب الفاتورة",
    billSub: "سنحضرها إلى طاولتك.",
    other: "شيء آخر",
    otherSub: "أخبرنا بما تحتاجه.",
    otherPlaceholder: "مثال: أطباق إضافية، ماء",
    send: "إرسال",
    close: "إغلاق",
    cancel: "إلغاء النداء",
    again: "اضغط للنداء مرة أخرى",
    waiterOpen: "تم نداء النادل",
    waiterSeen: "النادل في الطريق",
    billOpen: "تم طلب الفاتورة",
    billSeen: "فاتورتك في الطريق",
    otherOpen: "تم إرسال طلبك",
    otherSeen: "نعمل على طلبك",
    justNow: "الآن",
    mins: "{n} د",
    calledAgain: "تم النداء مرة أخرى",
    already: "موظفونا على علم بذلك.",
    alreadyIn: "موظفونا على علم بذلك. يمكنك النداء مجدداً بعد {n} د.",
    cancelled: "تم إلغاء النداء",
    failed: "تعذر الوصول إلى موظفينا. حاول مرة أخرى.",
    off: "نداء الموظف غير متاح هنا. يرجى سؤال أحد موظفينا.",
    told: "تم إبلاغ موظفينا. يرجى الانتظار قليلاً.",
    write: "يرجى كتابة ما تحتاجه.",
  },
};
const tableCalls = {key: "", calls: [], sending: false, timer: null, delay: TABLE_CALL_POLL_MS, reading: null,
  quietUntil: 0, open: false, other: false, note: "", error: "", watching: false};

function tableCallText(key, vars = {}) {
  const lang = typeof state !== "undefined" && state.lang === "ar" ? "ar" : "en";
  return String(TABLE_CALL_TEXT[lang][key] ?? TABLE_CALL_TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}
function tableCallNoteClean(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, TABLE_CALL_NOTE_MAX).trim() : "";
}
/** The server's clock, as far as the app knows it (the ordering-hours answer measured the difference). */
function tableCallsNow() {
  return Date.now() + (typeof orderingHours !== "undefined" && Number.isFinite(orderingHours.skew) ? orderingHours.skew : 0);
}
/** The table whose staff can be called, or null. Another table = a clean start. */
function tableCallsOn() {
  const table = typeof tableActive === "function" ? tableActive() : null;
  if (!table || table.serviceCalls !== true) { if (tableCalls.key) tableCallsReset(); return null; }
  if (tableCalls.key !== table.key) { tableCallsReset(); tableCalls.key = table.key; }
  return Date.now() < tableCalls.quietUntil ? null : table;
}
/** True while the visitor is still at the table an answer was asked for. */
function tableCallsSame(table) {
  const now = tableCallsOn();
  return !!now && now.key === table.key;
}
function tableCallsReset() {
  if (tableCalls.timer) clearTimeout(tableCalls.timer);
  Object.assign(tableCalls, {key: "", calls: [], sending: false, timer: null, delay: TABLE_CALL_POLL_MS, reading: null,
    quietUntil: 0, other: false, note: "", error: ""});
  tableCallsClose();
}
/** Only what the contract names is kept from the server's answer; everything drawn is escaped as well. */
function tableCallTidy(row) {
  if (!row || typeof row !== "object" || !TABLE_CALL_KINDS.includes(row.kind) || !["open", "seen", "done"].includes(row.status)) return null;
  const at = Date.parse(row.created_at || "");
  return {kind: row.kind, status: row.status, at: Number.isFinite(at) ? at : null, mine: row.mine === true,
    id: row.mine === true && typeof isMenuId === "function" && isMenuId(row.id) ? row.id : null,
    note: row.mine === true ? tableCallNoteClean(row.note) : ""};
}
function tableCallsRunning() {
  return tableCalls.calls.filter(call => call.status === "open" || call.status === "seen");
}
function tableCallRunning(kind) { return tableCallsRunning().find(call => call.kind === kind) || null; }
/** "Waiter called · 1 min" / "Waiter is on the way". */
function tableCallStateText(call) {
  if (call.status === "seen") return tableCallText(`${call.kind}Seen`);
  const minutes = call.at === null ? 0 : Math.max(0, Math.floor((tableCallsNow() - call.at) / 60000));
  return `${tableCallText(`${call.kind}Open`)} · ${minutes < 1 ? tableCallText("justNow") : tableCallText("mins", {n: Math.min(minutes, 99)})}`;
}
const TABLE_BELL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4M12 3v2"></path></svg>`;
const TABLE_BILL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"></path></svg>`;
const TABLE_CHAT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4zM8 9h8M8 12.5h5"></path></svg>`;
/** The bell in the "Table N" card ("" when staff cannot be called from here). */
function tableCallsBellMarkup() {
  if (!tableCallsOn()) return "";
  const busy = tableCallsRunning().length > 0;
  return `<button type="button" class="table-call-bell${busy ? " on" : ""}" onclick="tableCallsOpen()" aria-haspopup="dialog"
    aria-label="${escapeHtml(tableCallText("bellLabel"))}">${TABLE_BELL_ICON}<span>${escapeHtml(tableCallText("bell"))}</span></button>`;
}
function tableCallsStateInner() {
  return tableCallsRunning().map(call => `<span class="table-call-state table-call-${call.status}" role="status">
    <i aria-hidden="true"></i>${escapeHtml(tableCallStateText(call))}</span>`).join("");
}
/** The line under the table's name; empty (and hidden by the stylesheet) while nothing is running. */
function tableCallsStateMarkup() {
  return tableCallsOn() ? `<div class="table-call-states" data-table-calls>${tableCallsStateInner()}</div>` : "";
}
/** Puts the newest state into the cards that are on the screen, without redrawing the screen. */
function tableCallsPaint() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  const on = !!tableCallsOn();
  const boxes = document.querySelectorAll("[data-table-calls]");
  const bells = document.querySelectorAll(".table-call-bell");
  if ((on && !bells.length) || (!on && (bells.length || boxes.length))) { if (typeof tableRedraw === "function") tableRedraw(); }
  else {
    const inner = tableCallsStateInner(), busy = tableCallsRunning().length > 0;
    boxes.forEach(box => { if (box.innerHTML !== inner) box.innerHTML = inner; });
    bells.forEach(bell => { if (bell.classList) bell.classList.toggle("on", busy); });
  }
  if (!on) tableCallsClose();
  else tableCallsSheetPaint();
}
/* ---- reading the state ---- */
function tableCallsHidden() { return typeof document !== "undefined" && document.hidden === true; }
function tableCallsPlan() {
  if (tableCalls.timer) { clearTimeout(tableCalls.timer); tableCalls.timer = null; }
  if (!tableCallsOn() || tableCallsHidden() || !tableCallsRunning().length) return;   // nothing to watch: no reading
  tableCalls.timer = setTimeout(() => { tableCalls.timer = null; tableCallsRefresh(); }, tableCalls.delay);
}
/** One read of the table's calls. Never throws; an error only makes the next read later. */
async function tableCallsRefresh() {
  const table = tableCallsOn();
  if (!table || tableCallsHidden()) return;
  if (tableCalls.reading) return tableCalls.reading;
  tableCalls.reading = (async () => {
    try {
      const answer = await customerOrderRpc("oracy_table_calls_status_v1", {p_key: table.key, p_guest_id: tableGuestId()});
      if (!tableCallsSame(table)) return;                       // another table, or none, meanwhile
      if (answer && answer.ok === true && Array.isArray(answer.calls)) {
        tableCalls.calls = answer.calls.map(tableCallTidy).filter(Boolean).slice(0, 12);
        tableCalls.delay = TABLE_CALL_POLL_MS;
      } else {
        // {ok:false}: the server does not know the sticker just now. Nothing is shown, nothing is ended here.
        tableCalls.calls = [];
        tableCalls.delay = TABLE_CALL_POLL_MAX_MS;
      }
    } catch (error) {
      if (error && (error.status === 404 || error.code === "PGRST202")) { tableCallsSwitchOff(); return; }
      tableCalls.delay = Math.min(TABLE_CALL_POLL_MAX_MS, tableCalls.delay * 2);
      if (tableCallsRunning().length && !tableCalls.timer && !tableCallsHidden()) {
        tableCalls.timer = setTimeout(() => { tableCalls.timer = null; tableCallsRefresh(); }, tableCalls.delay);
      }
      return;
    } finally { tableCalls.reading = null; }
    tableCallsPaint();
    tableCallsPlan();
  })();
  return tableCalls.reading;
}
/** Start-up, a new scan, the tab coming back, the network coming back: one read, then as planned. */
function tableCallsStart() {
  if (!tableCalls.watching && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    tableCalls.watching = true;
    document.addEventListener("visibilitychange", () => { if (tableCallsHidden()) tableCallsPlan(); else tableCallsRefresh(); });
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", () => { tableCallsRefresh(); });
      window.addEventListener("popstate", () => { tableCallsClose(); });   // the phone's Back closes the sheet
    }
  }
  return tableCallsRefresh();
}
/** The restaurant switched calling off (or the server has no such function): the bell goes, quietly. */
function tableCallsSwitchOff() {
  const table = typeof tableMode !== "undefined" ? tableMode.table : null;
  if (table) { table.serviceCalls = false; if (typeof tableStore === "function") tableStore(); }
  tableCallsReset();
  if (typeof tableRedraw === "function") tableRedraw();
}
/* ---- the sheet ---- */
function tableCallsHost() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
  return document.querySelector(".phone") || document.body || null;
}
function tableCallsSheetInner() {
  const table = tableCallsOn();
  if (!table) return "";
  const row = (kind, icon) => {
    const running = tableCallRunning(kind);
    const title = running ? tableCallStateText(running) : tableCallText(kind);
    const sub = running ? tableCallText("again") : tableCallText(`${kind}Sub`);
    const tap = kind === "other" && !running ? "tableCallOther()" : `tableCallSend('${kind}')`;
    return `<div class="table-call-row${running ? ` running table-call-${running.status}` : ""}">
      <button type="button" class="table-call-choice" onclick="${tap}" ${tableCalls.sending ? "disabled" : ""}>
        <span class="table-call-icon">${icon}</span>
        <span class="table-call-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(sub)}</small>
          ${running && running.note ? `<em><bdi>${escapeHtml(running.note)}</bdi></em>` : ""}</span>
      </button>
      ${running && running.mine && running.id ? `<button type="button" class="table-call-cancel" onclick="tableCallCancel('${escapeHtml(running.id)}')" ${tableCalls.sending ? "disabled" : ""}>${escapeHtml(tableCallText("cancel"))}</button>` : ""}
    </div>`;
  };
  const other = tableCalls.other && !tableCallRunning("other") ? `<div class="table-call-other">
      <input class="field table-call-note${tableCalls.error ? " invalid" : ""}" id="tableCallNote" type="text" maxlength="${TABLE_CALL_NOTE_MAX}" dir="auto"
        enterkeyhint="send" autocomplete="off" placeholder="${escapeHtml(tableCallText("otherPlaceholder"))}" aria-label="${escapeHtml(tableCallText("otherSub"))}"
        value="${escapeHtml(tableCalls.note)}" oninput="tableCallNoteInput(this.value)" onkeydown="if(event.key==='Enter')tableCallSend('other')" />
      <button type="button" class="btn btn-primary table-call-send" onclick="tableCallSend('other')" ${tableCalls.sending ? "disabled" : ""}>${escapeHtml(tableCallText("send"))}</button>
      ${tableCalls.error ? `<p class="table-call-error" role="alert">${escapeHtml(tableCalls.error)}</p>` : ""}
    </div>` : "";
  return `<button type="button" class="cx-sheet-backdrop" onclick="tableCallsClose()" aria-label="${escapeHtml(tableCallText("close"))}"></button>
    <div class="cx-sheet-panel table-call-panel">
      <div class="cx-sheet-grip" aria-hidden="true"></div>
      <div class="table-call-head"><h3 id="tableCallTitle">${escapeHtml(tableCallText("sheetTitle"))}</h3>
        <span>${typeof tableNameHtml === "function" ? tableNameHtml(table.label) : ""}</span></div>
      <div class="table-call-list">${row("waiter", TABLE_BELL_ICON)}${row("bill", TABLE_BILL_ICON)}${row("other", TABLE_CHAT_ICON)}${other}</div>
    </div>`;
}
function tableCallsSheetNode() {
  return typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("tableCallSheet") : null;
}
/** Redraws the open sheet; a text being typed is left alone. */
function tableCallsSheetPaint(force) {
  const node = tableCallsSheetNode();
  if (!node || !tableCalls.open) return;
  const typing = typeof document !== "undefined" && document.activeElement && document.activeElement.id === "tableCallNote";
  if (typing && !force) return;
  node.innerHTML = tableCallsSheetInner();
  if (typing || (force === "focus")) { const field = document.getElementById("tableCallNote"); if (field && typeof field.focus === "function") field.focus(); }
}
function tableCallsOpen() {
  if (!tableCallsOn()) return;
  tableCalls.open = true;
  tableCalls.error = "";
  const host = tableCallsHost();
  if (host && !tableCallsSheetNode() && typeof document.createElement === "function") {
    const node = document.createElement("div");
    node.id = "tableCallSheet";
    node.className = "cx-sheet table-call-sheet";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-labelledby", "tableCallTitle");
    node.innerHTML = tableCallsSheetInner();
    host.appendChild(node);
  } else tableCallsSheetPaint(true);
  tableCallsRefresh();                                          // the sheet opens on what is true now
}
function tableCallsClose() {
  tableCalls.open = false;
  tableCalls.other = false;
  tableCalls.error = "";
  const node = tableCallsSheetNode();
  if (node && typeof node.remove === "function") node.remove();
}
function tableCallOther() {
  tableCalls.other = true;
  tableCalls.error = "";
  tableCallsSheetPaint("focus");
}
function tableCallNoteInput(value) {
  tableCalls.note = String(value ?? "").slice(0, TABLE_CALL_NOTE_MAX);
  if (!tableCalls.error) return;
  tableCalls.error = "";
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  const note = document.querySelector(".table-call-error");
  if (note && typeof note.remove === "function") note.remove();
  const field = document.getElementById("tableCallNote");
  if (field && field.classList) field.classList.remove("invalid");
}
function tableCallToast(text, duration = 4200) { if (typeof toast === "function") toast(text, duration); }
function tableCallBuzz() {
  try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12); } catch (_) {}
}
/** Sends one call. kind = "waiter" | "bill" | "other". A second tap while one is on its way does nothing. */
async function tableCallSend(kind) {
  const table = tableCallsOn();
  if (!table || tableCalls.sending || !TABLE_CALL_KINDS.includes(kind)) return;
  const running = tableCallRunning(kind);
  const note = kind === "other" && !running ? tableCallNoteClean(tableCalls.note) : "";
  if (kind === "other" && !running && note.length < 2) {
    tableCalls.other = true;
    tableCalls.error = tableCallText("write");
    tableCallsSheetPaint("focus");
    return;
  }
  tableCalls.sending = true;
  tableCallsSheetPaint(true);
  try {
    const answer = await customerOrderRpc("oracy_table_call_v1", {p_key: table.key,
      p_request: {kind, guest_id: tableGuestId(), ...(note ? {note} : {})}});
    if (!tableCallsSame(table)) return;
    const call = tableCallTidy(answer && answer.ok === true ? answer.call : null);
    if (!call) throw new Error("");
    tableCalls.calls = [call, ...tableCalls.calls.filter(row => row.kind !== call.kind || row.status === "done")];
    tableCalls.delay = TABLE_CALL_POLL_MS;
    tableCalls.note = ""; tableCalls.other = false; tableCalls.error = "";
    if (answer.rang === true) {
      tableCallBuzz();
      tableCallToast(Number(answer.call.rings) > 1 ? tableCallText("calledAgain") : tableCallText(`${call.kind}Open`), 3200);
    } else {
      const wait = Math.ceil((Date.parse(answer.next_ring_at || "") - tableCallsNow()) / 60000);
      tableCallToast(Number.isFinite(wait) && wait > 0 ? tableCallText("alreadyIn", {n: Math.min(wait, 99)}) : tableCallText("already"));
    }
    tableCallsClose();
  } catch (error) {
    tableCallRefused(error);
  } finally {
    tableCalls.sending = false;
    tableCallsPaint();
    tableCallsPlan();
  }
}
/** What the server (or the network) said instead of taking the call. */
function tableCallRefused(error) {
  const text = String((error && error.message) || "");
  if (error && (error.status === 404 || error.code === "PGRST202")) return tableCallsSwitchOff();   // a server without calls: no words
  if (typeof tableRefused === "function" && tableRefused(text)) {                                  // the sticker is not active any more
    tableCallsReset();
    if (typeof tableNotice === "function") tableNotice();
    if (typeof tableRedraw === "function") tableRedraw();
    return;
  }
  if (text === TABLE_CALL_OFF_EN) { tableCallToast(tableCallText("off"), 6000); return tableCallsSwitchOff(); }
  if (text === TABLE_CALL_TOLD_EN) {
    // Muted by staff, or a limit: the staff know. The bell rests for a while instead of inviting more taps.
    tableCalls.quietUntil = Date.now() + TABLE_CALL_QUIET_MS;
    tableCallsClose();
    tableCallToast(tableCallText("told"), 6000);
    if (typeof tableRedraw === "function") tableRedraw();
    return;
  }
  if (text === TABLE_CALL_WRITE_EN) { tableCalls.other = true; tableCalls.error = tableCallText("write"); tableCallsSheetPaint("focus"); return; }
  tableCallToast(tableCallText("failed"), 5000);
}
async function tableCallCancel(id) {
  const table = tableCallsOn();
  if (!table || tableCalls.sending || typeof isMenuId !== "function" || !isMenuId(id)) return;
  tableCalls.sending = true;
  tableCallsSheetPaint(true);
  try {
    await customerOrderRpc("oracy_table_call_cancel_v1", {p_key: table.key, p_call_id: id, p_guest_id: tableGuestId()});
    if (!tableCallsSame(table)) return;
    tableCalls.calls = tableCalls.calls.filter(row => row.id !== id);
    tableCallToast(tableCallText("cancelled"), 2600);
    tableCallsClose();
  } catch (error) {
    // Already closed by staff, or not this device's: read what is true instead of guessing.
    if (error && (error.status === 404 || error.code === "PGRST202")) tableCallsSwitchOff();
    else if (!(error && error.status)) tableCallToast(tableCallText("failed"), 5000);
  } finally {
    tableCalls.sending = false;
    tableCallsPaint();
    tableCallsRefresh();
  }
}

if (typeof window !== "undefined") {
  Object.assign(window, {tableCallsOpen, tableCallsClose, tableCallOther, tableCallNoteInput, tableCallSend, tableCallCancel});
}
