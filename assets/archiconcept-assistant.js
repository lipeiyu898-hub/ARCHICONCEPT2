const INTRO_STORAGE_KEY = "archiconcept_assistant_intro_closed_v2";
const IP_IMAGE_SRC = "/images/assistant-ip.png";
const LAY_IP_IMAGE_SRC = "/images/assistant-ip-lay.png";
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

const state = {
  root: null,
  intro: null,
  launcher: null,
  dialog: null,
  messages: [],
  open: false,
  sending: false
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

const removeIntro = ({ persist = false } = {}) => {
  if (persist) setIntroClosed();
  state.intro?.remove();
  state.intro = null;
  state.launcher?.classList.remove("is-muted-by-intro");
};

const closeIntro = () => removeIntro({ persist: true });

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
};

const ensureLauncher = () => {
  if (state.launcher) return;
  ensureRoot();
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "archi-assistant-launcher";
  launcher.setAttribute("aria-label", "打开 AI 助手");
  launcher.innerHTML = `
    <img src="${IP_IMAGE_SRC}" alt="" aria-hidden="true" />
    <span>AI 助手</span>
  `;
  launcher.addEventListener("click", () => openAssistant());
  state.root.appendChild(launcher);
  state.launcher = launcher;
};

const shouldShowIntro = () =>
  !hasIntroClosed() && Boolean(document.querySelector("#id-section-a"));

const renderIntro = () => {
  ensureLauncher();
  if (!shouldShowIntro()) {
    if (state.intro) removeIntro();
    return;
  }
  if (state.intro) return;

  const intro = document.createElement("section");
  intro.className = "archi-assistant-intro";
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
      closeIntro();
      return;
    }
    if (button.dataset.prompt !== undefined) {
      openAssistant(button.dataset.prompt || "");
    }
  });

  state.root.appendChild(intro);
  state.intro = intro;
  state.launcher?.classList.add("is-muted-by-intro");
};

const renderMessages = () => {
  const list = state.dialog?.querySelector(".archi-assistant-messages");
  if (!list) return;

  if (!state.messages.length) {
    list.innerHTML = `
      <div class="archi-assistant-empty">
        <div class="archi-assistant-guide" aria-label="使用指引">
          <span>可以问页面怎么填、功能面积怎么拆、场地红线怎么用。AI 只提供建议，不会直接修改表单。</span>
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
              `<button type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`
          )
          .join("")}
      </div>
      <form class="archi-assistant-form">
        <button type="button" class="archi-assistant-attach" aria-label="附件占位" tabindex="-1">
          <span aria-hidden="true">⌘</span>
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
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
};

startAssistant();
