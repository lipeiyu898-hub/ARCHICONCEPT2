const INTRO_STORAGE_KEY = "archiconcept_assistant_intro_closed_v2";
const FLOAT_POSITION_KEY = "archiconcept-ai-float-position";
const IP_IMAGE_SRC = "/images/assistant-ip.png";
const LAY_IP_IMAGE_SRC = "/images/assistant-ip-lay.png";
const LAY_HOVER_IP_IMAGE_SRC = "/images/assistant-ip-lay2.png";
const LAY_MODAL_IMAGE_SRC = "/images/assistant-ip-lay3.png";
const ASSISTANT_AVATAR_SRC = "/images/assistant-ip-laugh.png";
const MAX_HISTORY = 8;

const quickPromptGroups = [
  ["这个页面我该先填什么？", "功能面积表怎么拆？", "场地红线有什么作用？"],
  ["容积率怎么理解？", "建筑限高影响什么？", "任务书要提取哪些信息？"],
  ["项目性质怎么选择？", "用地面积怎么填写？", "概念生成前要确认什么？"],
  ["设计说明该怎么写？", "哪些条件会影响方案？", "我可以先跳过哪些字段？"]
];

const introPrompts = [
  { label: "当前页怎么填", prompt: "这个页面我该先填什么？" },
  { label: "解释这个字段", prompt: "请解释当前页面里最容易填错的字段。" },
  { label: "建筑知识问答", prompt: "建筑前期设计一般需要先确认哪些条件？" },
  { label: "打开 AI 助手", prompt: "" }
];

const abilityPrompts = [
  { title: "解读项目内容", text: "快速理解图纸、任务书与设计要求", prompt: "请帮我解读当前项目内容。" },
  { title: "提供设计建议", text: "分析场地、功能与规范，给出建议", prompt: "请基于当前页面提供设计建议。" },
  { title: "规范 / 指标查询", text: "查询建筑规范、指标与行业标准", prompt: "请帮我查询相关规范和指标。" }
];

const recommendedPrompts = [
  {
    title: "这个项目的设计要点是什么？",
    text: "结合项目条件，梳理优先关注的场地、功能与指标问题。"
  },
  {
    title: "容积率 2.0 的建筑密度是多少？",
    text: "解释常见规划指标之间的关系，并提示需要补充的条件。"
  }
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
  launcherSuppressClick: false,
  quickPromptGroupIndex: 0
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const getCurrentUser = () => {
  const candidates = [
    window.ARCHICONCEPT_USER,
    window.ARCHICONCEPT_CURRENT_USER,
    window.currentUser,
    window.user
  ];
  for (const user of candidates) {
    if (user && typeof user === "object") return user;
  }
  for (const key of ["archiconcept-user", "archiconcept_current_user", "user", "currentUser"]) {
    try {
      const user = JSON.parse(window.localStorage.getItem(key) || "null");
      if (user && typeof user === "object") return user;
    } catch {}
  }
  return {};
};

const getUserAvatarUrl = () => {
  const user = getCurrentUser();
  return (
    user.avatarUrl ||
    user.avatar ||
    user.photoURL ||
    user.photoUrl ||
    user.profileImage ||
    user.profileImageUrl ||
    ""
  );
};

const getUserInitial = () => {
  const user = getCurrentUser();
  const name = user.name || user.displayName || user.nickname || user.username || "U";
  return String(name).trim().slice(0, 1).toUpperCase() || "U";
};

const renderUserAvatar = () => {
  const avatarUrl = getUserAvatarUrl();
  if (avatarUrl) {
    return `<img class="archi-assistant-avatar" src="${escapeHtml(avatarUrl)}" alt="" aria-hidden="true" />`;
  }
  return `<span class="archi-assistant-avatar is-default" aria-hidden="true">${escapeHtml(getUserInitial())}</span>`;
};

const renderAssistantAvatar = () =>
  `<img class="archi-assistant-avatar" src="${ASSISTANT_AVATAR_SRC}" alt="" aria-hidden="true" />`;

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
      <p>Hi，我是 ArChi 小建。你可以问我怎么填写当前页面，也可以问建筑前期问题。</p>
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

  const messages = state.sending
    ? [...state.messages, { role: "assistant", loading: true, content: "" }]
    : state.messages;

  if (!messages.length) {
    list.innerHTML = "";
    state.dialog?.classList.remove("has-chat");
    return;
  }

  state.dialog?.classList.add("has-chat");
  list.innerHTML = messages
    .map(
      (message) => `
        <article class="archi-assistant-message is-${message.role}${message.loading ? " is-loading" : ""}">
          ${message.role === "assistant" ? renderAssistantAvatar() : ""}
          <div>${
            message.loading
              ? '<span class="archi-assistant-typing" aria-label="正在思考"><i></i><i></i><i></i></span>'
              : escapeHtml(message.content).replaceAll("\n", "<br>")
          }</div>
          ${message.role === "user" ? renderUserAvatar() : ""}
        </article>
      `
    )
    .join("");
  list.scrollTop = list.scrollHeight;
};

const renderQuickPrompts = () => {
  const prompts = quickPromptGroups[state.quickPromptGroupIndex];
  return `
    ${prompts
      .map(
        (prompt) =>
          `<button type="button" data-prompt="${escapeHtml(prompt)}"><span>${escapeHtml(prompt)}</span><i aria-hidden="true">›</i></button>`
      )
      .join("")}
    <button type="button" data-quick-refresh="true"><span>换一批问题看看</span><i aria-hidden="true">↻</i></button>
  `;
};

const rotateQuickPrompts = () => {
  state.quickPromptGroupIndex =
    (state.quickPromptGroupIndex + 1) % quickPromptGroups.length;
  const container = state.dialog?.querySelector(".archi-assistant-bottom-prompts");
  if (container) container.innerHTML = renderQuickPrompts();
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
  setSending(true);
  renderMessages();

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
      <aside class="archi-assistant-modal-left">
        <div class="archi-assistant-brand"><strong>ARCHICONCEPT</strong><span>AI Assistant</span></div>
        <div class="archi-assistant-visual" aria-label="AI 助手主视觉">
          <img src="${LAY_MODAL_IMAGE_SRC}" alt="" aria-hidden="true" />
        </div>
        <div class="archi-assistant-left-copy">
          <h2>Hi，我是 ArChi 小建</h2>
          <p>专为建筑师和设计团队打造的智能助手，可以帮你理解项目内容、解答疑问，并提供设计建议与灵感。</p>
        </div>
        <div class="archi-assistant-capabilities" aria-label="AI 助手能力入口">
          ${abilityPrompts
            .map(
              (item) => `
                <button type="button" data-prompt="${escapeHtml(item.prompt)}">
                  <span aria-hidden="true"></span>
                  <strong>${escapeHtml(item.title)}</strong>
                  <small>${escapeHtml(item.text)}</small>
                  <i aria-hidden="true">›</i>
                </button>`
            )
            .join("")}
        </div>
      </aside>
      <section class="archi-assistant-modal-right">
        <header class="archi-assistant-modal-header">
          <button type="button" class="archi-assistant-history">↺ 对话历史</button>
          <button type="button" class="archi-assistant-close" aria-label="关闭 AI 助手">×</button>
        </header>
        <div class="archi-assistant-right-scroll">
          <div class="archi-assistant-right-title">
            <h2>有什么可以帮你？</h2>
            <p>你可以试着问我一些问题，或从下方建议中选择。</p>
          </div>
          <div class="archi-assistant-recommendations" aria-label="推荐问题">
            ${recommendedPrompts
              .map(
                (item) => `
                  <button type="button" data-prompt="${escapeHtml(item.title)}">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.text)}</span>
                  </button>`
              )
              .join("")}
          </div>
          <div class="archi-assistant-messages"></div>
          <p class="archi-assistant-quick-title">你也可以试试这些问题</p>
          <div class="archi-assistant-bottom-prompts" aria-label="快捷问题">
            ${renderQuickPrompts()}
          </div>
        </div>
        <form class="archi-assistant-form">
          <button type="button" class="archi-assistant-attach" aria-label="附件占位" tabindex="-1">⌁</button>
          <textarea rows="1" maxlength="2000" placeholder="输入你的问题，按 Enter 发送"></textarea>
          <button type="submit" aria-label="发送"><span aria-hidden="true">↑</span></button>
        </form>
      </section>
    </div>
  `;

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest(".archi-assistant-close")) {
      closeAssistant();
      return;
    }
    if (event.target.closest("[data-quick-refresh]")) {
      rotateQuickPrompts();
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
