(function () {
  "use strict";

  const STORAGE_KEYS = {
    instructions: "chatbotlesson:instructions",
    folderId: "chatbotlesson:folderId",
  };

  const els = {
    chatWindow: document.getElementById("chat-window"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("message-input"),
    sendBtn: document.getElementById("send-btn"),
    btnInstructions: document.getElementById("btn-instructions"),
    btnFolder: document.getElementById("btn-folder"),
    modalInstructions: document.getElementById("modal-instructions"),
    modalFolder: document.getElementById("modal-folder"),
    instructionsInput: document.getElementById("instructions-input"),
    folderInput: document.getElementById("folder-input"),
    saveInstructions: document.getElementById("save-instructions"),
    saveFolder: document.getElementById("save-folder"),
  };

  const state = {
    instructions: localStorage.getItem(STORAGE_KEYS.instructions) || "",
    folderId: localStorage.getItem(STORAGE_KEYS.folderId) || "",
    history: [],
    sending: false,
    syncedFromServer: false,
  };

  // ---------- 서버 동기화 (Netlify Blobs) ----------
  async function fetchRemoteSettings() {
    try {
      const res = await fetch("/api/settings", { method: "GET" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function pushRemoteSettings() {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: state.instructions,
          folderId: state.folderId,
        }),
      });
      if (res.ok) return { ok: true };
      const data = await res.json().catch(() => ({}));
      const message = data.error || `HTTP ${res.status}`;
      console.error("[settings save]", res.status, data);
      return { ok: false, error: message };
    } catch (e) {
      console.error("[settings save]", e);
      return { ok: false, error: e.message };
    }
  }

  function applyRemoteToLocal(remote) {
    if (!remote) return false;
    let changed = false;
    if (typeof remote.instructions === "string" && remote.instructions !== state.instructions) {
      state.instructions = remote.instructions;
      localStorage.setItem(STORAGE_KEYS.instructions, state.instructions);
      changed = true;
    }
    if (typeof remote.folderId === "string" && remote.folderId !== state.folderId) {
      state.folderId = remote.folderId;
      localStorage.setItem(STORAGE_KEYS.folderId, state.folderId);
      changed = true;
    }
    return changed;
  }

  // ---------- 유틸 ----------
  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function autoResize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
    });
  }

  // ---------- 모달 ----------
  function openModal(modal) {
    if (modal === els.modalInstructions) {
      els.instructionsInput.value = state.instructions;
    } else if (modal === els.modalFolder) {
      els.folderInput.value = state.folderId;
    }
    modal.hidden = false;
    setTimeout(() => {
      const focusable = modal.querySelector("textarea, input");
      if (focusable) focusable.focus();
    }, 50);
  }

  function closeModal(modal) {
    modal.hidden = true;
  }

  els.btnInstructions.addEventListener("click", () => openModal(els.modalInstructions));
  els.btnFolder.addEventListener("click", () => openModal(els.modalFolder));

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById(btn.dataset.close);
      if (modal) closeModal(modal);
    });
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not([hidden])").forEach(closeModal);
    }
  });

  async function saveAndSync(successMsg) {
    const result = await pushRemoteSettings();
    if (result.ok) {
      showToast(`${successMsg} (모든 디바이스에 동기화) ☁️`);
    } else {
      showToast(`${successMsg} ⚠️ 동기화 실패: ${result.error}`);
    }
  }

  els.saveInstructions.addEventListener("click", async () => {
    state.instructions = els.instructionsInput.value.trim();
    localStorage.setItem(STORAGE_KEYS.instructions, state.instructions);
    closeModal(els.modalInstructions);
    await saveAndSync("응답 지침이 저장되었어요 ✨");
  });

  els.saveFolder.addEventListener("click", async () => {
    const raw = els.folderInput.value.trim();
    const folderId = extractFolderId(raw);
    state.folderId = folderId;
    localStorage.setItem(STORAGE_KEYS.folderId, state.folderId);
    closeModal(els.modalFolder);
    await saveAndSync(folderId ? "폴더 ID가 저장되었어요 📁" : "폴더 ID가 비워졌어요");
  });

  function extractFolderId(input) {
    if (!input) return "";
    const m = input.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return input;
  }

  // ---------- 메시지 렌더링 ----------
  function addBubble(role, text, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = `bubble ${role}` + (opts.error ? " error" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "🙂" : "🐰";

    const body = document.createElement("div");
    body.className = "bubble-body";

    if (opts.html) {
      body.innerHTML = text;
    } else {
      body.textContent = text;
    }

    if (opts.meta) {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = opts.meta;
      body.appendChild(meta);
    }

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    els.chatWindow.appendChild(wrap);
    scrollToBottom();
    return { wrap, body };
  }

  function addTypingBubble() {
    return addBubble("bot", '<div class="typing-dots"><span></span><span></span><span></span></div>', { html: true });
  }

  function metaFromResponse(meta) {
    if (!meta) return "";
    const parts = [];
    if (meta.docsUsed && meta.docsUsed.length) {
      parts.push(`📚 참조: ${meta.docsUsed.join(", ")}`);
    } else if (meta.totalFilesInFolder === 0) {
      parts.push("📂 폴더에 문서가 없거나 권한이 없어요");
    } else {
      parts.push("📂 참조한 문서가 없어요");
    }
    if (meta.docsSkipped && meta.docsSkipped.length) {
      parts.push(`⚠️ 건너뜀: ${meta.docsSkipped.join("; ")}`);
    }
    if (meta.truncated) {
      parts.push("✂️ 문서가 길어 일부만 사용했어요");
    }
    return parts.join("\n");
  }

  // ---------- 전송 ----------
  async function sendMessage(text) {
    if (state.sending) return;
    if (!text.trim()) return;

    state.sending = true;
    els.sendBtn.disabled = true;

    addBubble("user", text);
    state.history.push({ role: "user", content: text });

    const typing = addTypingBubble();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: state.history,
          instructions: state.instructions,
          folderId: state.folderId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      typing.wrap.remove();

      if (!res.ok) {
        const errMsg = data.error || `요청 실패 (HTTP ${res.status})`;
        addBubble("bot", `😢 ${errMsg}`, { error: true });
        state.history.pop();
        return;
      }

      const reply = data.reply || "(빈 응답)";
      const meta = metaFromResponse(data.meta);
      addBubble("bot", reply, { meta });
      state.history.push({ role: "assistant", content: reply });
    } catch (e) {
      typing.wrap.remove();
      addBubble("bot", `😢 통신 중 오류가 발생했어요: ${e.message}`, { error: true });
      state.history.pop();
    } finally {
      state.sending = false;
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.input.value;
    if (!text.trim()) return;
    els.input.value = "";
    autoResize();
    sendMessage(text);
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.form.requestSubmit();
    }
  });

  els.input.addEventListener("input", autoResize);

  // ---------- 첫 진입 안내 ----------
  function checkInitialSetup() {
    const missing = [];
    if (!state.instructions) missing.push("⚙️ 응답 지침");
    if (!state.folderId) missing.push("📁 폴더 ID");
    if (missing.length) {
      return addBubble(
        "bot",
        `시작하기 전에 ${missing.join("과 ")}을 설정해주세요!`
      );
    }
    return null;
  }

  async function init() {
    const setupBubble = checkInitialSetup();
    els.input.focus();

    // 백그라운드에서 서버 동기화
    const remote = await fetchRemoteSettings();
    if (remote) {
      state.syncedFromServer = true;
      const changed = applyRemoteToLocal(remote);
      if (changed) {
        if (setupBubble && state.instructions && state.folderId) {
          // 안내 말풍선이 더는 필요 없음 → 교체
          setupBubble.body.textContent = "다른 디바이스에서 저장한 설정을 불러왔어요 ☁️ 바로 질문해보세요!";
        } else {
          addBubble("bot", "다른 디바이스에서 저장한 설정을 불러왔어요 ☁️");
        }
      }
    }
  }

  init();
})();
