/*
 * Mesa Norte — floating chat widget for restaurant reservations.
 * Self-contained so it can be dropped onto any page with one <script> tag.
 */
(function (global) {
  "use strict";

  const SESSION_KEY = "mesanorte_session";

  const defaults = {
    apiEndpoint: "/api/chat",
    healthEndpoint: "/api/health",
    brandName: "Mesa Norte",
    welcomeMessage:
      "¡Bienvenido a Mesa Norte! Soy la recepción virtual. Puedo ayudarte a reservar mesa o contarte del menú. ¿Para cuántas personas y qué día?",
    timeoutMs: 90000,
  };

  const widget = {
    sessionId: "",
    messages: [],
    busy: false,
    panel: { open: false },
    options: {},
  };

  let els = {};
  let healthTimer = null;
  let abortController = null;
  let onVisibilityChange = null;

  // --- Public API -----------------------------------------------------------

  function init(options) {
    if (els.root) {
      // Already initialized; reuse existing DOM and session.
      return widget;
    }

    widget.options = Object.assign({}, defaults, options || {});
    widget.sessionId = getOrCreateSessionId();
    widget.messages = [
      { role: "assistant", content: widget.options.welcomeMessage },
    ];

    injectStyles();
    buildDOM();
    bindEvents();
    renderMessages();
    updateStatus("checking");
    checkHealth();

    // Recheck backend liveness every 30s while the page is open.
    healthTimer = setInterval(checkHealth, 30000);

    return widget;
  }

  function dispose() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    const style = document.getElementById("barberco-widget-styles");
    if (style) style.remove();
    if (els.root) {
      els.root.remove();
    }
    if (onVisibilityChange) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      onVisibilityChange = null;
    }
    els = {};
  }

  function open() {
    if (!els.root) return;
    widget.panel.open = true;
    els.panel.classList.add("open");
    els.panel.setAttribute("aria-hidden", "false");
    els.toggle.setAttribute("aria-expanded", "true");
    els.toggle.classList.add("open");
    els.input.focus();
    scrollToBottom();
  }

  function close() {
    if (!els.root) return;
    widget.panel.open = false;
    els.panel.classList.remove("open");
    els.panel.setAttribute("aria-hidden", "true");
    els.toggle.setAttribute("aria-expanded", "false");
    els.toggle.classList.remove("open");
  }

  function send(text) {
    if (!els.root) return;
    const message = String(text || "").trim();
    if (!message || widget.busy) return;

    if (!widget.panel.open) open();

    widget.messages.push({ role: "user", content: message });
    setBusy(true);
    renderMessages();

    postMessage(message)
      .then((data) => {
        if (data.sessionId) {
          widget.sessionId = data.sessionId;
          saveSessionId(data.sessionId);
        }
        widget.messages.push({
          role: "assistant",
          content: data.reply || "Perdón, no entendí eso.",
        });
      })
      .catch((err) => {
        const detail = String(err.message || "").trim();
        // Backend errors already read as complete customer-facing sentences
        // (Spanish, ending in punctuation) — show them as-is instead of
        // wrapping, which otherwise reads like a nested parenthetical.
        const content = /[.!?]$/.test(detail)
          ? detail
          : `Perdón — no pude enviar el mensaje (${detail}).`;
        widget.messages.push({ role: "assistant", content });
      })
      .finally(() => {
        setBusy(false);
        renderMessages();
        // Disabling the input while it had focus forces a browser blur;
        // restore focus now that it's interactive again so the customer
        // can keep typing without an extra click.
        if (widget.panel.open) els.input.focus();
      });
  }

  // --- DOM construction ------------------------------------------------------

  function buildDOM() {
    const root = document.createElement("div");
    root.id = "barberco-widget-root";
    root.innerHTML = `
      <button id="barberco-toggle" aria-label="Abrir chat" aria-expanded="false" type="button">
        <span class="barberco-icon-open" aria-hidden="true">🗣️</span>
        <span class="barberco-icon-close" aria-hidden="true">✕</span>
      </button>
      <div id="barberco-panel" role="dialog" aria-modal="true" aria-label="Chat con ${escapeHtml(
        widget.options.brandName
      )}" aria-hidden="true">
        <header id="barberco-header">
          <div>
            <strong>${escapeHtml(widget.options.brandName)}</strong>
            <span class="barberco-subtitle">Chat con la recepción</span>
          </div>
          <div class="barberco-status" data-status="checking">
            <span class="barberco-status-dot" aria-hidden="true"></span>
            <span class="barberco-status-text">comprobando…</span>
          </div>
        </header>
        <div id="barberco-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
        <form id="barberco-composer" aria-label="Enviar un mensaje">
          <input
            id="barberco-input"
            type="text"
            autocomplete="off"
            placeholder="ej. Quiero un corte el viernes a las 2pm…"
            aria-label="Mensaje"
          />
          <button id="barberco-send" type="submit" aria-label="Enviar mensaje">Enviar</button>
        </form>
      </div>
    `;

    document.body.appendChild(root);

    els = {
      root,
      toggle: document.getElementById("barberco-toggle"),
      panel: document.getElementById("barberco-panel"),
      messages: document.getElementById("barberco-messages"),
      composer: document.getElementById("barberco-composer"),
      input: document.getElementById("barberco-input"),
      send: document.getElementById("barberco-send"),
      status: document.querySelector("#barberco-panel .barberco-status"),
      statusText: document.querySelector(
        "#barberco-panel .barberco-status-text"
      ),
    };
  }

  function bindEvents() {
    els.toggle.addEventListener("click", () => {
      widget.panel.open ? close() : open();
    });

    els.composer.addEventListener("submit", (e) => {
      e.preventDefault();
      send(els.input.value);
      els.input.value = "";
    });

    // Close the panel when the user presses Escape inside it.
    els.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    onVisibilityChange = () => {
      if (!document.hidden) checkHealth();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  // --- Rendering -------------------------------------------------------------

  function renderMessages() {
    if (!els.root || !els.messages) return;
    els.messages.innerHTML = "";
    widget.messages.forEach((msg) => {
      const row = document.createElement("div");
      row.className = `barberco-message ${msg.role}`;
      row.innerHTML = `
        <span class="barberco-label">${
          msg.role === "assistant" ? "Recepción" : "Tú"
        }</span>
        <div class="barberco-bubble">${escapeHtml(msg.content)}</div>
      `;
      els.messages.appendChild(row);
    });

    if (widget.busy) {
      const pending = document.createElement("div");
      pending.className = "barberco-message assistant pending";
      pending.innerHTML = `
        <span class="barberco-label">Recepción</span>
        <div class="barberco-bubble barberco-dots" aria-label="Escribiendo">
          <span></span><span></span><span></span>
        </div>
      `;
      els.messages.appendChild(pending);
    }

    scrollToBottom();
  }

  function setBusy(value) {
    widget.busy = Boolean(value);
    if (!els.root || !els.input || !els.send) return;
    els.input.disabled = widget.busy;
    els.send.disabled = widget.busy;
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // --- Status / health -------------------------------------------------------

  function updateStatus(state) {
    if (!els.root || !els.status) return;
    const dot = els.status.querySelector(".barberco-status-dot");
    const textMap = {
      online: ["en línea", "online"],
      offline: ["sin conexión", "offline"],
      checking: ["comprobando…", "checking"],
    };
    const [text, cls] = textMap[state] || textMap.checking;
    els.status.dataset.status = cls;
    els.statusText.textContent = text;
    dot.title = text;
  }

  async function checkHealth() {
    try {
      const res = await fetch(widget.options.healthEndpoint, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("unhealthy");
      const data = await res.json().catch(() => ({}));
      updateStatus(data.ok ? "online" : "offline");
    } catch {
      updateStatus("offline");
    }
  }

  // --- Network ---------------------------------------------------------------

  async function postMessage(message) {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    let timeoutId;
    const timeoutMs = Number(widget.options.timeoutMs) || 90000;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    }

    try {
      const res = await fetch(widget.options.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: widget.sessionId, message }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.detail || data.error || `Request failed (${res.status})`
        );
      }
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("Se agotó el tiempo de espera — intenta de nuevo");
      }
      throw err;
    } finally {
      abortController = null;
    }
  }

  // --- Session management ----------------------------------------------------

  function getOrCreateSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = generateUUID();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      // sessionStorage may be unavailable in private/sandboxed contexts.
      return generateUUID();
    }
  }

  function saveSessionId(id) {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      // Ignore storage errors so chat continues in-memory.
    }
  }

  function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Math.random is not a CSPRNG, but it is sufficient for session deduplication
    // when crypto.randomUUID is unavailable (older browsers / insecure contexts).
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // --- Utilities -------------------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Embedded widget styles ------------------------------------------------

  function injectStyles() {
    if (document.getElementById("barberco-widget-styles")) return;

    const style = document.createElement("style");
    style.id = "barberco-widget-styles";
    style.textContent = `
      :root {
        --barberco-bg: #1a1410;
        --barberco-panel: #2c221b;
        --barberco-ink: #f4ebe2;
        --barberco-muted: #b7a89a;
        --barberco-accent: #e8a45a;
        --barberco-accent-deep: #c47a2e;
        --barberco-desk: #352a22;
        --barberco-user: #3a4d3f;
        --barberco-line: rgba(244, 235, 226, 0.08);
        --barberco-online: #b9e0c2;
        --barberco-offline: #e07a6a;
        --barberco-radius: 18px;
        --barberco-z-index: 1000;
      }

      #barberco-widget-root {
        position: fixed;
        z-index: var(--barberco-z-index);
        bottom: 24px;
        right: 24px;
        font-family: "DM Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--barberco-ink);
      }

      #barberco-toggle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 1px solid var(--barberco-line);
        background: linear-gradient(180deg, var(--barberco-accent), var(--barberco-accent-deep));
        color: #1a1410;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      #barberco-toggle:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      }

      #barberco-toggle .barberco-icon-close { display: none; }

      #barberco-toggle.open .barberco-icon-open { display: none; }
      #barberco-toggle.open .barberco-icon-close { display: inline; }

      #barberco-panel {
        position: absolute;
        bottom: 72px;
        right: 0;
        width: 380px;
        max-height: 520px;
        background: linear-gradient(180deg, #241c16, var(--barberco-panel));
        border: 1px solid var(--barberco-line);
        border-radius: var(--barberco-radius);
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(16px) scale(0.96);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      #barberco-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      #barberco-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--barberco-line);
        background: rgba(0, 0, 0, 0.15);
      }

      #barberco-header strong {
        display: block;
        font-size: 16px;
        font-weight: 600;
      }

      #barberco-header .barberco-subtitle {
        display: block;
        font-size: 12px;
        color: var(--barberco-muted);
        margin-top: 2px;
      }

      .barberco-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--barberco-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }

      .barberco-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--barberco-muted);
      }

      .barberco-status[data-status="online"] .barberco-status-dot {
        background: var(--barberco-online);
        box-shadow: 0 0 0 2px rgba(185, 224, 194, 0.25);
      }

      .barberco-status[data-status="offline"] .barberco-status-dot {
        background: var(--barberco-offline);
        box-shadow: 0 0 0 2px rgba(224, 122, 106, 0.25);
      }

      #barberco-messages {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 260px;
      }

      .barberco-message {
        max-width: 85%;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .barberco-message.user {
        align-self: flex-end;
        align-items: flex-end;
      }

      .barberco-message.assistant {
        align-self: flex-start;
        align-items: flex-start;
      }

      .barberco-label {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--barberco-muted);
      }

      .barberco-bubble {
        padding: 10px 14px;
        border-radius: 14px;
        border: 1px solid var(--barberco-line);
        line-height: 1.45;
        font-size: 14px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .barberco-message.assistant .barberco-bubble {
        background: var(--barberco-desk);
        border-bottom-left-radius: 4px;
      }

      .barberco-message.user .barberco-bubble {
        background: var(--barberco-user);
        border-bottom-right-radius: 4px;
      }

      .barberco-dots {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        min-width: 48px;
        min-height: 24px;
      }

      .barberco-dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--barberco-accent);
        opacity: 0.35;
        animation: barberco-pulse 1.2s infinite ease-in-out;
      }

      .barberco-dots span:nth-child(2) { animation-delay: 0.15s; }
      .barberco-dots span:nth-child(3) { animation-delay: 0.3s; }

      @keyframes barberco-pulse {
        0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-2px); }
      }

      #barberco-composer {
        display: flex;
        gap: 10px;
        padding: 14px 18px 18px;
        border-top: 1px solid var(--barberco-line);
        background: rgba(0, 0, 0, 0.12);
      }

      #barberco-input {
        flex: 1 1 auto;
        border: 1px solid var(--barberco-line);
        background: rgba(0, 0, 0, 0.25);
        color: var(--barberco-ink);
        border-radius: 999px;
        padding: 12px 16px;
        font: inherit;
        font-size: 14px;
        outline: none;
      }

      #barberco-input:focus {
        border-color: rgba(232, 164, 90, 0.55);
        box-shadow: 0 0 0 3px rgba(232, 164, 90, 0.12);
      }

      #barberco-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      #barberco-send {
        border: none;
        border-radius: 999px;
        padding: 0 20px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        color: #1a1410;
        background: linear-gradient(180deg, var(--barberco-accent), var(--barberco-accent-deep));
      }

      #barberco-send:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      @media (max-width: 480px) {
        #barberco-widget-root {
          bottom: 16px;
          right: 16px;
        }

        #barberco-panel {
          /* Fixed top/bottom insets (not bottom-anchored max-height) so the
             panel can never grow into a host page's header/nav band,
             regardless of viewport height. */
          position: fixed;
          top: 84px;
          bottom: 84px;
          left: 16px;
          right: 16px;
          width: auto;
          max-height: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // --- Export ----------------------------------------------------------------

  global.Widget = {
    init,
    open,
    close,
    send,
    dispose,
  };
})(typeof window !== "undefined" ? window : this);
