import {
  calculateAreaProgramItems,
  parseAreaProgram,
  recommendNormConstraints,
  resolveNormDesignConstraints,
  serializeAreaProgram,
  splitRequirementItems,
  store
} from "./archiconcept-data-chain.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STEP1_EXTRA_STORAGE_KEY = "archiconcept_step1_project_extra";
const STEP1_HELPER_TEXT =
  "先确认项目身份、建设规模与任务书条件；下一步将结合场地位置和用地边界分析限制与可利用条件。";
const STEP1_LEGACY_HELPER_TEXT =
  "本阶段先确认项目条件。下一步将结合场地位置和用地边界，分析场地限制与可利用条件。";
const STEP1_FIELD_LABELS = Object.freeze({
  name: "项目名称 / NAME",
  type: "建筑类型 / TYPE",
  location: "建设地点 / LOCATION",
  area: "用地面积 / SITE AREA",
  gfa: "总建筑面积 / GFA"
});
const STEP1_FIELD_LABEL_PATTERNS = Object.freeze({
  name: /项目名称\s*\/\s*NAME\s*\*?/i,
  type: /建筑类型\s*\/\s*TYPE\s*\*?/i,
  location: /(项目地点|建设地点)\s*\/\s*LOCATION\s*\*?/i,
  area: /用地面积\s*\/\s*(AREA|SITE AREA)\s*\*?/i,
  gfa: /总建筑面积\s*\/\s*GFA\s*\*?/i
});
const DEFAULT_PROJECT_TITLE = "新建建筑设计项目";

const getStepOneLegacyField = (name) =>
  document.querySelector(
    `#id-section-a [name="${name}"]:not([data-step1-proxy-field]), #id-section-b [name="${name}"]:not([data-step1-proxy-field])`
  );

const readStepOneFieldValue = (name) => {
  const proxy = document.querySelector(`[data-step1-proxy-field="${name}"]`);
  const value = proxy?.value ?? getStepOneLegacyField(name)?.value;
  return value || "";
};

const getStepOneProjectName = () => {
  const value = readStepOneFieldValue("name")?.trim();
  return value || DEFAULT_PROJECT_TITLE;
};

const readStepOneExtra = () => {
  try {
    return JSON.parse(localStorage.getItem(STEP1_EXTRA_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeStepOneExtra = (patch = {}) => {
  const next = { ...readStepOneExtra(), ...patch };
  try {
    localStorage.setItem(STEP1_EXTRA_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
  window.__ARCHICONCEPT_STEP1_EXTRA__ = next;
  return next;
};

const getLeftColumn = () =>
  document.querySelector("#grid-container > .lg\\:col-span-8") ||
  document.querySelector("#grid-container > div:first-child");

const setSectionHeading = (section, label, title, subtitle) => {
  if (!section) return;
  const badge = section.querySelector(
    ":scope > div span, :scope > div > div:first-child"
  );
  const heading = section.querySelector("h2, h3");
  const description = heading?.parentElement?.querySelector("p");
  if (
    badge &&
    badge.children.length === 0 &&
    badge.textContent?.trim() !== label
  ) {
    badge.textContent = label;
  }
  if (heading && heading.textContent?.trim() !== title) {
    heading.textContent = title;
  }
  if (description && description.textContent?.trim() !== subtitle) {
    description.textContent = subtitle;
  }
};

const getStepOneFieldNode = (name) => {
  const control = document.querySelector(
    `#id-section-a [name="${name}"], #id-section-b [name="${name}"]`
  );
  if (!control) return null;
  return control.closest("label") || control.parentElement || control;
};

const replaceTextNode = (root, pattern, replacement) => {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (pattern.test(node.nodeValue || "")) {
      node.nodeValue = replacement;
      return;
    }
    node = walker.nextNode();
  }
};

const normalizeStepOneFieldLabels = (fieldNode, name) => {
  const label = STEP1_FIELD_LABELS[name];
  const labelPattern = STEP1_FIELD_LABEL_PATTERNS[name];
  if (labelPattern) replaceTextNode(fieldNode, labelPattern, "");
  const control = fieldNode?.querySelector?.("input, select, textarea");
  if (!control) return;
  let labelNode = fieldNode.querySelector(":scope > [data-step12-field-label]");
  if (!labelNode) {
    labelNode = document.createElement("span");
    labelNode.dataset.step12FieldLabel = "true";
    fieldNode.prepend(labelNode);
  }
  if (label) {
    labelNode.textContent = `${label}${control.required ? " *" : ""}`;
  }
  if (name === "location") control.placeholder = "例如：中国 · 上海 · 浦东新区";
  if (name === "gfa") control.placeholder = "例如：12500";
};

const syncStepOneProxyField = (name, value) => {
  const proxy = document.querySelector(`[data-step1-proxy-field="${name}"]`);
  if (proxy && document.activeElement !== proxy && proxy.value !== value) {
    proxy.value = value || "";
  }
};

const syncStepOneProjectTitle = (value = getStepOneProjectName()) => {
  const titleInput = document.querySelector('[data-step1-project-title="true"]');
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = value || DEFAULT_PROJECT_TITLE;
  }
};

const createStepOneProxyControl = (name, legacyField) => {
  const isSelect = legacyField?.tagName === "SELECT";
  const control = document.createElement(isSelect ? "select" : "input");
  control.dataset.step1ProxyField = name;
  control.setAttribute("aria-label", STEP1_FIELD_LABELS[name] || name);
  control.required = Boolean(legacyField?.required);

  if (isSelect) {
    const options = [...legacyField.querySelectorAll("option")];
    options.forEach((option) => {
      control.append(option.cloneNode(true));
    });
  } else {
    control.type = "text";
    control.autocomplete = "off";
    if (name === "area" || name === "gfa") control.inputMode = "decimal";
    control.placeholder =
      legacyField?.placeholder ||
      (name === "name"
        ? "例如：前海 AI 数据中心与市民活动地景复合建筑"
        : name === "location"
          ? "例如：中国 · 上海 · 浦东新区"
          : name === "area"
            ? "例如：2446、2.5ha 或 2.5公顷"
            : name === "gfa"
              ? "例如：12500"
              : "");
  }

  control.value = legacyField?.value || "";
  return control;
};

const createStepOneProxyField = (name) => {
  const legacyField = getStepOneLegacyField(name);
  if (!legacyField && !STEP1_FIELD_LABELS[name]) return null;

  const wrap = document.createElement("label");
  wrap.className = "step12-project-info-field";
  wrap.dataset.step1Field = name;
  wrap.dataset.step1ProxyWrapper = name;

  const label = document.createElement("span");
  label.dataset.step12FieldLabel = "true";
  label.textContent = `${STEP1_FIELD_LABELS[name] || name}${legacyField?.required ? " *" : ""}`;

  wrap.append(label, createStepOneProxyControl(name, legacyField));
  return wrap;
};

const createStepOneExtraField = (name, label, value = "") => {
  const wrap = document.createElement("label");
  wrap.className = `step12-project-extra-field step12-project-extra-${name}`;
  wrap.innerHTML =
    name === "projectDescription"
      ? `
        <span>${label}</span>
        <textarea name="${name}" data-step1-extra-field="${name}" rows="3" placeholder="简要说明项目目标、服务对象、场地背景或任务书重点。">${escapeHtml(
          value
        )}</textarea>
      `
      : `
        <span>${label}</span>
        <select name="${name}" data-step1-extra-field="${name}">
          ${["概念设计", "方案设计", "投标 / 竞赛", "城市设计", "前期研究"]
            .map(
              (option) =>
                `<option value="${escapeHtml(option)}" ${
                  option === value ? "selected" : ""
                }>${escapeHtml(option)}</option>`
            )
            .join("")}
        </select>
      `;
  return wrap;
};

const triggerLegacyStepOneButton = (pattern) => {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) =>
      pattern.test(candidate.textContent || "") &&
      !candidate.closest("#step12-project-actions")
  );
  button?.click();
};

const renderStepOneProjectTitle = (main) => {
  const timeline = main.querySelector('[data-workflow-v2-timeline="true"]');
  if (!timeline) return;

  let titleBar = main.querySelector("#step12-project-title-bar");
  if (!titleBar) {
    titleBar = document.createElement("section");
    titleBar.id = "step12-project-title-bar";
    titleBar.className = "step12-project-title-bar";
    timeline.before(titleBar);
  }

  if (!titleBar.querySelector('[data-step1-project-title="true"]')) {
    titleBar.innerHTML = `
      <div class="step12-project-title-main">
        <input type="text" data-step1-project-title="true" aria-label="项目名称" />
        <span aria-hidden="true">✎</span>
      </div>
      <div class="step12-project-title-meta" aria-label="项目元信息">
        <span>项目编号：PRJ-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-001</span>
        <span>创建时间：${new Date().toLocaleDateString("zh-CN").replaceAll("/", "-")}</span>
        <span>保存中...</span>
      </div>
    `;
  }

  const input = titleBar.querySelector('[data-step1-project-title="true"]');
  if (input && document.activeElement !== input) {
    input.value = getStepOneProjectName();
  }
};

const hideStepOneFunctionSection = () => {
  document.querySelector("#id-section-c")?.classList.add("step12-function-migrated-out");
};

const hideStepOneLegacyFieldShells = (section) => {
  if (!section) return;
  const legacyLabelPattern =
    /项目名称\s*\/\s*NAME|建筑类型\s*\/\s*TYPE|项目地点\s*\/\s*LOCATION|用地面积\s*\/\s*AREA/;
  const legacyFieldSelector = [
    '[name="name"]:not([data-step1-proxy-field])',
    '[name="type"]:not([data-step1-proxy-field])',
    '[name="location"]:not([data-step1-proxy-field])',
    '[name="area"]:not([data-step1-proxy-field])'
  ].join(",");
  section.querySelectorAll(".grid").forEach((candidate) => {
    if (
      candidate.id === "step12-project-info-grid" ||
      candidate.closest("#step12-project-info-grid")
    ) {
      return;
    }
    const hasLegacyLabels = legacyLabelPattern.test(candidate.textContent || "");
    const hasLegacyFields = Boolean(candidate.querySelector(legacyFieldSelector));
    if (hasLegacyLabels || hasLegacyFields) {
      candidate.classList.add("step12-hidden-legacy-field-grid");
    }
  });
};

const rebuildStepOneProjectInfoSection = () => {
  const sectionA = document.querySelector("#id-section-a");
  const sectionB = document.querySelector("#id-section-b");
  if (!sectionA) return;

  sectionA.classList.add("step12-project-info-section");
  sectionB?.classList.add("step12-scale-migrated-out");

  const heading = sectionA.firstElementChild;
  heading?.classList.add("step12-project-form-header");
  heading
    ?.querySelector(":scope > span, :scope > div:first-child")
    ?.classList.add("step12-project-form-badge");
  let grid = sectionA.querySelector("#step12-project-info-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "step12-project-info-grid";
    grid.className = "step12-project-info-grid";
    if (heading) heading.after(grid);
    else sectionA.prepend(grid);
  }

  ["name", "type", "location", "area", "gfa"].forEach((name) => {
    let fieldNode = grid.querySelector(`[data-step1-proxy-wrapper="${name}"]`);
    if (!fieldNode) {
      fieldNode = createStepOneProxyField(name);
      if (fieldNode) grid.append(fieldNode);
      return;
    }
    syncStepOneProxyField(name, getStepOneLegacyField(name)?.value || "");
  });

  const extra = readStepOneExtra();
  if (!grid.querySelector('[data-step1-extra-field="designStage"]')) {
    grid.append(
      createStepOneExtraField(
        "designStage",
        "设计阶段 / DESIGN STAGE",
        extra.designStage || "概念设计"
      )
    );
  }
  if (!grid.querySelector('[data-step1-extra-field="projectDescription"]')) {
    grid.append(
      createStepOneExtraField(
        "projectDescription",
        "项目说明 / PROJECT DESCRIPTION",
        extra.projectDescription || ""
      )
    );
  }

  let actions = sectionA.querySelector("#step12-project-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "step12-project-actions";
    actions.className = "step12-project-actions";
    sectionA.append(actions);
  }
  actions.innerHTML = `
    <strong>资料入口</strong>
    <div class="step12-project-action-buttons">
      <button type="button" class="step12-secondary-action" data-action="step1-import-brief">任务书导入</button>
      <button type="button" class="step12-secondary-action" data-action="step1-demo-project">示例项目</button>
    </div>
  `;

  hideStepOneLegacyFieldShells(sectionA);
};

const syncStepOneStageCopy = () => {
  const stageDescription = document.querySelector(
    ".step12-boundary-page .workflow-v2-stage-copy > p"
  );
  if (stageDescription) stageDescription.textContent = STEP1_HELPER_TEXT;

  [...document.querySelectorAll(".step12-boundary-page p, .step12-boundary-page span")]
    .filter((element) => element.textContent?.trim() === STEP1_LEGACY_HELPER_TEXT)
    .forEach((element) => {
      const parent = element.parentElement;
      if (
        parent &&
        parent.children.length === 1 &&
        parent.textContent?.trim() === STEP1_LEGACY_HELPER_TEXT
      ) {
        parent.remove();
        return;
      }
      element.remove();
    });

  document.querySelector("#boundary-task-brief")?.remove();
};

const renderBoundarySections = () => {
  const left = getLeftColumn();
  if (!left) return;
  const main = document.querySelector("main:has(#id-section-a)");
  if (main) renderStepOneProjectTitle(main);

  setSectionHeading(
    document.querySelector("#id-section-a"),
    "A",
    "项目信息 / Project Information",
    "填写项目名称、建筑类型、建设地点、面积指标和项目说明。"
  );

  syncStepOneStageCopy();
  rebuildStepOneProjectInfoSection();
  hideStepOneFunctionSection();
  document.querySelector("#boundary-anchor-review")?.remove();
};

const ensureStepOneEvents = () => {
  if (document.documentElement.dataset.step12ProjectEvents === "true") return;
  document.documentElement.dataset.step12ProjectEvents = "true";

  document.addEventListener("input", (event) => {
    if (event.target.matches?.('[data-step1-project-title="true"]')) {
      syncStepOneProxyField("name", event.target.value);
      setLegacyFieldValue("name", event.target.value);
      return;
    }
    const proxyField = event.target.closest?.("[data-step1-proxy-field]");
    if (proxyField) {
      setLegacyFieldValue(proxyField.dataset.step1ProxyField, proxyField.value);
      if (proxyField.dataset.step1ProxyField === "name") {
        syncStepOneProjectTitle(proxyField.value);
      }
      return;
    }
    const field = event.target.closest?.("[data-step1-extra-field]");
    if (!field) return;
    writeStepOneExtra({ [field.dataset.step1ExtraField]: field.value });
  });

  document.addEventListener("change", (event) => {
    const proxyField = event.target.closest?.("[data-step1-proxy-field]");
    if (proxyField) {
      setLegacyFieldValue(proxyField.dataset.step1ProxyField, proxyField.value);
      if (proxyField.dataset.step1ProxyField === "name") {
        syncStepOneProjectTitle(proxyField.value);
      }
      return;
    }
    if (event.target.matches?.('[name="name"]')) {
      syncStepOneProjectTitle();
    }
    const field = event.target.closest?.("[data-step1-extra-field]");
    if (!field) return;
    writeStepOneExtra({ [field.dataset.step1ExtraField]: field.value });
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-action]")?.dataset.action;
    if (action === "step1-import-brief") {
      triggerLegacyStepOneButton(/导入任务书|IMPORT BRIEF/i);
    }
    if (action === "step1-demo-project") {
      triggerLegacyStepOneButton(/使用示例项目|TRY EXAMPLE/i);
    }
  });
};

const applyStepLayout = () => {
  const main = document.querySelector("main:has(#id-section-a)");
  if (!main) return;
  const step = store.getState?.().currentStep || 1;
  const importButton = [...main.querySelectorAll("button")].find((button) =>
    /导入任务书|IMPORT BRIEF/i.test(button.textContent || "")
  );
  importButton?.parentElement?.parentElement?.classList.add(
    "step12-legacy-input-header"
  );
  main.classList.toggle("step12-boundary-page", step === 1);
  main.classList.toggle("step12-site-page", step === 2);
  if (step === 1) renderBoundarySections();
};

let queued = false;
const queueRender = () => {
  if (queued || typeof document === "undefined") return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    applyStepLayout();
  });
};

const setLegacyFieldValue = (fieldName, value) => {
  const field =
    getStepOneLegacyField(fieldName) ||
    document.querySelector(`[name="${fieldName}"]:not([data-step1-proxy-field])`);
  if (!field) return;
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    "value"
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
};

const currentRequirementModel = (packageData) => {
  const data = packageData?.data || {};
  const requirements = data.functionRequirements || {};
  const programItems =
    requirements.programItems?.length
      ? requirements.programItems
      : splitRequirementItems(requirements.program || "");
  const targetUserItems =
    requirements.targetUserItems?.length
      ? requirements.targetUserItems
      : splitRequirementItems(requirements.targetUsers || "");
  const areaItems = calculateAreaProgramItems(
    parseAreaProgram(data.areaProgram || "", data.hardControls?.grossFloorAreaM2)
  );
  return {
    programItems,
    targetUserItems,
    siteCondition: requirements.siteCondition || "",
    areaItems
  };
};

const chipList = (items, emptyText) =>
  items.length
    ? items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
    : `<p>${escapeHtml(emptyText)}</p>`;

export const renderFunctionRequirementEditor = (container) => {
  if (!container) return;
  const packageData = store.getPackage("boundaryAnchorPackage");
  const model = currentRequirementModel(packageData);
  const areaItems = model.areaItems || [];
  const serialized = serializeAreaProgram(areaItems);
  container.classList.add("step12-requirement-editor");
  container.innerHTML = `
    <section id="boundary-requirements-editor" class="step12-requirements-card">
      <div class="step12-requirements-header">
        <div>
          <span>C</span>
          <h2>功能需求与面积组成</h2>
          <p>录入核心功能、使用人群、场地条件和功能面积分级表。</p>
        </div>
      </div>
      <div class="step12-requirement-grid">
        <article>
          <h3>场地条件 / SITE INFO</h3>
          <textarea data-requirement-field="siteCondition" rows="6" placeholder="例如：滨海公共空间节点，需要处理海岸、城市界面、步道、人流、视线与韧性问题。">${escapeHtml(
            model.siteCondition
          )}</textarea>
        </article>
        <article>
          <h3>功能组成 / PROGRAM</h3>
          <div class="step12-chip-list">${chipList(
            model.programItems,
            "尚未添加主要功能"
          )}</div>
        </article>
        <article>
          <h3>主要使用人群 / TARGET USERS</h3>
          <div class="step12-chip-list">${chipList(
            model.targetUserItems,
            "尚未添加使用人群"
          )}</div>
        </article>
      </div>
      <div class="step12-area-summary-card">
        <div>
          <h3>功能面积组成 / AREA PROGRAM</h3>
          <p>当前已记录 ${areaItems.length} 项功能面积，可在后续继续细化。</p>
        </div>
        <textarea data-requirement-field="areaProgram" rows="7" placeholder="可粘贴任务书中的功能面积分表。">${escapeHtml(
          serialized
        )}</textarea>
      </div>
    </section>
  `;
};

if (typeof document !== "undefined") {
  ensureStepOneEvents();
  const observer = new MutationObserver(() => queueRender());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  store.subscribe?.(queueRender);
  document.addEventListener("DOMContentLoaded", queueRender, { once: true });
  document.addEventListener("input", (event) => {
    const field = event.target.closest?.("[data-requirement-field]");
    if (!field) return;
    setLegacyFieldValue(field.dataset.requirementField, field.value);
  });
  queueRender();
}

export const deriveBoundaryReview = (packageData = {}) => {
  const data = packageData.data || {};
  const constraints = globalThis.ARCHICONCEPT_DATA_CHAIN?.buildDesignConstraintTable?.(data, packageData) || [];
  const norms = data.norms || recommendNormConstraints(data.projectIdentity?.buildingType, {
    needs: data.functionRequirements?.program,
    users: data.functionRequirements?.targetUsers
  });
  const normDesignConstraints = data.normDesignConstraints || resolveNormDesignConstraints(data);
  return {
    constraints,
    pendingConstraints: constraints.filter((item) => item.statusCode === "missing" || item.statusCode === "conflict"),
    confirmedConstraints: constraints.filter((item) => item.statusCode === "confirmed"),
    estimatedConstraints: constraints.filter((item) => item.statusCode === "estimated"),
    conflictConstraints: constraints.filter((item) => item.statusCode === "conflict"),
    norms,
    normDesignConstraints,
    missingItems: packageData.blockingItems || [],
    conflicts: data.conflicts || [],
    assumptions: packageData.assumptions || []
  };
};

export const useNormEstimate = () => false;
