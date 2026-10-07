/* Batch 1b (379): the order note ("Cooking instructions").
 * One note for the whole order, typed in the cart, sent as order_note with every order type and
 * shown back on the order's cards from the server's answer. The server cleans and cuts it too.
 * "Add more items" is not touched by this file: that flow keeps its notes per line. */
const ORDER_NOTE_MAX = 300;
const ORDER_NOTE_COUNT_FROM = 240;                    // the counter appears near the limit
const ORDER_NOTE_KEEP_MS = 24 * 60 * 60 * 1000;       // "Note: ..." stays on an order card for a day
function orderNoteCopy(en, ar) { return typeof state !== "undefined" && state.lang === "ar" ? ar : en; }
/** As the server cleans it: control, line-break and invisible characters become one space; at most 300. */
function orderNoteClean(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, ORDER_NOTE_MAX).trim();
}
function orderNoteCountText(length) {
  return length >= ORDER_NOTE_COUNT_FROM ? `${Math.min(length, ORDER_NOTE_MAX)}/${ORDER_NOTE_MAX}` : "";
}
/** The field grows with a long note (2 to 9 lines) so the text is read without scrolling inside it. */
function orderNoteRows(value) { return Math.max(2, Math.min(9, Math.ceil(String(value || "").length / 34))); }
/** The field in the cart. Typing never redraws the screen; only the counter is touched. */
function orderNoteFieldMarkup() {
  const value = String(state.notes || "").slice(0, ORDER_NOTE_MAX);
  const count = orderNoteCountText(value.length);
  return `<div class="order-note-field">
    <label class="order-note-label" for="orderNoteInput"><span>${escapeHtml(t("cookingNotes"))}</span>
      <small>${orderNoteCopy("Optional", "اختياري")}</small></label>
    <textarea class="field order-note-input" id="orderNoteInput" rows="${orderNoteRows(value)}" maxlength="${ORDER_NOTE_MAX}" dir="auto"
      enterkeyhint="done" placeholder="${orderNoteCopy("Less spicy, no onions", "أقل حرارة، بدون بصل")}"
      oninput="orderNoteInput(this)">${escapeHtml(value)}</textarea>
    <span class="order-note-count${value.length >= ORDER_NOTE_MAX ? " full" : ""}" id="orderNoteCount" aria-live="polite" ${count ? "" : "hidden"}>${count}</span>
  </div>`;
}
function orderNoteInput(field) {
  const value = String(field && field.value != null ? field.value : "").slice(0, ORDER_NOTE_MAX);
  if (field && field.value !== value) field.value = value;      // a paste longer than the limit
  state.notes = value;
  if (field && "rows" in field) field.rows = orderNoteRows(value);
  if (field && field.style && field.scrollHeight) {             // exactly as tall as the text, where the browser can say
    field.rows = 2;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const counter = document.getElementById("orderNoteCount");
  if (!counter) return;
  const text = orderNoteCountText(value.length);
  counter.textContent = text;
  counter.hidden = !text;
  if (counter.classList) counter.classList.toggle("full", value.length >= ORDER_NOTE_MAX);
}
/* The signed-in Orders screen knows an order only by its id (the server's list has no note):
 * the note the server saved is kept on this device for a day. Only the id and the note. */
function orderNoteList() {
  try {
    const list = JSON.parse(localStorage.getItem(appStorageKey("order-notes")) || "[]");
    return (Array.isArray(list) ? list : []).filter(row => row && isMenuId(row.id) && orderNoteClean(row.note) &&
      Number.isFinite(row.at) && Math.abs(Date.now() - row.at) < ORDER_NOTE_KEEP_MS).slice(0, 12);
  } catch (_) { return []; }
}
function orderNoteRemember(id, note) {
  const clean = orderNoteClean(note);
  if (!isMenuId(id) || !clean) return;
  try {
    const list = [{id, note: clean, at: Date.now()}, ...orderNoteList().filter(row => row.id !== id)].slice(0, 12);
    localStorage.setItem(appStorageKey("order-notes"), JSON.stringify(list));
  } catch (_) {}
}
/** "Note: Less spicy" for an order card (escaped), or "". note = what the order itself carries, when it does. */
function orderNoteMarkup(id, note) {
  const own = orderNoteClean(note) || orderNoteClean(orderNoteList().find(row => row.id === id)?.note);
  return own ? `<p class="order-note"><strong>${orderNoteCopy("Note:", "ملاحظة:")}</strong> <bdi>${escapeHtml(own)}</bdi></p>` : "";
}
if (typeof window !== "undefined") window.orderNoteInput = orderNoteInput;
