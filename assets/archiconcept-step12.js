import {
  calculateAreaProgramItems,
  parseAreaProgram,
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
  const labelMap = {
    location: [/项目地点\s*\/\s*LOCATION/i, "建设地点 / LOCATION"],
    area: [/用地面积\s*\/\s*AREA/i, "用地面积 / SITE AREA"],
    gfa: [/总建筑面积\s*\/\s*GFA/i, "总建筑面积 / GFA"]
  };
  const entry = labelMap[name];
  if (entry) replaceTextNode(fieldNode, entry[0], entry[1]);
  const control = fieldNode?.querySelector?.("input, select, textarea");
  if (!control) return;
  if (name === "location") control.placeholder = "例如：中国 · 上海 · 浦东新区";
  if (name === "gfa") control.placeholder = "例如：12500";
};

const createStepOneExtraField = (name, label, value = "") => {
  const wrap = document.createElement("label");
  wrap.className = `step12-project-extra-field step12-project-extra-${name}`;
  wrap.innerHTML =
    name === "projectDescription"
      ? `
        <span>${label}</span>
        <textarea name="${name}" data-step1-extra-field="${name}" rows="4" placeholder="简要说明项目目标、服务对象、场地背景或任务书重点。">${escapeHtml(
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

const hideStepOneFunctionSection = () => {
  document.querySelector("#id-section-c")?.classList.add("step12-function-migrated-out");
};

const rebuildStepOneProjectInfoSection = () => {
  const sectionA = document.querySelector("#id-section-a");
  const sectionB = document.querySelector("#id-section-b");
  if (!sectionA) return;

  sectionA.classList.add("step12-project-info-section");
  sectionB?.classList.add("step12-scale-migrated-out");

  const heading = sectionA.firstElementChild;
  let grid = sectionA.querySelector("#step12-project-info-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "step12-project-info-grid";
    grid.className = "step12-project-info-grid";
    if (heading) heading.after(grid);
    else sectionA.prepend(grid);
  }

  ["name", "type", "location", "area", "gfa"].forEach((name) => {
    const fieldNode = getStepOneFieldNode(name);
    if (!fieldNode) return;
    fieldNode.classList.add("step12-project-info-field");
    fieldNode.dataset.step1Field = name;
    normalizeStepOneFieldLabels(fieldNode, name);
    grid.append(fieldNode);
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
    <div>
      <strong>资料入口</strong>
      <p>可导入任务书自动提取项目信息，也可以直接载入示例项目。</p>
    </div>
    <div class="step12-project-action-buttons">
      <button type="button" class="step12-secondary-action" data-action="step1-import-brief">任务书导入</button>
      <button type="button" class="step12-secondary-action" data-action="step1-demo-project">示例项目</button>
    </div>
  `;
};

const renderBoundarySections = () => {
  const left = getLeftColumn();
  if (!left) return;

  setSectionHeading(
    document.querySelector("#id-section-a"),
    "A",
    "项目基本信息",
    "填写项目名称、建筑类型、建设地点、面积指标和项目说明。"
  );

  let taskBrief = document.querySelector("#boundary-task-brief");
  if (!taskBrief) {
    taskBrief = document.createElement("section");
    taskBrief.id = "boundary-task-brief";
    taskBrief.className = "step12-task-brief";
    document.querySelector("#id-section-a")?.before(taskBrief);
  }
  taskBrief.innerHTML = `
    <div>
      <span>本页要完成什么</span>
      <strong>先把项目身份和规模边界说清楚。</strong>
      <p>本页只保留项目基本信息。功能组成与面积分配将在第 3 步继续处理。</p>
    </div>
    <ol aria-label="项目信息处理步骤">
      <li>填项目信息</li>
      <li>导入或载入示例</li>
      <li>进入基地与环境</li>
    </ol>
  `;

  rebuildStepOneProjectInfoSection();
  hideStepOneFunctionSection();
  document.querySelector("#boundary-anchor-review")?.remove();
};

const ensureStepOneEvents = () => {
  if (document.documentElement.dataset.step12ProjectEvents === "true") return;
  document.documentElement.dataset.step12ProjectEvents = "true";

  document.addEventListener("input", (event) => {
    const field = event.target.closest?.("[data-step1-extra-field]");
    if (!field) return;
    writeStepOneExtra({ [field.dataset.step1ExtraField]: field.value });
  });

  document.addEventListener("change", (event) => {
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
  const field = document.querySelector(`[name="${fieldName}"]`);
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
  return {
    constraints,
    pendingConstraints: constraints.filter((item) => item.statusCode === "missing" || item.statusCode === "conflict"),
    confirmedConstraints: constraints.filter((item) => item.statusCode === "confirmed"),
    estimatedConstraints: constraints.filter((item) => item.statusCode === "estimated"),
    conflictConstraints: constraints.filter((item) => item.statusCode === "conflict"),
    normDesignConstraints: [],
    missingItems: packageData.blockingItems || [],
    conflicts: data.conflicts || [],
    assumptions: packageData.assumptions || []
  };
};

export const useNormEstimate = () => false;
