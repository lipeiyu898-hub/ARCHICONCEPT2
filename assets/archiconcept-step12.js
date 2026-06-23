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
      <p class="step12-modal-helper">该条件将写入设计约束基准，并参与后续场地、功能和概念判断。专业审查结论可在后续覆盖。</p>
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
  if (!field) return;
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
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
      "#boundary-requirements-editor .step12-area-program"
    );
  }
  if (field === "siteCondition") {
    return document.querySelector(
      '#boundary-requirements-editor [data-requirement-field="siteCondition"]'
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
    "处理方式",
    "影响后续"
  ];
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = review.constraints.map((item) =>
    [
      item.category,
      item.label,
      item.currentValue,
      item.source,
      item.status,
      item.action,
      item.impact
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

const leafAreaTotal = (items) =>
  items
    .filter((item) => !items.some((child) => child.parentId === item.id))
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

const renderAreaRows = (items) =>
  items.length
    ? items
        .map((item) => {
          const hasChildren = items.some(
            (child) => child.parentId === item.id
          );
          return `
          <div class="step12-area-row" role="row" data-area-id="${escapeHtml(item.id)}">
            <span><i>${item.level} 级</i></span>
            <strong style="--area-level:${item.level}">${escapeHtml(item.name)}</strong>
            <span>${formatArea(item.areaM2)} ㎡</span>
            <span>${hasChildren ? "—" : item.quantity}</span>
            <span>${hasChildren ? "自动汇总" : `${formatArea(item.unitAreaM2)} ㎡`}</span>
            <span class="step12-area-actions">
              <button type="button" data-action="edit-area" data-id="${escapeHtml(item.id)}">编辑</button>
              <button type="button" data-action="delete-area" data-id="${escapeHtml(item.id)}">删除</button>
            </span>
          </div>`;
        })
        .join("")
    : `
      <div class="step12-area-empty">
        <strong>尚未填写功能面积分表</strong>
        <span>可逐项新增，或由任务书识别后自动形成分级数据。</span>
      </div>`;

const renderRequirementEditor = (packageData) => {
  const section = document.querySelector("#id-section-c");
  if (!section) return;
  const legacyBody = [...section.children].find(
    (child, index) => index > 0 && child.querySelector?.("textarea")
  );
  legacyBody?.classList.add("step12-c-legacy-fields");

  let editor = document.querySelector("#boundary-requirements-editor");
  if (!editor) {
    editor = document.createElement("div");
    editor.id = "boundary-requirements-editor";
    legacyBody?.after(editor);
  }

  const model = currentRequirementModel(packageData);
  const items = calculateAreaProgramItems(model.areaItems);
  const allocated = leafAreaTotal(items);
  const remaining = model.targetGfaM2 ? model.targetGfaM2 - allocated : null;
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
      <label class="step12-site-condition">
        <span>场地条件 <em>/ SITE INFO</em></span>
        <textarea data-requirement-field="siteCondition" placeholder="例如：滨海公共空间节点，需处理海岸、城市界面、步道、人流、视线与韧性问题。">${escapeHtml(model.siteCondition)}</textarea>
      </label>
      <section class="step12-chip-panel">
        <header><span>核心功能需求 <em>/ PROGRAM</em></span></header>
        <div class="step12-chip-list">${renderChips(
          model.programItems,
          "program",
          "尚未添加核心功能"
        )}</div>
        <button type="button" class="step12-add-inline" data-action="add-chip" data-type="program">＋ 添加功能</button>
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
    <section class="step12-area-program">
      <header>
        <div>
          <span>功能面积组成 <em>/ AREA PROGRAM</em></span>
          <p>按任务书功能分表建立一级、二级和三级功能，父级面积自动汇总子项。</p>
        </div>
        <button type="button" data-action="add-area">＋ 添加功能面积</button>
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
          model.targetGfaM2
            ? `<span>总建筑面积 <strong>${formatArea(model.targetGfaM2)} ㎡</strong></span>
               <span class="${remaining < 0 ? "is-over" : ""}">剩余 <strong>${formatArea(remaining)} ㎡</strong></span>`
            : `<span>填写总建筑面积后可校核分配差额</span>`
        }
      </footer>
    </section>
  `;
};

const closeRequirementModal = () => {
  document.querySelector(".step12-modal-overlay")?.remove();
  requirementModal = null;
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
          <header><div><span>${config.type === "program" ? "PROGRAM" : "TARGET USERS"}</span><h3 id="step12-modal-title">${config.index === undefined ? "添加" : "编辑"}${config.type === "program" ? "核心功能" : "使用人群"}</h3></div><button type="button" data-modal-action="close">×</button></header>
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
  const items = requirementModal.id
    ? model.areaItems.map((item) =>
        item.id === requirementModal.id ? nextItem : item
      )
    : [...model.areaItems, nextItem];
  setLegacyFieldValue("areaProgram", serializeAreaProgram(items));
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
  setLegacyFieldValue(
    "areaProgram",
    serializeAreaProgram(model.areaItems.filter((item) => !removeIds.has(item.id)))
  );
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
    } else if (action === "edit-chip") {
      openRequirementModal({
        kind: "chip",
        type: trigger.dataset.type,
        index: Number(trigger.dataset.index)
      });
    } else if (action === "add-area") {
      openRequirementModal({ kind: "area" });
    } else if (action === "edit-area") {
      openRequirementModal({ kind: "area", id: trigger.dataset.id });
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
    if (modalAction === "save-norm") saveNormConstraint(overlay);
    if (modalAction === "delete-area") deleteArea(requirementModal.id);
    if (event.target.classList?.contains("step12-modal-overlay")) {
      closeRequirementModal();
    }
  });
  document.addEventListener("change", (event) => {
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
};

const renderBoundarySections = () => {
  const left = getLeftColumn();
  const packageData = store.getPackage("boundaryAnchorPackage");
  if (!left || !packageData) return;

  setSectionHeading(
    document.querySelector("#id-section-a"),
    "A",
    "项目身份与基础条件",
    "确认项目名称、建筑类型、所在地区与基础规模。"
  );
  setSectionHeading(
    document.querySelector("#id-section-b"),
    "B",
    "强控指标与规模边界",
    "录入容积率、密度、限高、总建筑面积和可建设范围。"
  );
  setSectionHeading(
    document.querySelector("#id-section-c"),
    "C",
    "功能需求与特殊要求",
    "明确核心功能、使用人群、面积组成和必须回应的项目条件。"
  );
  renderRequirementEditor(packageData);
  bindRequirementEvents();

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
  section.innerHTML = `
    <header class="step12-section-header step12-norm-header">
      <span class="step12-section-index">D</span>
      <div>
        <h2>规范关注项</h2>
        <p>根据项目类型、功能与使用人群匹配前期需要关注的规范风险，用于提示设计边界，不替代专业审查。</p>
      </div>
      <span class="step12-norm-count">${review.norms.length} 项已匹配</span>
    </header>
    <div class="step12-norm-summary">
      <strong>系统已完成前置匹配</strong>
      <span>展开规范项可查看触发原因、核验内容及对后续设计的影响。</span>
    </div>
    <div class="step12-norm-list" aria-label="规范关注项">
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
                  <span>${escapeHtml(item.matchStatus || "系统匹配")}</span>
                  <em>${resolvedCount} / ${normConditions.length} 条件已处理</em>
                </div>
              </summary>
              <div class="step12-norm-detail">
                <div>
                  <span>触发原因</span>
                  <p>${escapeHtml(item.triggerReason || item.note || "根据当前项目条件匹配。")}</p>
                </div>
                <div>
                  <span>待确认设计条件</span>
                  <div class="step12-norm-condition-list">
                    ${normConditions
                      .map(
                        (condition) => `
                        <article class="step12-norm-condition is-${condition.status}" data-norm-constraint-id="${escapeHtml(condition.id)}">
                          <div>
                            <strong>${escapeHtml(condition.label)}</strong>
                            <p>${escapeHtml(condition.value || condition.prompt)}</p>
                            <em>${
                              condition.status === "userConfirmed"
                                ? "用户已确认"
                                : condition.status === "systemEstimated"
                                  ? "系统估算，待复核"
                                  : "待处理"
                            }</em>
                          </div>
                          <div class="step12-norm-condition-actions">
                            <button type="button" data-action="edit-norm-constraint" data-constraint-id="${escapeHtml(condition.id)}">${condition.status === "pending" ? "补充条件" : "修改"}</button>
                            ${
                              condition.status === "pending"
                                ? `<button type="button" data-action="estimate-norm-constraint" data-constraint-id="${escapeHtml(condition.id)}">采用系统估算</button>`
                                : ""
                            }
                          </div>
                        </article>`
                      )
                      .join("")}
                  </div>
                </div>
                <div>
                  <span>影响后续</span>
                  <p>${escapeHtml(item.downstreamImpact || "功能建构、概念生成")}</p>
                </div>
              </div>
            </details>
          `;
        })
        .join("")}
    </div>
    <p class="step12-norm-disclaimer">规范版本、地方条文及主管部门要求仍需由项目团队或专业顾问复核。</p>
    <div class="step12-divider"></div>
    <header class="step12-section-header step12-constraint-header">
      <span class="step12-section-index">E</span>
      <div>
        <h2>边界锚定输出：设计约束基准</h2>
        <p>优先处理缺失、待核验和冲突项；已确认条件将作为场地解析、功能建构与概念生成的统一设计边界。</p>
      </div>
      <button type="button" class="step12-export-button" data-action="export-constraints">导出表格</button>
    </header>
    <div class="step12-constraint-summary" aria-label="约束检查摘要">
      <div><span>已确认</span><strong>${review.confirmedConstraints.length}</strong></div>
      <div><span>系统估算</span><strong>${review.estimatedConstraints.length}</strong></div>
      <div><span>待补充</span><strong>${review.pendingConstraints.filter((item) => item.statusCode === "missing").length}</strong></div>
      <div class="${review.conflictConstraints.length ? "is-risk" : ""}"><span>冲突</span><strong>${review.conflictConstraints.length}</strong></div>
      <p>${
        review.pendingConstraints.length
          ? `还有 ${review.pendingConstraints.length} 项需要处理，完成后可提高后续推演可靠性。`
          : "当前边界条件已完整，可作为后续推演基准。"
      }</p>
    </div>
    <section class="step12-action-center">
      <header>
        <div>
          <h3>当前需要处理</h3>
          <p>点击对应项可直接返回输入位置。</p>
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
                      <small>影响：${escapeHtml(item.impact)}</small>
                    </div>
                    <button type="button" data-action="locate-constraint" data-field="${escapeHtml(item.targetField)}">
                      ${item.statusCode === "conflict" ? "去核对" : "去补充"}
                    </button>
                  </article>`
                )
                .join("")
            : `
              <div class="step12-action-empty">
                <strong>当前没有待处理项</strong>
                <span>已确认条件将直接传递到后续设计步骤。</span>
              </div>`
        }
      </div>
    </section>
    <details class="step12-constraint-details">
      <summary>
        <span><strong>查看全部约束</strong><em>${review.constraints.length} 项</em></span>
        <small>展开完整的来源、状态、处理方式与后续影响</small>
      </summary>
      <div class="step12-constraint-table" role="table" aria-label="设计约束总表">
        <div class="step12-constraint-row is-head" role="row">
          <span>类别</span><span>约束项</span><span>当前值</span><span>来源</span><span>状态</span><span>处理方式</span><span>影响后续</span>
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
              <span>${escapeHtml(item.impact)}</span>
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
    "确认项目位置、用地红线、场地入口与周边分析范围，地图结果将形成场地解析数据。";
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
        <h2>场地解析输出</h2>
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
    /导入任务书/.test(button.textContent || "")
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

export { deriveBoundaryReview };
