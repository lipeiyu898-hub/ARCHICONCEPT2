import {
  buildDesignConstraintTable,
  calculateAreaProgramItems,
  deriveSiteInsights,
  deriveNormDownstreamEffects,
  estimateNormDesignConstraint,
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

const renderList = (items, emptyText) =>
  items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="step12-empty">${escapeHtml(emptyText)}</p>`;

const statusClass = (status) => {
  if (/已|完成|确认/.test(status)) return "is-complete";
  if (/冲突|阻断|异常/.test(status)) return "is-blocking";
  return "is-pending";
};

const deriveBoundaryReview = (packageData = {}) => {
  const data = packageData.data || {};
  const constraints = buildDesignConstraintTable(data, packageData);
  const normDesignConstraints = resolveNormDesignConstraints(data);
  const pendingConstraints = constraints
    .filter((item) => ["missing", "conflict"].includes(item.statusCode))
    .filter(
      (item, index, items) =>
        item.statusCode !== "conflict" ||
        items.findIndex(
          (candidate) =>
            candidate.statusCode === "conflict" &&
            candidate.issue === item.issue
        ) === index
    );
  const confirmedConstraints = constraints.filter(
    (item) => item.statusCode === "confirmed"
  );
  const estimatedConstraints = constraints.filter(
    (item) => item.statusCode === "estimated"
  );
  const conflictConstraints = pendingConstraints.filter(
    (item) => item.statusCode === "conflict"
  );
  return {
    norms: recommendNormConstraints(
      data.projectIdentity?.buildingType,
      data
    ),
    normDesignConstraints,
    normEffects: deriveNormDownstreamEffects(data),
    constraints,
    missingItems: [
      ...(packageData.blockingItems || []),
      ...(data.missingItems || [])
    ],
    conflicts: data.conflicts || [],
    assumptions: packageData.assumptions || [],
    pendingConstraints,
    confirmedConstraints,
    estimatedConstraints,
    conflictConstraints
  };
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

let requirementModal = null;

const updateNormConstraintDecision = (constraintId, decision) => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  const data = packageData.data || {};
  const decisions = {
    ...(data.normConstraintDecisions || {}),
    [constraintId]: {
      ...decision,
      updatedAt: new Date().toISOString()
    }
  };
  store.updatePackage(
    "boundaryAnchorPackage",
    {
      data: {
        normConstraintDecisions: decisions
      }
    },
    {
      source:
        decision.source === "systemInference" ? "systemInference" : "manualEdit",
      reason: `Norm design constraint ${constraintId} updated`,
      changedFields: [`normConstraintDecisions.${constraintId}`]
    }
  );
};

const openNormConstraintModal = (constraintId) => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  const constraint = resolveNormDesignConstraints(packageData.data).find(
    (item) => item.id === constraintId
  );
  if (!constraint) return;
  requirementModal = { kind: "norm", id: constraintId };
  document.querySelector(".step12-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "step12-modal-overlay";
  overlay.innerHTML = `
    <div class="step12-modal" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
      <header>
        <div><span>NORM CONSTRAINT</span><h3 id="step12-modal-title">${escapeHtml(constraint.label)}</h3></div>
        <button type="button" data-modal-action="close">×</button>
      </header>
      <div class="step12-modal-form">
        <label class="is-wide">
          <span>${escapeHtml(constraint.prompt)}</span>
          <select name="normValue">
            ${constraint.options
              .map(
                (option) =>
                  `<option value="${escapeHtml(option)}" ${option === constraint.value ? "selected" : ""}>${escapeHtml(option)}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="is-wide">
          <span>自定义条件（可选）</span>
          <textarea name="normCustomValue" placeholder="如果任务书或顾问已有明确要求，可在此填写。">${constraint.value && !constraint.options.includes(constraint.value) ? escapeHtml(constraint.value) : ""}</textarea>
        </label>
      </div>
      <p class="step12-modal-helper">保存后会写入设计约束基准。后续如果专业顾问给出正式意见，可以再覆盖。</p>
      <footer><span></span><div><button type="button" data-modal-action="close">取消</button><button type="button" class="is-primary" data-modal-action="save-norm">确认条件</button></div></footer>
    </div>
  `;
  document.body.append(overlay);
  overlay.querySelector('[name="normCustomValue"]')?.focus();
};

const saveNormConstraint = (overlay) => {
  const custom = overlay
    .querySelector('[name="normCustomValue"]')
    ?.value.trim();
  const selected = overlay.querySelector('[name="normValue"]')?.value;
  const value = custom || selected;
  if (!value) return;
  updateNormConstraintDecision(requirementModal.id, {
    value,
    status: "userConfirmed",
    source: "userInput"
  });
  closeRequirementModal();
};

const useNormEstimate = (constraintId) => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  const estimate = estimateNormDesignConstraint(
    constraintId,
    packageData.data
  );
  if (!estimate) return;
  updateNormConstraintDecision(constraintId, estimate);
};

const getLegacyField = (name) => {
  const direct = document.querySelector(
    `#id-section-c textarea[name="${name}"], #id-section-c input[name="${name}"]`
  );
  if (direct) return direct;
  const order = ["siteCondition", "needs", "users", "areaProgram"];
  const fields = [
    ...document.querySelectorAll("#id-section-c textarea, #id-section-c input")
  ];
  return fields[order.indexOf(name)] || null;
};

const setLegacyFieldValue = (name, value) => {
  const field = getLegacyField(name);
  if (field) {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const packageData = store.getPackage("boundaryAnchorPackage");
  const data = packageData?.data || {};
  const currentRequirements = data.functionRequirements || {};
  const patchData = {};
  const sourceField = `functionRequirements.${name}`;

  if (name === "siteCondition") {
    patchData.functionRequirements = {
      ...currentRequirements,
      siteCondition: value
    };
  } else if (name === "needs") {
    patchData.functionRequirements = {
      ...currentRequirements,
      program: value,
      programItems: splitRequirementItems(value)
    };
  } else if (name === "users") {
    patchData.functionRequirements = {
      ...currentRequirements,
      targetUsers: value,
      targetUserItems: splitRequirementItems(value)
    };
  } else if (name === "areaProgram") {
    const targetGfaM2 = Number(data.hardControls?.grossFloorAreaM2) || 0;
    const items = parseAreaProgram(value, targetGfaM2);
    patchData.areaProgram = {
      targetGfaM2: targetGfaM2 || null,
      items,
      allocatedAreaM2: items
        .filter((item) => Number(item.level) === 1 || !item.parentId)
        .reduce((sum, item) => sum + (Number(item.areaM2) || 0), 0),
      legacyText: value
    };
  } else {
    patchData[name] = value;
  }

  store.updatePackage(
    "boundaryAnchorPackage",
    {
      data: patchData
    },
    {
      source: "manualEdit",
      reason: "Edit migrated project requirement input",
      changedFields: [sourceField]
    }
  );
};

const STEP1_EXTRA_STORAGE_KEY = "archiconcept_step1_project_meta";

const STEP1_FORM_FIELDS = Object.freeze({
  name: {
    label: "项目名称 / NAME",
    placeholder: "例如：前海 AI 数据中心与市民活动地景复合建筑",
    source: "brief"
  },
  type: {
    label: "建筑类型 / TYPE",
    placeholder: "请选择建筑类型",
    source: "brief",
    control: "select"
  },
  nature: {
    label: "项目性质 / NATURE",
    placeholder: "请选择项目性质",
    source: "extra",
    control: "select",
    options: ["", "新建项目", "改造更新", "扩建项目", "临时建筑", "概念研究"]
  },
  phase: {
    label: "项目阶段 / PHASE",
    placeholder: "请选择项目阶段",
    source: "extra",
    control: "select",
    options: ["", "概念设计", "方案设计", "投标 / 竞赛", "前期研究"]
  },
  location: {
    label: "项目所在地 / LOCATION",
    placeholder: "例如：深圳市前海深港湾公共空间节点",
    source: "brief"
  },
  briefSource: {
    label: "任务来源 / BRIEF SOURCE",
    placeholder: "请选择任务来源",
    source: "extra",
    control: "select",
    options: [
      "",
      "课程设计 / Course Project",
      "竞赛项目 / Competition",
      "真实委托 / Commission",
      "研究课题 / Research",
      "其他 / Other"
    ]
  },
  area: {
    label: "用地面积 / SITE AREA",
    placeholder: "例如：2446、2.5ha 或 2.5公顷",
    source: "brief"
  },
  gfa: {
    label: "总建筑面积 / GFA",
    placeholder: "例如：120,000 m²",
    source: "brief"
  },
  far: {
    label: "容积率 / FAR",
    placeholder: "例如：2.4",
    source: "brief"
  },
  height: {
    label: "建筑限高 / HEIGHT LIMIT",
    placeholder: "例如：45m",
    source: "brief"
  },
  description: {
    label: "设计说明 / DESCRIPTION",
    placeholder:
      "请简要说明你想做什么建筑、服务对象、场地背景、目标或任务书重点。",
    source: "extra",
    control: "textarea"
  }
});

const STEP1_REQUIRED_KEYS = Object.freeze([
  "name",
  "type",
  "nature",
  "phase",
  "location",
  "briefSource",
  "area",
  "gfa"
]);

const readStepOneExtra = () => {
  try {
    return JSON.parse(localStorage.getItem(STEP1_EXTRA_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeStepOneExtraValue = (key, value) => {
  const next = { ...readStepOneExtra(), [key]: value };
  localStorage.setItem(STEP1_EXTRA_STORAGE_KEY, JSON.stringify(next));
};

const getBriefField = (name) =>
  document.querySelector(
    `#id-section-a input[name="${name}"]:not([data-step1-proxy-field]), #id-section-a select[name="${name}"]:not([data-step1-proxy-field]), #id-section-a textarea[name="${name}"]:not([data-step1-proxy-field]), #id-section-b input[name="${name}"]:not([data-step1-proxy-field]), #id-section-b select[name="${name}"]:not([data-step1-proxy-field]), #id-section-b textarea[name="${name}"]:not([data-step1-proxy-field])`
  );

const readStepOneFieldValue = (key) => {
  const config = STEP1_FORM_FIELDS[key];
  if (!config) return "";
  if (config.source === "extra") return readStepOneExtra()[key] || "";
  return getBriefField(key)?.value || "";
};

const setBriefFieldValue = (key, value) => {
  const field = getBriefField(key);
  if (!field) return;
  const prototype =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
};

const cloneBriefOptions = (key, fallbackOptions = []) => {
  const source = getBriefField(key);
  const sourceOptions =
    source instanceof HTMLSelectElement
      ? [...source.options].map((option) => ({
          value: option.value,
          text: option.textContent || option.value
        }))
      : [];
  const options = sourceOptions.length
    ? sourceOptions
    : fallbackOptions.map((item) => ({
        value: item,
        text: item || STEP1_FORM_FIELDS[key]?.placeholder || "请选择"
      }));
  if (options[0]?.value !== "") {
    options.unshift({
      value: "",
      text: STEP1_FORM_FIELDS[key]?.placeholder || "请选择"
    });
  }
  return options;
};

const createStepOneControl = (key) => {
  const config = STEP1_FORM_FIELDS[key];
  if (config.control === "select") {
    const select = document.createElement("select");
    select.innerHTML = cloneBriefOptions(key, config.options || [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.text)}</option>`
      )
      .join("");
    select.setAttribute(
      config.source === "extra" ? "data-step1-extra-field" : "data-step1-proxy-field",
      key
    );
    select.setAttribute("aria-label", config.label);
    return select;
  }
  if (config.control === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.setAttribute("placeholder", config.placeholder);
    textarea.setAttribute("data-step1-extra-field", key);
    textarea.setAttribute("aria-label", config.label);
    return textarea;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("placeholder", config.placeholder);
  input.setAttribute("data-step1-proxy-field", key);
  input.setAttribute("aria-label", config.label);
  return input;
};

const createStepOneField = (key, wide = false) => {
  const config = STEP1_FORM_FIELDS[key];
  const field = document.createElement("label");
  field.className = `step12-project-field${wide ? " is-wide" : ""}`;
  field.dataset.step1Field = key;
  if (key !== "description") {
    field.innerHTML = `
      <span>${escapeHtml(config.label)}${
        STEP1_REQUIRED_KEYS.includes(key) ? " <em>*</em>" : ""
      }</span>
    `;
  }
  field.appendChild(createStepOneControl(key));
  return field;
};

const syncStepOneUnifiedForm = () => {
  document
    .querySelectorAll("[data-step1-proxy-field], [data-step1-extra-field]")
    .forEach((field) => {
      if (field === document.activeElement) return;
      const key =
        field.getAttribute("data-step1-proxy-field") ||
        field.getAttribute("data-step1-extra-field");
      field.value = readStepOneFieldValue(key);
    });
  const title = document.querySelector(".step12-project-name-input");
  if (title && title !== document.activeElement) {
    title.value = readStepOneFieldValue("name") || "新建建筑设计项目";
  }
};

const notifyWorkflowRender = () => {
  window.dispatchEvent(new Event("archiconcept:workflow-v2-render"));
};

const renderStepOneProjectHeader = () => {
  const main = document.querySelector("main:has(#id-section-a)");
  if (!main) return;
  const sourceHeader =
    main.querySelector(".step12-source-input-header") ||
    main.querySelector(".step12-legacy-input-header:not(#step12-project-hero)");

  let header = document.querySelector("#step12-project-hero");
  if (!header) {
    header = document.createElement("section");
    header.id = "step12-project-hero";
    header.className = "step12-project-hero";
    const timeline = main.querySelector('[data-workflow-v2-timeline="true"]');
    (sourceHeader || timeline || main.firstElementChild)?.before(header);
  }
  header.classList.remove("step12-legacy-input-header", "step12-source-input-header");

  if (!header.querySelector(".step12-project-hero-actions")) {
    header.innerHTML = `
    <div class="step12-project-hero-copy">
      <div class="step12-project-title-row">
        <input class="step12-project-name-input" aria-label="项目名称" value="新建建筑设计项目" />
        <button type="button" class="step12-project-edit" aria-label="编辑项目名称">✎</button>
      </div>
      <div class="step12-project-meta">
        <span>项目编号：PRJ-20240520-001</span>
        <span>创建时间：2024-05-20 10:30</span>
        <span>保存中...</span>
      </div>
    </div>
    <div class="step12-project-hero-actions"></div>
  `;
  }
  const actions = header.querySelector(".step12-project-hero-actions");
  const title = header.querySelector(".step12-project-name-input");
  if (title && title !== document.activeElement) {
    title.value = readStepOneFieldValue("name") || "新建建筑设计项目";
  }
  const buttons = [...(sourceHeader?.querySelectorAll("button") || [])].filter(
    (button) =>
      /导入任务书|IMPORT BRIEF|使用示例项目|TRY EXAMPLE|清空输入|CLEAR/i.test(
        button.textContent || ""
      )
  );
  buttons.forEach((button) => actions.appendChild(button));
  sourceHeader?.classList.add("step12-source-input-header");
};

const hideStepOneIntroLine = () => {
  const main = document.querySelector("main:has(#id-section-a)");
  [...(main?.children || [])]
    .filter((child) =>
      /本阶段先确认项目条件/.test(child.textContent || "")
    )
    .forEach((child) => child.classList.add("step12-boundary-intro-line"));
};

const renderStepOneUnifiedForm = () => {
  const sectionA = document.querySelector("#id-section-a");
  const sectionB = document.querySelector("#id-section-b");
  if (!sectionA) return;
  sectionA.classList.add("step12-legacy-project-section");
  sectionB?.classList.add("step12-legacy-scale-section");

  let card = document.querySelector("#step12-project-start-card");
  if (!card) {
    card = document.createElement("section");
    card.id = "step12-project-start-card";
    card.className = "step12-project-start-card";
    sectionA.before(card);
    card.innerHTML = `
      <header class="step12-project-start-header">
        <span class="step12-project-start-index">A</span>
        <div>
          <h2>项目基本信息</h2>
          <p>填写项目核心信息，为后续设计分析与方案生成提供基础依据。</p>
        </div>
      </header>
      <div class="step12-project-form-section" data-step1-section="base">
        <h3>基础信息</h3>
        <div class="step12-project-form-grid"></div>
      </div>
      <div class="step12-project-form-section" data-step1-section="scale">
        <h3>建设规模</h3>
        <div class="step12-project-form-grid"></div>
      </div>
      <div class="step12-project-form-section" data-step1-section="description">
        <h3>设计说明 / DESCRIPTION</h3>
        <div class="step12-project-form-grid"></div>
      </div>
    `;
    const baseGrid = card.querySelector(
      '[data-step1-section="base"] .step12-project-form-grid'
    );
    ["name", "type", "nature", "phase", "location", "briefSource"].forEach((key) =>
      baseGrid.appendChild(createStepOneField(key))
    );
    const scaleGrid = card.querySelector(
      '[data-step1-section="scale"] .step12-project-form-grid'
    );
    ["area", "gfa", "far", "height"].forEach((key) =>
      scaleGrid.appendChild(createStepOneField(key))
    );
    card
      .querySelector('[data-step1-section="description"] .step12-project-form-grid')
      .appendChild(createStepOneField("description", true));
  }
  syncStepOneUnifiedForm();
};

const resetStepOneUnifiedForm = () => {
  localStorage.removeItem(STEP1_EXTRA_STORAGE_KEY);
  ["name", "type", "location", "area", "gfa", "far", "height"].forEach((key) =>
    setBriefFieldValue(key, "")
  );
  syncStepOneUnifiedForm();
  notifyWorkflowRender();
  queueRender();
};

const bindStepOneUnifiedFormEvents = () => {
  if (document.documentElement.dataset.step12UnifiedProjectEvents === "true") {
    return;
  }
  document.documentElement.dataset.step12UnifiedProjectEvents = "true";
  const handleFieldChange = (event) => {
    const title = event.target.closest?.(".step12-project-name-input");
    const proxy = event.target.closest?.("[data-step1-proxy-field]");
    const extra = event.target.closest?.("[data-step1-extra-field]");
    if (title) setBriefFieldValue("name", title.value);
    if (proxy) setBriefFieldValue(proxy.dataset.step1ProxyField, proxy.value);
    if (extra) writeStepOneExtraValue(extra.dataset.step1ExtraField, extra.value);
    if (title || proxy || extra) {
      syncStepOneUnifiedForm();
      notifyWorkflowRender();
      queueRender();
    }
  };
  document.addEventListener("input", handleFieldChange);
  document.addEventListener("change", handleFieldChange);
  document.addEventListener("click", (event) => {
    const edit = event.target.closest?.(".step12-project-edit");
    if (edit) {
      const title = document.querySelector(".step12-project-name-input");
      title?.focus();
      title?.select();
      return;
    }
    const button = event.target.closest?.("button");
    if (!button || !/清空输入|CLEAR/i.test(button.textContent || "")) return;
    setTimeout(resetStepOneUnifiedForm, 0);
  });
};

const constraintVisualTarget = (field) => {
  if (field.startsWith("norm:")) {
    return document.querySelector(
      `[data-norm-constraint-id="${CSS.escape(field.slice(5))}"]`
    );
  }
  if (field === "needs") {
    return document.querySelector(
      "#boundary-requirements-editor .step12-chip-panel:nth-child(2)"
    );
  }
  if (field === "users") {
    return document.querySelector(
      "#boundary-requirements-editor .step12-chip-panel:nth-child(3)"
    );
  }
  if (field === "areaProgram") {
    return document.querySelector(
      "#boundary-requirements-editor .step12-function-composition"
    );
  }
  if (field === "siteCondition") {
    return document.querySelector(
      "#boundary-requirements-editor .step12-site-condition"
    );
  }
  const input = document.querySelector(
    `#id-section-a [name="${field}"], #id-section-b [name="${field}"], #id-section-c [name="${field}"]`
  );
  return input?.closest("label") || input?.parentElement || input;
};

const locateConstraintTarget = (field) => {
  const target = constraintVisualTarget(field);
  if (!target) return;
  document
    .querySelectorAll(".step12-constraint-highlight")
    .forEach((item) => item.classList.remove("step12-constraint-highlight"));
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("step12-constraint-highlight");
  const focusTarget = target.matches?.("input, textarea, select")
    ? target
    : target.querySelector?.("input, textarea, select, button");
  globalThis.setTimeout(() => focusTarget?.focus?.({ preventScroll: true }), 450);
  globalThis.setTimeout(
    () => target.classList.remove("step12-constraint-highlight"),
    2400
  );
};

const exportConstraintTable = () => {
  const review = deriveBoundaryReview(
    store.getPackage("boundaryAnchorPackage")
  );
  const headers = [
    "类别",
    "约束项",
    "当前值",
    "来源",
    "状态",
    "处理方式"
  ];
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = review.constraints.map((item) =>
    [
      item.category,
      item.label,
      item.currentValue,
      item.source,
      item.status,
      item.action
    ]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob([`\uFEFF${headers.map(csvCell).join(",")}\n${rows.join("\n")}`], {
    type: "text/csv;charset=utf-8"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ARCHICONCEPT-设计约束基准.csv";
  link.click();
  URL.revokeObjectURL(link.href);
};

const currentRequirementModel = (packageData = {}) => {
  const data = packageData.data || {};
  const requirements = data.functionRequirements || {};
  const fieldValue = (name, fallback = "") =>
    getLegacyField(name)?.value ?? fallback;
  const programText = fieldValue("needs", requirements.program || "");
  const usersText = fieldValue("users", requirements.targetUsers || "");
  const areaValue = fieldValue(
    "areaProgram",
    data.areaProgram?.legacyText || ""
  );
  return {
    siteCondition: fieldValue(
      "siteCondition",
      requirements.siteCondition || ""
    ),
    programItems: splitRequirementItems(programText),
    targetUserItems: splitRequirementItems(usersText),
    areaItems: parseAreaProgram(
      areaValue || data.areaProgram,
      Number(data.hardControls?.grossFloorAreaM2) || 0
    ),
    targetGfaM2: Number(data.hardControls?.grossFloorAreaM2) || 0
  };
};

const formatArea = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(
    Number(value) || 0
  );

const rootAreaTotal = (items) =>
  items
    .filter(
      (item) =>
        !item.parentId ||
        !items.some((parent) => parent.id === item.parentId)
    )
    .reduce((sum, item) => sum + Number(item.areaM2 || 0), 0);

const renderChips = (items, type, emptyText) =>
  items.length
    ? items
        .map(
          (item, index) => `
          <button type="button" class="step12-requirement-chip" data-action="edit-chip" data-type="${type}" data-index="${index}">
            <span>${escapeHtml(item)}</span><em aria-hidden="true">×</em>
          </button>`
        )
        .join("")
    : `<span class="step12-chip-empty">${escapeHtml(emptyText)}</span>`;

const renderFunctionCompositionChips = (items) => {
  return items.length
    ? items
        .map(
          (item) => `
          <button type="button" class="step12-function-chip is-level-${Number(item.level) || 1}" data-action="open-area-program" title="查看或修改功能面积组成">
            <span>${escapeHtml(item.name)}</span>
            <em>${formatArea(item.areaM2)}㎡</em>
          </button>`
        )
        .join("")
    : `<span class="step12-chip-empty">尚未建立功能面积组成</span>`;
};

const renderAreaRows = (items) =>
  items.length
    ? items
        .map((item) => {
          const children = items.filter((child) => child.parentId === item.id);
          const hasChildren = children.length > 0;
          const difference = Number(item.areaDifferenceM2) || 0;
          return `
          <div class="step12-area-row is-level-${item.level} ${Math.abs(difference) > 0.5 ? "has-area-difference" : ""}" role="row" data-area-id="${escapeHtml(item.id)}">
            <span><i>${item.level} 级</i></span>
            <strong style="--area-level:${item.level}">
              ${escapeHtml(item.name)}
              ${
                hasChildren
                  ? `<small>包含 ${children.length} 个直属子项${
                      Math.abs(difference) > 0.5
                        ? ` · 与任务书声明相差 ${formatArea(Math.abs(difference))}㎡`
                        : " · 明细合计一致"
                    }</small>`
                  : ""
              }
            </strong>
            <span>${formatArea(item.areaM2)} ㎡</span>
            <span>${hasChildren ? "汇总" : item.quantity}</span>
            <span>${hasChildren ? `子项合计 ${formatArea(item.childAreaM2 || item.areaM2)}㎡` : `${formatArea(item.unitAreaM2)} ㎡`}</span>
            <span class="step12-area-actions">
              <button type="button" data-action="edit-area" data-id="${escapeHtml(item.id)}">编辑</button>
              ${item.level === 1 ? `<button type="button" data-action="complete-area-children" data-id="${escapeHtml(item.id)}">补全下级</button>` : ""}
              <button type="button" data-action="delete-area" data-id="${escapeHtml(item.id)}">删除</button>
            </span>
          </div>`;
        })
        .join("")
    : `
      <div class="step12-area-empty">
        <strong>尚未建立功能面积分表</strong>
        <span>新增一级功能后，可以一次补充其二级和三级功能。导入任务书时，系统会先识别功能层级供你确认。</span>
      </div>`;

const renderAreaProgramPanel = (items, allocated, targetGfaM2) => {
  const remaining = targetGfaM2 ? targetGfaM2 - allocated : null;
  return `
    <section class="step12-area-program">
      <header>
        <div>
          <span>功能面积组成 <em>/ AREA PROGRAM</em></span>
          <p>录入一级、二级和三级功能。父级面积用于核对，统计时不会重复计入。</p>
        </div>
        <button type="button" data-action="add-area">＋ 新增一级功能</button>
      </header>
      <div class="step12-area-table" role="table" aria-label="功能面积组成">
        <div class="step12-area-row is-head" role="row">
          <span>层级</span><span>功能名称</span><span>总面积</span><span>数量</span><span>单项面积</span><span>操作</span>
        </div>
        ${renderAreaRows(items)}
      </div>
      <footer class="step12-area-summary">
        <span>已分配 <strong>${formatArea(allocated)} ㎡</strong></span>
        ${
          targetGfaM2
            ? `<span>总建筑面积 <strong>${formatArea(targetGfaM2)} ㎡</strong></span>
               <span class="${remaining < 0 ? "is-over" : ""}">剩余 <strong>${formatArea(remaining)} ㎡</strong></span>`
            : `<span>填写总建筑面积后可校核分配差额</span>`
        }
      </footer>
    </section>
  `;
};

const syncProgramSummaryFromAreaItems = (items) => {
  const rootNames = calculateAreaProgramItems(items)
    .filter((item) => Number(item.level) === 1)
    .map((item) => item.name)
    .filter(Boolean);
  setLegacyFieldValue("needs", [...new Set(rootNames)].join("、"));
};

const openAreaProgramModal = () => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  const model = currentRequirementModel(packageData);
  const items = calculateAreaProgramItems(model.areaItems);
  const allocated = rootAreaTotal(items);
  requirementModal = { kind: "areaProgram" };
  document.querySelector(".step12-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "step12-modal-overlay";
  overlay.innerHTML = `
    <div class="step12-modal is-area-program-editor" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
      <header>
        <div>
          <span>AREA PROGRAM</span>
          <h3 id="step12-modal-title">功能面积组成</h3>
        </div>
        <button type="button" data-modal-action="close">×</button>
      </header>
      <div class="step12-area-program-modal-body">
        ${renderAreaProgramPanel(items, allocated, model.targetGfaM2)}
      </div>
      <footer>
        <span class="step12-modal-helper-text">保存后会回到 C 区，并自动更新“功能组成”标签。</span>
        <div>
          <button type="button" class="is-primary" data-modal-action="close">保存并返回</button>
        </div>
      </footer>
    </div>
  `;
  document.body.append(overlay);
};

const openSiteConditionModal = () => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  const model = currentRequirementModel(packageData);
  requirementModal = { kind: "siteCondition" };
  document.querySelector(".step12-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "step12-modal-overlay";
  overlay.innerHTML = `
    <div class="step12-modal is-site-condition-editor" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
      <header>
        <div>
          <span>SITE INFO</span>
          <h3 id="step12-modal-title">场地条件</h3>
        </div>
        <button type="button" data-modal-action="close">×</button>
      </header>
      <div class="step12-modal-form">
        <label class="is-wide">
          <span>场地条件说明</span>
          <textarea name="siteConditionValue" autofocus placeholder="例如：滨海公共空间节点，需处理海岸、城市界面、步道、人流、视线与韧性问题。">${escapeHtml(model.siteCondition)}</textarea>
        </label>
      </div>
      <footer>
        <span></span>
        <div>
          <button type="button" data-modal-action="close">取消</button>
          <button type="button" class="is-primary" data-modal-action="save-site-condition">保存</button>
        </div>
      </footer>
    </div>
  `;
  document.body.append(overlay);
  overlay.querySelector("[autofocus]")?.focus();
};

const saveSiteCondition = (overlay) => {
  const value =
    overlay.querySelector('[name="siteConditionValue"]')?.value.trim() || "";
  setLegacyFieldValue("siteCondition", value);
  closeRequirementModal();
  queueRender();
};

const renderRequirementEditor = (packageData, mountSection = document.querySelector("#id-section-c")) => {
  const section = mountSection;
  if (!section) return;
  const legacyBody = [...section.children].find(
    (child, index) => index > 0 && child.querySelector?.("textarea")
  );
  legacyBody?.classList.add("step12-c-legacy-fields");

  let editor = section.querySelector("#boundary-requirements-editor");
  if (!editor) {
    editor = document.createElement("div");
    editor.id = "boundary-requirements-editor";
    if (legacyBody) legacyBody.after(editor);
    else section.append(editor);
  }

  const model = currentRequirementModel(packageData);
  const items = calculateAreaProgramItems(model.areaItems);
  const allocated = rootAreaTotal(items);
  const signature = JSON.stringify({
    siteCondition: model.siteCondition,
    programItems: model.programItems,
    targetUserItems: model.targetUserItems,
    items,
    targetGfaM2: model.targetGfaM2
  });
  if (editor.dataset.renderSignature === signature) return;
  editor.dataset.renderSignature = signature;
  editor.innerHTML = `
    <div class="step12-requirement-grid">
      <section class="step12-site-condition">
        <header><span>场地条件 <em>/ SITE INFO</em></span></header>
        <button type="button" class="step12-site-condition-preview" data-action="edit-site-condition">
          ${model.siteCondition ? escapeHtml(model.siteCondition) : "尚未填写场地条件"}
        </button>
        <button type="button" class="step12-add-inline" data-action="edit-site-condition">${model.siteCondition ? "查看 / 修改场地条件" : "填写场地条件"}</button>
      </section>
      <section class="step12-chip-panel step12-function-composition">
        <header>
          <span>功能组成 <em>/ PROGRAM</em></span>
          <small>${items.length ? `${items.length} 项功能` : "待建立"}</small>
        </header>
        <div class="step12-chip-list">${renderFunctionCompositionChips(items)}</div>
        <button type="button" class="step12-add-inline" data-action="open-area-program">${items.length ? "查看 / 修改功能面积" : "建立功能面积组成"}</button>
      </section>
      <section class="step12-chip-panel">
        <header><span>主要使用人群 <em>/ TARGET USERS</em></span></header>
        <div class="step12-chip-list">${renderChips(
          model.targetUserItems,
          "users",
          "尚未添加使用人群"
        )}</div>
        <button type="button" class="step12-add-inline" data-action="add-chip" data-type="users">＋ 添加人群</button>
      </section>
    </div>
  `;
};

const renderFunctionRequirementEditor = (mountSection) => {
  const packageData = store.getPackage("boundaryAnchorPackage");
  if (!packageData || !mountSection) return;
  renderRequirementEditor(packageData, mountSection);
  bindRequirementEvents();
};

const renderStepOneFunctionBridge = (packageData) => {
  const section = document.querySelector("#id-section-c");
  if (!section) return;
  const model = currentRequirementModel(packageData);
  const items = calculateAreaProgramItems(model.areaItems);
  const programs = items.length
    ? items.slice(0, 8).map((item) => item.name)
    : model.programItems.slice(0, 8);
  setSectionHeading(
    section,
    "C",
    "功能与空间",
    "功能组成、使用人群、场地条件和面积分级表将在第 3 步集中处理。"
  );
  [...section.children].forEach((child, index) => {
    if (index > 0) child.classList.add("step12-c-legacy-fields");
  });
  let bridge = section.querySelector("#boundary-function-step-bridge");
  if (!bridge) {
    bridge = document.createElement("div");
    bridge.id = "boundary-function-step-bridge";
    section.append(bridge);
  }
  bridge.classList.remove("step12-c-legacy-fields");
  bridge.innerHTML = `
    <div class="step12-bridge-card">
      <div>
        <span>已迁移到 Step 3</span>
        <strong>功能需求与面积组成将在“功能与空间”中完成。</strong>
        <p>本页只保留项目基本信息和规模边界。已导入或已填写的功能数据不会丢失，会在第 3 步继续编辑。</p>
      </div>
      <div class="step12-bridge-summary">
        <span>功能项 ${items.length || model.programItems.length || 0}</span>
        <span>使用人群 ${model.targetUserItems.length || 0}</span>
      </div>
    </div>
    ${
      programs.length
        ? `<div class="step12-bridge-chips">${programs
            .map((item) => `<span>${escapeHtml(item)}</span>`)
            .join("")}</div>`
        : ""
    }
  `;
};

const hideStepOneFunctionSection = () => {
  const section = document.querySelector("#id-section-c");
  if (!section) return;
  section.classList.add("step12-function-migrated-out");
  section
    .querySelector("#boundary-requirements-editor, #boundary-function-step-bridge")
    ?.remove();
};

const closeRequirementModal = () => {
  document.querySelector(".step12-modal-overlay")?.remove();
  requirementModal = null;
};

let areaChildRowSequence = 0;

const areaDescendantIds = (items, parentId) => {
  const ids = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((item) => {
      if (
        (item.parentId === parentId || ids.has(item.parentId)) &&
        !ids.has(item.id)
      ) {
        ids.add(item.id);
        changed = true;
      }
    });
  }
  return ids;
};

const childRowMarkup = (item = {}, defaultLevel = 2) => {
  const rowKey = item.id || `area-child-${Date.now()}-${++areaChildRowSequence}`;
  const level = Number(item.level) || defaultLevel;
  return `
    <div class="step12-area-child-row" data-child-row="${escapeHtml(rowKey)}" data-existing-id="${escapeHtml(item.id || "")}" data-parent-ref="${escapeHtml(item.parentId || "")}">
      <select name="childLevel" aria-label="功能层级">
        <option value="2" ${level === 2 ? "selected" : ""}>二级</option>
        <option value="3" ${level === 3 ? "selected" : ""}>三级</option>
      </select>
      <input name="childName" value="${escapeHtml(item.name || "")}" placeholder="${level === 3 ? "三级功能名称" : "二级功能名称"}" aria-label="功能名称" />
      <select name="childParent" aria-label="上级功能"></select>
      <input name="childQuantity" type="number" min="1" step="1" value="${item.quantity || 1}" aria-label="数量" />
      <input name="childUnitArea" type="number" min="0" step="1" value="${item.unitAreaM2 || ""}" placeholder="㎡" aria-label="单项面积" />
      <button type="button" data-modal-action="remove-child-row" aria-label="删除此行">删除</button>
    </div>`;
};

const refreshChildParentOptions = (overlay) => {
  const rootName = requirementModal?.parentName || "一级功能";
  const levelTwoRows = [
    ...overlay.querySelectorAll('.step12-area-child-row select[name="childLevel"]')
  ]
    .filter((select) => Number(select.value) === 2)
    .map((select) => {
      const row = select.closest(".step12-area-child-row");
      return {
        key: row.dataset.childRow,
        name:
          row.querySelector('input[name="childName"]')?.value.trim() ||
          "未命名二级功能"
      };
    });
  overlay.querySelectorAll(".step12-area-child-row").forEach((row) => {
    const level = Number(row.querySelector('[name="childLevel"]')?.value) || 2;
    const parent = row.querySelector('[name="childParent"]');
    if (!parent) return;
    if (level === 2) {
      parent.innerHTML = `<option value="${escapeHtml(requirementModal.parentId)}">${escapeHtml(rootName)}</option>`;
      parent.disabled = true;
      return;
    }
    const previous = row.dataset.parentRef || parent.value;
    parent.disabled = false;
    parent.innerHTML = levelTwoRows.length
      ? levelTwoRows
          .map(
            (item) =>
              `<option value="${escapeHtml(item.key)}" ${item.key === previous ? "selected" : ""}>${escapeHtml(item.name)}</option>`
          )
          .join("")
      : '<option value="">请先添加二级功能</option>';
  });
  const root = requirementModal?.sourceItems?.find(
    (item) => item.id === requirementModal.parentId
  );
  const declared = Number(root?.declaredAreaM2 || root?.areaM2) || 0;
  const levelTwoTotal = [
    ...overlay.querySelectorAll(".step12-area-child-row")
  ]
    .filter(
      (row) =>
        Number(row.querySelector('[name="childLevel"]')?.value) === 2
    )
    .reduce((sum, row) => {
      const quantity = Math.max(
        1,
        Number(row.querySelector('[name="childQuantity"]')?.value) || 1
      );
      const unitArea =
        Number(row.querySelector('[name="childUnitArea"]')?.value) || 0;
      return sum + quantity * unitArea;
    }, 0);
  const summary = overlay.querySelector(".step12-area-child-summary");
  if (summary) {
    const difference = levelTwoTotal - declared;
    summary.innerHTML = `二级功能合计 <strong>${formatArea(levelTwoTotal)}㎡</strong>${
      declared
        ? ` · 与一级声明面积${
            Math.abs(difference) <= 0.5
              ? "一致"
              : `相差 <strong>${formatArea(Math.abs(difference))}㎡</strong>`
          }`
        : ""
    }`;
  }
};

const appendAreaChildRow = (overlay, item = {}, defaultLevel = 2) => {
  const list = overlay.querySelector(".step12-area-child-list");
  if (!list) return;
  list.insertAdjacentHTML("beforeend", childRowMarkup(item, defaultLevel));
  refreshChildParentOptions(overlay);
  list.lastElementChild?.querySelector('input[name="childName"]')?.focus();
};

const openAreaChildrenModal = (parentItem, sourceItems) => {
  const items = calculateAreaProgramItems(sourceItems || []);
  const descendantIds = areaDescendantIds(items, parentItem.id);
  const descendants = items.filter((item) => descendantIds.has(item.id));
  requirementModal = {
    kind: "areaChildren",
    parentId: parentItem.id,
    parentName: parentItem.name,
    sourceItems: items
  };
  document.querySelector(".step12-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "step12-modal-overlay";
  overlay.innerHTML = `
    <div class="step12-modal is-area-structure" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
      <header>
        <div><span>AREA PROGRAM</span><h3 id="step12-modal-title">完善“${escapeHtml(parentItem.name)}”的下级功能</h3></div>
        <button type="button" data-modal-action="close">×</button>
      </header>
      <div class="step12-area-structure-intro">
        <p>一次补充二级、三级功能。父级面积只作为汇总，不会与子项重复计入总面积。</p>
        <div><strong>${formatArea(parentItem.declaredAreaM2 || parentItem.areaM2)}㎡</strong><span>一级功能声明面积</span></div>
      </div>
      <div class="step12-area-child-head">
        <span>层级</span><span>功能名称</span><span>上级功能</span><span>数量</span><span>单项面积</span><span>操作</span>
      </div>
      <div class="step12-area-child-list"></div>
      <div class="step12-area-child-actions">
        <button type="button" data-modal-action="add-level-two">＋ 添加二级功能</button>
        <button type="button" data-modal-action="add-level-three">＋ 添加三级功能</button>
        <span>可连续填写多行；三级功能需选择所属二级功能。</span>
      </div>
      <div class="step12-area-child-summary" aria-live="polite"></div>
      <footer>
        <button type="button" data-modal-action="close">暂不细分</button>
        <div><button type="button" class="is-primary" data-modal-action="save-area-children">保存功能结构</button></div>
      </footer>
    </div>`;
  document.body.append(overlay);
  (descendants.length ? descendants : [{}, {}, {}]).forEach((item) =>
    appendAreaChildRow(overlay, item, Number(item.level) || 2)
  );
  refreshChildParentOptions(overlay);
};

const openRequirementModal = (config) => {
  requirementModal = config;
  document.querySelector(".step12-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "step12-modal-overlay";
  const packageData = store.getPackage("boundaryAnchorPackage");
  const model = currentRequirementModel(packageData);
  const item =
    config.kind === "area"
      ? model.areaItems.find((entry) => entry.id === config.id) || {}
      : {};
  const itemHasChildren = model.areaItems.some(
    (entry) => entry.parentId === item.id
  );
  const level = Number(item.level) || 1;
  const parentOptions = model.areaItems
    .filter((entry) => entry.level === Math.max(1, level - 1))
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.id)}" ${entry.id === item.parentId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`
    )
    .join("");
  const chipItems =
    config.type === "program" ? model.programItems : model.targetUserItems;
  const chipValue =
    config.index === undefined ? "" : chipItems[config.index] || "";
  overlay.innerHTML =
    config.kind === "area"
      ? `
        <div class="step12-modal" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
          <header><div><span>AREA PROGRAM</span><h3 id="step12-modal-title">${item.id ? "编辑功能面积" : "添加功能面积"}</h3></div><button type="button" data-modal-action="close">×</button></header>
          <div class="step12-modal-form">
            <label><span>功能层级</span><select name="level">
              <option value="1" ${level === 1 ? "selected" : ""}>一级功能</option>
              <option value="2" ${level === 2 ? "selected" : ""}>二级功能</option>
              <option value="3" ${level === 3 ? "selected" : ""}>三级功能</option>
            </select></label>
            <label><span>上级功能</span><select name="parentId"><option value="">无上级</option>${parentOptions}</select></label>
            <label class="is-wide"><span>功能名称</span><input name="name" value="${escapeHtml(item.name || "")}" placeholder="例如：菜市场及食品店铺" autofocus /></label>
            <label><span>数量</span><input name="quantity" type="number" min="1" step="1" value="${item.quantity || 1}" ${itemHasChildren ? "disabled" : ""} /></label>
            <label><span>单项面积（㎡）</span><input name="unitAreaM2" type="number" min="0" step="1" value="${item.unitAreaM2 || ""}" ${itemHasChildren ? "disabled" : ""} /></label>
          </div>
          <p class="step12-modal-helper">${itemHasChildren ? "该功能包含子项，总面积由子项自动汇总。" : "总面积按“数量 × 单项面积”计算；添加子项后，父级总面积自动取子项之和。"}</p>
          <footer>${item.id ? '<button type="button" class="is-danger" data-modal-action="delete-area">删除</button>' : "<span></span>"}<div><button type="button" data-modal-action="close">取消</button><button type="button" class="is-primary" data-modal-action="save-area">保存</button></div></footer>
        </div>`
      : `
        <div class="step12-modal is-compact" role="dialog" aria-modal="true" aria-labelledby="step12-modal-title">
          <header><div><span>${config.type === "program" ? "PROGRAM" : "TARGET USERS"}</span><h3 id="step12-modal-title">${config.index === undefined ? "添加" : "编辑"}${config.type === "program" ? "主要功能" : "使用人群"}</h3></div><button type="button" data-modal-action="close">×</button></header>
          <div class="step12-modal-form"><label class="is-wide"><span>名称</span><input name="chipValue" value="${escapeHtml(chipValue)}" placeholder="${config.type === "program" ? "例如：展览展示" : "例如：市民游客"}" autofocus /></label></div>
          <footer>${config.index !== undefined ? '<button type="button" class="is-danger" data-modal-action="delete-chip">删除</button>' : "<span></span>"}<div><button type="button" data-modal-action="close">取消</button><button type="button" class="is-primary" data-modal-action="save-chip">保存</button></div></footer>
        </div>`;
  document.body.append(overlay);
  overlay.querySelector("[autofocus]")?.focus();
};

const saveChip = (overlay) => {
  const model = currentRequirementModel(
    store.getPackage("boundaryAnchorPackage")
  );
  const list =
    requirementModal.type === "program"
      ? [...model.programItems]
      : [...model.targetUserItems];
  const value = overlay.querySelector('[name="chipValue"]')?.value.trim();
  if (!value) return;
  if (requirementModal.index === undefined) list.push(value);
  else list[requirementModal.index] = value;
  setLegacyFieldValue(
    requirementModal.type === "program" ? "needs" : "users",
    [...new Set(list)].join("、")
  );
  closeRequirementModal();
  queueRender();
};

const deleteChip = () => {
  const model = currentRequirementModel(
    store.getPackage("boundaryAnchorPackage")
  );
  const list =
    requirementModal.type === "program"
      ? [...model.programItems]
      : [...model.targetUserItems];
  list.splice(requirementModal.index, 1);
  setLegacyFieldValue(
    requirementModal.type === "program" ? "needs" : "users",
    list.join("、")
  );
  closeRequirementModal();
  queueRender();
};

const saveArea = (overlay) => {
  const model = currentRequirementModel(
    store.getPackage("boundaryAnchorPackage")
  );
  const formValue = (name) =>
    overlay.querySelector(`[name="${name}"]`)?.value || "";
  const name = formValue("name").trim();
  if (!name) return;
  const level = Number(formValue("level")) || 1;
  const parentId = level === 1 ? null : formValue("parentId") || null;
  const quantity = Math.max(1, Number(formValue("quantity")) || 1);
  const unitAreaM2 = Math.max(0, Number(formValue("unitAreaM2")) || 0);
  const nextItem = {
    id: requirementModal.id || `program-${Date.now()}`,
    level,
    parentId,
    name,
    quantity,
    unitAreaM2,
    areaM2: quantity * unitAreaM2,
    category: "required"
  };
  const isNewLevelOne = !requirementModal.id && level === 1;
  const items = requirementModal.id
    ? model.areaItems.map((item) =>
        item.id === requirementModal.id ? nextItem : item
      )
    : [...model.areaItems, nextItem];
  setLegacyFieldValue("areaProgram", serializeAreaProgram(items));
  syncProgramSummaryFromAreaItems(items);
  closeRequirementModal();
  queueRender();
  if (isNewLevelOne) {
    setTimeout(() => openAreaChildrenModal(nextItem, items), 0);
  }
};

const saveAreaChildren = (overlay) => {
  const baseItems = requirementModal.sourceItems || [];
  const descendantIds = areaDescendantIds(baseItems, requirementModal.parentId);
  const retained = baseItems.filter((item) => !descendantIds.has(item.id));
  const rows = [...overlay.querySelectorAll(".step12-area-child-row")];
  const rowEntries = rows
    .map((row) => ({
      row,
      key: row.dataset.childRow,
      existingId: row.dataset.existingId || "",
      level: Number(row.querySelector('[name="childLevel"]')?.value) || 2,
      name: row.querySelector('[name="childName"]')?.value.trim() || "",
      parentRef: row.querySelector('[name="childParent"]')?.value || "",
      quantity: Math.max(
        1,
        Number(row.querySelector('[name="childQuantity"]')?.value) || 1
      ),
      unitAreaM2: Math.max(
        0,
        Number(row.querySelector('[name="childUnitArea"]')?.value) || 0
      )
    }))
    .filter((entry) => entry.name);
  const idByRow = Object.fromEntries(
    rowEntries.map((entry) => [
      entry.key,
      entry.existingId || `program-${Date.now()}-${++areaChildRowSequence}`
    ])
  );
  const children = rowEntries
    .filter(
      (entry) =>
        entry.level === 2 ||
        (entry.level === 3 && idByRow[entry.parentRef])
    )
    .map((entry) => ({
      id: idByRow[entry.key],
      level: entry.level,
      parentId:
        entry.level === 2
          ? requirementModal.parentId
          : idByRow[entry.parentRef],
      name: entry.name,
      quantity: entry.quantity,
      unitAreaM2: entry.unitAreaM2,
      areaM2: entry.quantity * entry.unitAreaM2,
      declaredAreaM2: entry.quantity * entry.unitAreaM2,
      category: "required"
    }));
  setLegacyFieldValue(
    "areaProgram",
    serializeAreaProgram([...retained, ...children])
  );
  syncProgramSummaryFromAreaItems([...retained, ...children]);
  closeRequirementModal();
  queueRender();
};

const deleteArea = (id) => {
  const model = currentRequirementModel(
    store.getPackage("boundaryAnchorPackage")
  );
  const removeIds = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    model.areaItems.forEach((item) => {
      if (removeIds.has(item.parentId) && !removeIds.has(item.id)) {
        removeIds.add(item.id);
        changed = true;
      }
    });
  }
  const nextItems = model.areaItems.filter((item) => !removeIds.has(item.id));
  setLegacyFieldValue("areaProgram", serializeAreaProgram(nextItems));
  syncProgramSummaryFromAreaItems(nextItems);
  closeRequirementModal();
  queueRender();
};

const bindRequirementEvents = () => {
  if (document.documentElement.dataset.step12RequirementEvents === "true") {
    return;
  }
  document.documentElement.dataset.step12RequirementEvents = "true";
  document.addEventListener("input", (event) => {
    const field = event.target.closest?.(
      "#boundary-requirements-editor [data-requirement-field]"
    );
    if (field) setLegacyFieldValue(field.dataset.requirementField, field.value);
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-action]")?.dataset.action;
    const trigger = event.target.closest?.("[data-action]");
    if (action === "add-chip") {
      openRequirementModal({ kind: "chip", type: trigger.dataset.type });
    } else if (action === "edit-site-condition") {
      openSiteConditionModal();
    } else if (action === "edit-chip") {
      openRequirementModal({
        kind: "chip",
        type: trigger.dataset.type,
        index: Number(trigger.dataset.index)
      });
    } else if (action === "add-area") {
      openRequirementModal({ kind: "area" });
    } else if (action === "open-area-program") {
      openAreaProgramModal();
    } else if (action === "edit-area") {
      openRequirementModal({ kind: "area", id: trigger.dataset.id });
    } else if (action === "complete-area-children") {
      const model = currentRequirementModel(
        store.getPackage("boundaryAnchorPackage")
      );
      const parent = model.areaItems.find(
        (item) => item.id === trigger.dataset.id
      );
      if (parent) openAreaChildrenModal(parent, model.areaItems);
    } else if (action === "delete-area") {
      deleteArea(trigger.dataset.id);
    } else if (action === "locate-constraint") {
      locateConstraintTarget(trigger.dataset.field);
    } else if (action === "export-constraints") {
      exportConstraintTable();
    } else if (action === "edit-norm-constraint") {
      openNormConstraintModal(trigger.dataset.constraintId);
    } else if (action === "estimate-norm-constraint") {
      useNormEstimate(trigger.dataset.constraintId);
    }

    const modalAction = event.target.closest?.("[data-modal-action]")
      ?.dataset.modalAction;
    const overlay = event.target.closest?.(".step12-modal-overlay");
    if (modalAction === "close") closeRequirementModal();
    if (modalAction === "save-chip") saveChip(overlay);
    if (modalAction === "delete-chip") deleteChip();
    if (modalAction === "save-area") saveArea(overlay);
    if (modalAction === "save-area-children") saveAreaChildren(overlay);
    if (modalAction === "save-site-condition") saveSiteCondition(overlay);
    if (modalAction === "add-level-two") {
      appendAreaChildRow(overlay, {}, 2);
    }
    if (modalAction === "add-level-three") {
      appendAreaChildRow(overlay, {}, 3);
    }
    if (modalAction === "remove-child-row") {
      const row = event.target.closest(".step12-area-child-row");
      const removedKey = row?.dataset.childRow;
      row?.remove();
      overlay
        ?.querySelectorAll(
          `.step12-area-child-row[data-parent-ref="${CSS.escape(removedKey || "")}"]`
        )
        .forEach((child) => child.remove());
      if (overlay) refreshChildParentOptions(overlay);
    }
    if (modalAction === "save-norm") saveNormConstraint(overlay);
    if (modalAction === "delete-area") deleteArea(requirementModal.id);
    if (event.target.classList?.contains("step12-modal-overlay")) {
      closeRequirementModal();
    }
  });
  document.addEventListener("change", (event) => {
    if (
      event.target.matches?.(
        '.step12-area-child-row select[name="childParent"]'
      )
    ) {
      event.target.closest(".step12-area-child-row").dataset.parentRef =
        event.target.value;
      return;
    }
    if (
      event.target.matches?.(
        '.step12-area-child-row select[name="childLevel"]'
      )
    ) {
      const overlay = event.target.closest(".step12-modal-overlay");
      if (overlay) refreshChildParentOptions(overlay);
      return;
    }
    if (!event.target.matches?.('.step12-modal select[name="level"]')) return;
    const overlay = event.target.closest(".step12-modal-overlay");
    if (!overlay) return;
    const level = Number(event.target.value);
    const model = currentRequirementModel(
      store.getPackage("boundaryAnchorPackage")
    );
    const parent = overlay.querySelector('select[name="parentId"]');
    parent.innerHTML = `<option value="">无上级</option>${model.areaItems
      .filter((item) => item.level === level - 1)
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
      )
      .join("")}`;
    parent.disabled = level === 1;
  });
  document.addEventListener("input", (event) => {
    if (
      event.target.matches?.(
        ".step12-area-child-row input"
      )
    ) {
      const overlay = event.target.closest(".step12-modal-overlay");
      if (overlay) refreshChildParentOptions(overlay);
    }
  });
};

const renderBoundarySections = () => {
  const left = getLeftColumn();
  const packageData = store.getPackage("boundaryAnchorPackage");
  if (!left || !packageData) return;

  document.querySelector("#boundary-task-brief")?.remove();
  renderStepOneProjectHeader();
  hideStepOneIntroLine();
  renderStepOneUnifiedForm();
  bindStepOneUnifiedFormEvents();
  hideStepOneFunctionSection();
  document.querySelector("#boundary-anchor-review")?.remove();
  return;

  setSectionHeading(
    document.querySelector("#id-section-a"),
    "A",
    "项目基本信息",
    "填写项目名称、建筑类型、项目地点和用地面积。"
  );
  setSectionHeading(
    document.querySelector("#id-section-b"),
    "B",
    "规划指标与建设规模",
    "填写容积率、建筑密度、绿化率、建筑限高、总建筑面积和层数要求。"
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
      <strong>把项目条件整理成后续设计可读取的边界。</strong>
      <p>先填写项目基础信息和规划指标。功能组成、使用人群与面积分级表将在第 3 步集中处理。</p>
    </div>
    <ol aria-label="项目信息处理步骤">
      <li>填条件</li>
      <li>下一步前核对</li>
      <li>进入基地与环境</li>
    </ol>
  `;
  hideStepOneFunctionSection();

  document.querySelector("#boundary-anchor-review")?.remove();
  return;

  let section = document.querySelector("#boundary-anchor-review");
  if (!section) {
    section = document.createElement("section");
    section.id = "boundary-anchor-review";
    section.className = "step12-output-section";
    document.querySelector("#id-section-c")?.after(section);
  }

  const review = deriveBoundaryReview(packageData);
  const signature = JSON.stringify({
    revision: packageData.revision,
    status: packageData.completionStatus,
    norms: review.norms,
    constraints: review.constraints,
    missingItems: review.missingItems,
    conflicts: review.conflicts
  });
  if (section.dataset.renderSignature === signature) return;
  section.dataset.renderSignature = signature;
  const normConstraintGroups = Object.groupBy
    ? Object.groupBy(review.normDesignConstraints, (item) => item.normId)
    : review.normDesignConstraints.reduce((groups, item) => {
        groups[item.normId] ||= [];
        groups[item.normId].push(item);
        return groups;
      }, {});
  const normById = new Map(review.norms.map((item) => [item.id, item]));
  const normWorkItems = review.normDesignConstraints
    .map((condition) => ({
      ...condition,
      norm: normById.get(condition.normId)
    }))
    .sort((a, b) => {
      const rank = { pending: 0, systemEstimated: 1, userConfirmed: 2 };
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    });
  const pendingNormCount = normWorkItems.filter(
    (item) => item.status === "pending"
  ).length;
  const estimatedNormCount = normWorkItems.filter(
    (item) => item.status === "systemEstimated"
  ).length;
  const confirmedNormCount = normWorkItems.filter(
    (item) => item.status === "userConfirmed"
  ).length;
  section.innerHTML = `
    <header class="step12-section-header step12-norm-header">
      <span class="step12-section-index">D</span>
      <div>
        <h2>规范待确认条件</h2>
        <p>系统只列出前期需要确认的规范相关条件，不替代正式审查。先处理会影响项目信息判断的内容。</p>
      </div>
      <span class="step12-norm-count">${review.norms.length ? `${review.norms.length} 项已关联` : "待生成"}</span>
    </header>
    ${review.norms.length
      ? `    <div class="step12-norm-summary">
      <div><span>已关联规范</span><strong>${review.norms.length}</strong></div>
      <div><span>待确认条件</span><strong>${pendingNormCount}</strong></div>
      <div><span>采用估算</span><strong>${estimatedNormCount}</strong></div>
      <div><span>已确认</span><strong>${confirmedNormCount}</strong></div>
      <p>先处理待确认条件。规范名称和编号收在下方，需要核对来源时再展开。</p>
    </div>
    <section class="step12-norm-workbench" aria-label="待确认规范条件">
      <header>
        <div>
          <h3>需要你确认的条件</h3>
          <p>有明确要求就直接补充；暂时不确定时可先用估算，后续仍可修改。</p>
        </div>
        <span>${pendingNormCount} 项待确认</span>
      </header>
      <div class="step12-norm-condition-list">
        ${
          normWorkItems.length
            ? normWorkItems
                .map(
                  (condition) => `
                    <article class="step12-norm-condition is-${condition.status}" data-norm-constraint-id="${escapeHtml(condition.id)}">
                      <div>
                        <div class="step12-norm-condition-meta">
                          <span>${escapeHtml(condition.norm?.title || condition.normTitle || "相关规范")}</span>
                          <em>${escapeHtml(condition.norm?.code || condition.normCode || "按项目核验")}</em>
                        </div>
                        <strong>${escapeHtml(condition.label)}</strong>
                        <p>${escapeHtml(condition.value || condition.prompt)}</p>
                        <small>${
                          condition.status === "userConfirmed"
                            ? "已确认"
                            : condition.status === "systemEstimated"
                              ? "已采用估算，可后续修改"
                              : "待确认"
                        }</small>
                      </div>
                      <div class="step12-norm-condition-actions">
                        <button type="button" data-action="edit-norm-constraint" data-constraint-id="${escapeHtml(condition.id)}">${condition.status === "pending" ? "补充条件" : "修改"}</button>
                        ${
                          condition.status === "pending"
                            ? `<button type="button" data-action="estimate-norm-constraint" data-constraint-id="${escapeHtml(condition.id)}">先用估算</button>`
                            : ""
                        }
                      </div>
                    </article>`
                )
                .join("")
            : `<div class="step12-norm-empty">当前没有需要补充的规范条件。</div>`
        }
      </div>
    </section>
    <details class="step12-norm-evidence">
      <summary>
        <span>
          <strong>查看规范匹配依据</strong>
          <small>展开后查看触发原因和核对方向。</small>
        </span>
        <em>${review.norms.length} 项</em>
      </summary>
      <div class="step12-norm-list" aria-label="规范匹配依据">
      ${review.norms
        .map((item) => {
          const normConditions = normConstraintGroups[item.id] || [];
          const resolvedCount = normConditions.filter(
            (condition) => condition.status !== "pending"
          ).length;
          return `
            <details class="step12-norm-item">
              <summary>
                <div class="step12-norm-identity">
                  <strong>${escapeHtml(item.title || item)}</strong>
                  <span>${escapeHtml(item.code || "按项目核验")}</span>
                </div>
                <span class="step12-norm-priority">${escapeHtml(item.priority || "基础规范")}</span>
                <div class="step12-norm-state">
                  <span>已关联</span>
                  <em>${resolvedCount} / ${normConditions.length} 已确认</em>
                </div>
              </summary>
              <div class="step12-norm-detail">
                <div>
                  <span>为什么关联</span>
                  <p>${escapeHtml(item.triggerReason || item.note || "根据当前项目条件匹配。")}</p>
                </div>
                <div>
                  <span>核对方向</span>
                  <ul>
                    ${(item.verificationItems || [])
                      .map((text) => `<li>${escapeHtml(text)}</li>`)
                      .join("")}
                  </ul>
                </div>
              </div>
            </details>
          `;
        })
        .join("")}
      </div>
    </details>
`
      : `    <div class="step12-norm-empty-state">
      <strong>尚未生成规范核对项</strong>
      <p>请先填写建筑类型、主要功能，或导入任务书。系统会根据已有条件列出需要提前核对的内容。</p>
    </div>
`}
    <p class="step12-norm-disclaimer">规范版本、地方条文和主管部门要求仍需由项目团队或专业顾问复核。</p>
    <div class="step12-divider"></div>
    <header class="step12-section-header step12-constraint-header">
      <span class="step12-section-index">E</span>
      <div>
        <h2>设计约束基准</h2>
        <p>前面填写、确认和估算的条件会在这里合并。后续步骤只读取这些基准条件。</p>
      </div>
      <button type="button" class="step12-export-button" data-action="export-constraints">导出表格</button>
    </header>
    <div class="step12-constraint-summary" aria-label="约束检查摘要">
      <div><span>已确认</span><strong>${review.confirmedConstraints.length}</strong></div>
      <div><span>采用估算</span><strong>${review.estimatedConstraints.length}</strong></div>
      <div><span>待补充</span><strong>${review.pendingConstraints.filter((item) => item.statusCode === "missing").length}</strong></div>
      <div class="${review.conflictConstraints.length ? "is-risk" : ""}"><span>冲突</span><strong>${review.conflictConstraints.length}</strong></div>
      <p>${
        review.pendingConstraints.length
          ? `还有 ${review.pendingConstraints.length} 项未处理${
              review.conflictConstraints.length
                ? `，其中 ${review.conflictConstraints.length} 项存在冲突`
                : ""
            }。先处理冲突和必须补充项，其余可后续复核。`
          : "项目信息已建立，可以进入基地与环境。"
      }</p>
    </div>
    <section class="step12-action-center">
      <header>
        <div>
          <h3>下一步前先处理</h3>
          <p>点击按钮回到对应位置。</p>
        </div>
        <span>${review.pendingConstraints.length}</span>
      </header>
      <div class="step12-action-list">
        ${
          review.pendingConstraints.length
            ? review.pendingConstraints
                .map(
                  (item) => `
                  <article class="step12-action-item is-${item.statusCode}">
                    <div class="step12-action-status">
                      <span>${escapeHtml(item.status)}</span>
                      <em>${escapeHtml(item.category)}</em>
                    </div>
                    <div>
                      <h4>${escapeHtml(item.label)}</h4>
                      <p>${escapeHtml(item.issue || item.currentValue)}</p>
                    </div>
                    <button type="button" data-action="locate-constraint" data-field="${escapeHtml(item.targetField)}">
                      ${item.statusCode === "conflict" ? "核对" : "填写"}
                    </button>
                  </article>`
                )
                .join("")
            : `
              <div class="step12-action-empty">
                <strong>当前没有待处理项</strong>
                <span>后续步骤会读取已确认条件和采用的估算值。</span>
              </div>`
        }
      </div>
    </section>
    <details class="step12-constraint-details">
      <summary>
        <span><strong>查看完整基准表</strong><em>${review.constraints.length} 项</em></span>
        <small>需要核对来源时再展开。</small>
      </summary>
      <div class="step12-constraint-table" role="table" aria-label="设计约束总表">
        <div class="step12-constraint-row is-head" role="row">
          <span>类别</span><span>条件项</span><span>当前值</span><span>来源</span><span>状态</span><span>处理方式</span>
        </div>
        ${review.constraints
          .map(
            (item) => `
            <div class="step12-constraint-row is-${item.statusCode}" role="row">
              <span>${escapeHtml(item.category)}</span>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.currentValue)}</span>
              <span>${escapeHtml(item.source)}</span>
              <em class="${statusClass(item.status)}">${escapeHtml(item.status)}</em>
              <span>${escapeHtml(item.action)}</span>
            </div>`
          )
          .join("")}
      </div>
    </details>
  `;
};

const renderSiteAnalysis = () => {
  const left = getLeftColumn();
  const siteCard = document.querySelector("#id-section-site-location");
  const packageData = store.getPackage("siteAnalysisPackage");
  const boundaryPackage = store.getPackage("boundaryAnchorPackage");
  if (!left || !siteCard || !packageData) return;

  const label = document.querySelector("#site-loc-label");
  const title = document.querySelector("#site-loc-title");
  const description = document.querySelector("#site-loc-desc");
  if (label && label.textContent?.trim() !== "A") label.textContent = "A";
  if (title && title.textContent?.trim() !== "场地定位与地图编辑") {
    title.textContent = "场地定位与地图编辑";
  }
  const siteDescription =
    "确认项目位置、用地红线、场地入口与周边分析范围，地图结果将形成基地与环境数据。";
  if (description) {
    if (description.textContent?.trim() !== siteDescription) {
      description.textContent = siteDescription;
    }
  }

  let output = document.querySelector("#site-analysis-output");
  if (!output) {
    output = document.createElement("section");
    output.id = "site-analysis-output";
    output.className = "step12-output-section";
    siteCard.after(output);
  }

  const data = packageData.data || {};
  const normEffects = deriveNormDownstreamEffects(
    boundaryPackage.data || {}
  );
  const insights = deriveSiteInsights({
    siteLimits: data.siteLimits,
    siteOpportunities: data.siteOpportunities,
    designImpactHints: data.designImpactHints,
    surroundings: data.poiContext,
    swot: data.swot,
    normDerivedConstraints: normEffects.site.map((item) => ({
      ...item,
      impact: "场地道路、入口、高差或建筑退让"
    }))
  });
  const location = data.siteLocation;
  const redline = data.redline;
  const accessPoints = data.accessPoints || [];
  const poiGroups = Object.values(data.poiContext || {}).filter(
    (item) => item?.status === "success"
  );
  const completed =
    Boolean(location) + Boolean(redline?.geometry?.length >= 3) +
    Boolean(accessPoints.length) + Boolean(poiGroups.length);

  const signature = JSON.stringify({
    revision: packageData.revision,
    location,
    redline,
    accessPoints,
    poiGroups: poiGroups.length,
    insights
  });
  if (output.dataset.renderSignature === signature) return;
  output.dataset.renderSignature = signature;
  output.innerHTML = `
    <header class="step12-section-header">
      <span class="step12-section-index">B</span>
      <div>
        <h2>基地与环境输出</h2>
        <p>地图数据被转译为限制、机会、SWOT 与后续设计影响提示。</p>
      </div>
      <span class="step12-progress">${completed} / 4 已形成</span>
    </header>
    <div class="step12-site-facts">
      <div><span>地点</span><strong>${escapeHtml(location?.name || "待确认")}</strong></div>
      <div><span>红线</span><strong>${redline?.geometry?.length >= 3 ? "已形成" : "待绘制"}</strong></div>
      <div><span>入口</span><strong>${accessPoints.length} 个</strong></div>
      <div><span>周边分析</span><strong>${poiGroups.length} 类</strong></div>
    </div>
    <div class="step12-insight-grid">
      <article>
        <header><h3>场地限制</h3><span>${insights.siteLimits.length}</span></header>
        ${renderList(insights.siteLimits, "完成周边分析后生成场地限制。")}
      </article>
      <article>
        <header><h3>场地机会</h3><span>${insights.siteOpportunities.length}</span></header>
        ${renderList(insights.siteOpportunities, "完成周边分析后生成场地机会。")}
      </article>
    </div>
    <div class="step12-swot">
      ${[
        ["S", "优势", insights.swot.strengths],
        ["W", "劣势", insights.swot.weaknesses],
        ["O", "机会", insights.swot.opportunities],
        ["T", "威胁", insights.swot.threats]
      ]
        .map(
          ([code, label, items]) => `
          <article>
            <header><span>${code}</span><h3>${label}</h3></header>
            ${renderList(items, "待形成")}
          </article>`
        )
        .join("")}
    </div>
    <div class="step12-design-hints">
      <h3>对后续设计的影响</h3>
      ${renderList(
        insights.designImpactHints,
        "完成场地分析后，系统将在此整理入口、界面、景观、噪声与后勤等设计提示。"
      )}
    </div>
  `;
};

const applyStepLayout = () => {
  const main = document.querySelector("main:has(#id-section-a)");
  if (!main) return;
  const step = store.getState().currentStep || 1;
  const importButton = [...main.querySelectorAll("button")].find((button) =>
    /导入任务书/.test(button.textContent || "") &&
    !button.closest("#step12-project-hero")
  );
  importButton?.parentElement?.parentElement?.classList.add(
    "step12-legacy-input-header"
  );
  main.classList.toggle("step12-boundary-page", step === 1);
  main.classList.toggle("step12-site-page", step === 2);
  if (step === 1) renderBoundarySections();
  if (step === 2) renderSiteAnalysis();
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

if (typeof document !== "undefined") {
  const observer = new MutationObserver((mutations) => {
    if (
      mutations.every((mutation) =>
        mutation.target?.closest?.(
          "#boundary-anchor-review, #site-analysis-output, #boundary-requirements-editor, .step12-modal-overlay"
        )
      )
    ) {
      return;
    }
    queueRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  store.subscribe(queueRender);
  document.addEventListener("DOMContentLoaded", queueRender, { once: true });
  queueRender();
}

export { deriveBoundaryReview, renderFunctionRequirementEditor, useNormEstimate };
