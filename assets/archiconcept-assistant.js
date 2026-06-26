const INTRO_STORAGE_KEY = "archiconcept_assistant_intro_closed_v2";
const FLOAT_POSITION_KEY = "archiconcept-ai-float-position";
const IP_IMAGE_SRC = "/images/assistant-ip.png";
const LAY_IP_IMAGE_SRC = "/images/assistant-ip-lay.png";
const LAY_HOVER_IP_IMAGE_SRC = "/images/assistant-ip-lay2.png";
const MAX_HISTORY = 8;

const quickPrompts = [
  "这个页面我该先填什么？",
  "功能面积表怎么拆？",
  "场地红线有什么作用？",
  "概念生成前要确认哪些条件？"
];

const introPrompts = [
  { label: "当前页怎么填", prompt: "这个页面我该先填什么？" },
  { label: "解释这个字段", prompt: "请解释当前页面里最容易填错的字段。" },
  { label: "建筑知识问答", prompt: "建筑前期设计一般需要先确认哪些条件？" },
  { label: "打开 AI 助手", prompt: "" }
];

const LAUNCHER_IDLE_PROMPT = ".....";
const LAUNCHER_HOVER_PROMPT = "点我提问";
const LAUNCHER_DOT_INTERVAL_MS = 1000;

const state = {
  root: null,
  intro: null,
  introDismissed: false,
  introMode: "collapsed",
  introCloseTimer: null,
  launcher: null,
  dialog: null,
  messages: [],
  open: false,
  sending: false,
  launcherHovered: false,
  launcherTypingTimer: null,
  launcherHoldTimer: null,
  launcherClickTimer: null,
  launcherDrag: null,
  launcherSuppressClick: false
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const isElementVisible = (element) => {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};

const getVisibleHeadings = () =>
  [...document.querySelectorAll("main h1, main h2, main h3")]
    .filter(isElementVisible)
    .map((item) => item.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);

const getWorkflowStep = () => {
  const current =
    document.querySelector('[data-current-workflow-step="true"]') ||
    document.querySelector("[data-workflow-step][data-active='true']");
  const value =
    current?.getAttribute("data-workflow-step") ||
    current?.dataset?.workflowStep ||
    "";
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (document.querySelector("#id-section-a")) return 1;
  if (document.querySelector("#main-container-step2")) return 2;
  return null;
};

const getProjectSnapshot = () => {
  const chain = window.ARCHICONCEPT_DATA_CHAIN?.store?.getState?.();
  const boundary = chain?.boundaryAnchorPackage?.data || {};
  const identity = boundary.projectIdentity || {};
  const controls = boundary.hardControls || {};
  const step = getWorkflowStep();
  const packageByStep = {
    1: "boundaryAnchorPackage",
    2: "siteAnalysisPackage",
    3: "functionConstructPackage",
    4: "conceptStrategyPackage",
    5: "massingPlacementPackage",
    6: "finalConceptPackage"
  }[step];
  const currentPackage = packageByStep ? chain?.[packageByStep] : null;

  return {
    projectName: identity.projectName || "",
    buildingType: identity.buildingType || "",
    location: identity.location || "",
    siteArea: controls.siteAreaM2 || "",
    gfa: controls.grossFloorAreaM2 || "",
    currentStepStatus: currentPackage?.completionStatus || ""
  };
};

const collectPageContext = () => ({
  url: window.location.pathname + window.location.search,
  pageTitle:
    document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim() ||
    document.title ||
    "ARCHICONCEPT",
  workflowStep: getWorkflowStep(),
  visibleHeadings: getVisibleHeadings(),
  projectSnapshot: getProjectSnapshot()
});

const ensureRoot = () => {
  if (state.root) return state.root;
  const root = document.createElement("div");
  root.id = "archiconcept-assistant-root";
  document.body.appendChild(root);
  state.root = root;
  return root;
};

const setIntroClosed = () => {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, "true");
  } catch {}
};

const hasIntroClosed = () => {
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
};

const removeIntro = ({ persist = false, animate = false } = {}) => {
  if (persist) state.introDismissed = true;
  if (persist) setIntroClosed();
  window.clearTimeout(state.introCloseTimer);
  if (animate && state.intro) {
    state.introMode = "closing";
    state.intro.classList.remove("ai-prompt-expanded");
    state.intro.classList.add("ai-prompt-closing");
    state.launcher?.classList.remove("is-muted-by-intro");
    state.launcher?.classList.add("ai-prompt-collapsed", "assistant-peek-reveal");
    state.introCloseTimer = window.setTimeout(() => {
      state.intro?.remove();
      state.intro = null;
      state.introMode = "collapsed";
      state.launcher?.classList.remove("assistant-peek-reveal");
      state.launcher?.classList.add("ai-prompt-collapsed");
    }, 740);
    return;
  }
  state.intro?.remove();
  state.intro = null;
  state.introMode = "collapsed";
  state.launcher?.classList.remove("is-muted-by-intro", "assistant-peek-reveal");
  state.launcher?.classList.add("ai-prompt-collapsed");
};

const closeIntro = (options = {}) => removeIntro({ persist: true, ...options });

const openAssistant = (prompt = "") => {
  closeIntro();
  state.open = true;
  renderDialog();
  if (prompt) submitMessage(prompt);
};

const closeAssistant = () => {
  state.open = false;
  state.dialog?.remove();
  state.dialog = null;
  startLauncherPromptLoop();
};

const clearLauncherPromptTimers = () => {
  window.clearTimeout(state.launcherTypingTimer);
  window.clearTimeout(state.launcherHoldTimer);
};

const setLauncherImage = (src) => {
  const image = state.launcher?.querySelector("img");
  if (image && image.getAttribute("src") !== src) image.setAttribute("src", src);
};

const typeLauncherPrompt = (index = 1) => {
  if (!state.launcher || state.launcherHovered) return;
  const label = state.launcher.querySelector("[data-launcher-label]");
  if (!label) return;
  label.classList.remove("is-fading");
  label.textContent = LAUNCHER_IDLE_PROMPT.slice(0, index);
  const nextIndex = index >= LAUNCHER_IDLE_PROMPT.length ? 1 : index + 1;
  state.launcherTypingTimer = window.setTimeout(
    () => typeLauncherPrompt(nextIndex),
    LAUNCHER_DOT_INTERVAL_MS
  );
};

function startLauncherPromptLoop() {
  if (!state.launcher || state.launcherHovered) return;
  clearLauncherPromptTimers();
  setLauncherImage(LAY_IP_IMAGE_SRC);
  typeLauncherPrompt(1);
}

const showLauncherHoverPrompt = () => {
  state.launcherHovered = true;
  clearLauncherPromptTimers();
  state.launcher?.classList.add("is-hovering");
  setLauncherImage(LAY_HOVER_IP_IMAGE_SRC);
  const label = state.launcher?.querySelector("[data-launcher-label]");
  if (label) {
    label.classList.remove("is-fading");
    label.textContent = LAUNCHER_HOVER_PROMPT;
  }
};

const resumeLauncherPrompt = () => {
  state.launcherHovered = false;
  state.launcher?.classList.remove("is-hovering");
  startLauncherPromptLoop();
};

const isAssistantEntryPage = () => Boolean(document.querySelector("#id-section-a"));

const getClampedLauncherPosition = (left, top) => {
  const launcher = state.launcher;
  const width = launcher?.offsetWidth || 92;
  const height = launcher?.offsetHeight || 104;
  const minLeft = 16;
  const minTop = 16;
  const maxLeft = Math.max(minLeft, window.innerWidth - width - 16);
  const maxTop = Math.max(minTop, window.innerHeight - height - 80);
  return {
    left: Math.min(Math.max(left, minLeft), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop)
  };
};

const applyLauncherPosition = (position) => {
  if (!state.launcher || !position) return;
  const clamped = getClampedLauncherPosition(position.left, position.top);
  state.launcher.style.left = `${clamped.left}px`;
  state.launcher.style.top = `${clamped.top}px`;
  state.launcher.style.right = "auto";
  state.launcher.style.bottom = "auto";
};

const saveLauncherPosition = (position) => {
  try {
    window.localStorage.setItem(FLOAT_POSITION_KEY, JSON.stringify(position));
  } catch {}
};

const restoreLauncherPosition = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FLOAT_POSITION_KEY) || "null");
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      const position = getClampedLauncherPosition(saved.left, saved.top);
      applyLauncherPosition(position);
      saveLauncherPosition(position);
    }
  } catch {}
};

const resetLauncherPosition = () => {
  window.clearTimeout(state.launcherClickTimer);
  state.launcherClickTimer = null;
  if (!state.launcher) return;
  state.launcher.style.left = "";
  state.launcher.style.top = "";
  state.launcher.style.right = "";
  state.launcher.style.bottom = "";
  try {
    window.localStorage.removeItem(FLOAT_POSITION_KEY);
  } catch {}
};

const onLauncherPointerDown = (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  const rect = state.launcher.getBoundingClientRect();
  state.launcherDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    moved: false
  };
  state.launcherSuppressClick = false;
  state.launcher.classList.add("is-dragging");
  state.launcher.setPointerCapture?.(event.pointerId);
};

const onLauncherPointerMove = (event) => {
  const drag = state.launcherDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(deltaX, deltaY) <= 6) return;
  drag.moved = true;
  state.launcherSuppressClick = true;
  applyLauncherPosition({
    left: drag.left + deltaX,
    top: drag.top + deltaY
  });
};

const onLauncherPointerUp = (event) => {
  const drag = state.launcherDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.launcher.releasePointerCapture?.(event.pointerId);
  state.launcher.classList.remove("is-dragging");
  state.launcherDrag = null;
  if (!drag.moved) return;
  const rect = state.launcher.getBoundingClientRect();
  const position = getClampedLauncherPosition(rect.left, rect.top);
  applyLauncherPosition(position);
  saveLauncherPosition(position);
};

const openAssistantFromLauncher = (event) => {
  if (state.launcherSuppressClick) {
    event.preventDefault();
    state.launcherSuppressClick = false;
    return;
  }
  if (event.detail > 1) return;
  window.clearTimeout(state.launcherClickTimer);
  state.launcherClickTimer = window.setTimeout(() => openAssistant(), 220);
};

const removeLauncher = () => {
  clearLauncherPromptTimers();
  window.clearTimeout(state.launcherClickTimer);
  state.launcher?.remove();
  state.launcher = null;
  state.launcherHovered = false;
  state.launcherDrag = null;
  state.launcherSuppressClick = false;
};

const ensureLauncher = () => {
  if (state.launcher) return;
  ensureRoot();
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "archi-assistant-launcher ai-prompt-collapsed";
  launcher.setAttribute("aria-label", "打开 AI 助手");
  launcher.innerHTML = `
    <img src="${LAY_IP_IMAGE_SRC}" alt="" aria-hidden="true" draggable="false" />
    <span data-launcher-label></span>
  `;
  launcher.addEventListener("pointerdown", onLauncherPointerDown);
  launcher.addEventListener("pointermove", onLauncherPointerMove);
  launcher.addEventListener("pointerup", onLauncherPointerUp);
  launcher.addEventListener("pointercancel", onLauncherPointerUp);
  launcher.addEventListener("click", openAssistantFromLauncher);
  launcher.addEventListener("dblclick", resetLauncherPosition);
  launcher.addEventListener("mouseenter", showLauncherHoverPrompt);
  launcher.addEventListener("mouseleave", resumeLauncherPrompt);
  state.root.appendChild(launcher);
  state.launcher = launcher;
  restoreLauncherPosition();
  startLauncherPromptLoop();
};

const shouldShowIntro = () =>
  !state.introDismissed && isAssistantEntryPage();

const renderIntro = () => {
  ensureLauncher();
  if (!shouldShowIntro()) {
    if (state.intro) removeIntro();
    return;
  }
  if (state.intro) return;

  const intro = document.createElement("section");
  intro.className = "archi-assistant-intro ai-prompt-expanded";
  intro.setAttribute("aria-label", "ARCHICONCEPT AI 助手引导");
  intro.innerHTML = `
    <div class="archi-assistant-intro-ip">
      <img src="${IP_IMAGE_SRC}" alt="" aria-hidden="true" />
    </div>
    <div class="archi-assistant-intro-copy">
      <p>Hi，我是 ArChi 小助手。你可以问我怎么填写当前页面，也可以问建筑前期问题。</p>
    </div>
    <div class="archi-assistant-intro-actions">
      ${introPrompts
        .map(
          (item) =>
            `<button type="button" data-prompt="${escapeHtml(item.prompt)}">${escapeHtml(item.label)}</button>`
        )
        .join("")}
    </div>
    <button type="button" class="archi-assistant-intro-close" aria-label="关闭 AI 助手引导">×</button>
  `;

  intro.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.classList.contains("archi-assistant-intro-close")) {
      closeIntro({ animate: true });
      return;
    }
    if (button.dataset.prompt !== undefined) {
      openAssistant(button.dataset.prompt || "");
    }
  });

  state.root.appendChild(intro);
  state.intro = intro;
  state.introMode = "expanded";
  state.launcher?.classList.add("is-muted-by-intro");
  state.launcher?.classList.remove("ai-prompt-collapsed", "assistant-peek-reveal");
};

const renderMessages = () => {
  const list = state.dialog?.querySelector(".archi-assistant-messages");
  if (!list) return;

  if (!state.messages.length) {
    list.innerHTML = `
      <div class="archi-assistant-empty">
        <h2>Hi，我是 ArChi 小助手</h2>
        <p>我可以帮你理解页面内容，解答填写疑问，<br />也能提供建筑设计的专业建议。</p>
        <div class="archi-assistant-guide" aria-label="使用指引">
          <strong>使用指引</strong>
          <ul>
            <li><span class="archi-guide-icon is-form" aria-hidden="true"></span>帮你填写表单内容</li>
            <li><span class="archi-guide-icon is-chart" aria-hidden="true"></span>解释规划指标含义</li>
            <li><span class="archi-guide-icon is-light" aria-hidden="true"></span>提供下一步行动建议</li>
          </ul>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = state.messages
    .map(
      (message) => `
        <article class="archi-assistant-message is-${message.role}">
          <div>${escapeHtml(message.content).replaceAll("\n", "<br>")}</div>
        </article>
      `
    )
    .join("");
  list.scrollTop = list.scrollHeight;
};

const setSending = (sending) => {
  state.sending = sending;
  const form = state.dialog?.querySelector(".archi-assistant-form");
  const button = form?.querySelector('button[type="submit"]');
  const textarea = form?.querySelector("textarea");
  if (button) button.disabled = sending;
  if (textarea) textarea.disabled = sending;
  if (button) {
    button.innerHTML = sending
      ? '<span aria-hidden="true">···</span>'
      : '<span aria-hidden="true">↑</span>';
  }
};

const submitMessage = async (rawMessage) => {
  const content = String(rawMessage || "").trim();
  if (!content || state.sending) return;

  state.messages.push({ role: "user", content });
  renderMessages();
  setSending(true);

  try {
    const response = await fetch("/api/assistant-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        history: state.messages.slice(-MAX_HISTORY - 1, -1),
        pageContext: collectPageContext()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "AI 助手暂时无法连接模型服务，请稍后再试。");
    }
    state.messages.push({
      role: "assistant",
      content: data.answer || "我暂时没有生成有效回复，请换一种问法再试。"
    });
  } catch (error) {
    state.messages.push({
      role: "assistant",
      content: error.message || "AI 助手暂时无法连接模型服务，请稍后再试。"
    });
  } finally {
    setSending(false);
    renderMessages();
    const textarea = state.dialog?.querySelector("textarea");
    if (textarea) textarea.value = "";
  }
};

const renderDialog = () => {
  ensureRoot();
  state.dialog?.remove();

  const dialog = document.createElement("section");
  dialog.className = "archi-assistant-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "ARCHICONCEPT AI 助手");
  dialog.innerHTML = `
    <div class="archi-assistant-dialog-panel">
      <img class="archi-assistant-lay-ip" src="${LAY_IP_IMAGE_SRC}" alt="" aria-hidden="true" />
      <header>
        <button type="button" class="archi-assistant-drag" aria-label="AI 助手面板"></button>
        <button type="button" class="archi-assistant-close" aria-label="关闭 AI 助手">×</button>
      </header>
      <div class="archi-assistant-messages"></div>
      <div class="archi-assistant-bottom-prompts" aria-label="快捷问题">
        ${quickPrompts
          .map(
            (prompt) =>
              `<button type="button" data-prompt="${escapeHtml(prompt)}"><span>${escapeHtml(prompt)}</span><i aria-hidden="true">›</i></button>`
          )
          .join("")}
      </div>
      <form class="archi-assistant-form">
        <button type="button" class="archi-assistant-attach" aria-label="附件占位" tabindex="-1">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M8 12.8l5.9-5.9a3 3 0 114.2 4.2l-7.4 7.4a4.5 4.5 0 01-6.4-6.4l7.8-7.8" />
            <path d="M15.5 9.5l-7.2 7.2a1.8 1.8 0 11-2.6-2.6l6.6-6.6" />
          </svg>
        </button>
        <textarea rows="1" maxlength="2000" placeholder="请输入你的问题..."></textarea>
        <button type="submit" aria-label="发送"><span aria-hidden="true">↑</span></button>
      </form>
    </div>
  `;

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest(".archi-assistant-close")) {
      closeAssistant();
      return;
    }
    const promptButton = event.target.closest("[data-prompt]");
    if (promptButton) submitMessage(promptButton.dataset.prompt || "");
  });

  dialog.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const textarea = event.currentTarget.querySelector("textarea");
    submitMessage(textarea?.value || "");
  });

  dialog.querySelector("textarea")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage(event.currentTarget.value);
    }
  });

  state.root.appendChild(dialog);
  state.dialog = dialog;
  renderMessages();
  window.setTimeout(() => dialog.querySelector("textarea")?.focus(), 80);
};

const syncAssistant = () => {
  if (!isAssistantEntryPage()) {
    if (state.intro) removeIntro();
    removeLauncher();
    return;
  }
  ensureLauncher();
  if (!state.open) renderIntro();
};

const startAssistant = () => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAssistant, { once: true });
    return;
  }
  syncAssistant();
  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(syncAssistant);
  });
  window.addEventListener("resize", () => {
    if (!state.launcher || !state.launcher.style.left) return;
    const rect = state.launcher.getBoundingClientRect();
    const position = getClampedLauncherPosition(rect.left, rect.top);
    applyLauncherPosition(position);
    saveLauncherPosition(position);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
};

startAssistant();
