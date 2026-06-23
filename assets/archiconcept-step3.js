import {
  buildBubbleGraph,
  calculateAreaProgramItems,
  createInitialFunctionConstructData,
  detectFunctionConflicts,
  store,
  validateFunctionConstructData
} from "./archiconcept-data-chain.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const clone = (value) => JSON.parse(JSON.stringify(value));
const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const leafFunctions = (functionTree = []) =>
  functionTree.filter(
    (item) => !functionTree.some((child) => child.parentId === item.id)
  );

const CATEGORY_LABELS = {
  required: "强制功能",
  flexible: "弹性功能",
  support: "配套功能"
};

const RELATION_LABELS = {
  adjacent: "紧邻",
  near: "相邻",
  separate: "隔离",
  none: "无关"
};

let draft = null;
let loadedRevision = -1;
let internalUpdate = false;
let renderQueued = false;

const normalizeDraft = (data = {}) => {
  const functionTree = Array.isArray(data.functionTree)
    ? calculateAreaProgramItems(clone(data.functionTree))
    : [];
  const targetGfaM2 = numberValue(data.areaAllocation?.targetGfaM2);
  const allocatedM2 = leafFunctions(functionTree).reduce(
    (sum, item) => sum + Math.max(0, numberValue(item.areaM2)),
    0
  );
  const next = {
    functionTree,
    areaAllocation: {
      ...(data.areaAllocation || {}),
      targetGfaM2,
      allocatedM2,
      unallocatedM2: targetGfaM2 - allocatedM2
    },
    functionAttributes: clone(data.functionAttributes || {}),
    relationshipGraph: {
      edges: clone(data.relationshipGraph?.edges || [])
    },
    bubbleGraph: buildBubbleGraph(functionTree),
    circulationSystem: {
      publicFlow: "independent",
      internalFlow: "controlled",
      serviceFlow: "independent",
      publicServiceSeparated: true,
      cleanDirtySeparated: true,
      coreDecisionConfirmed: false,
      ...(data.circulationSystem || {})
    },
    conflicts: [],
    organizationPrinciples: clone(data.organizationPrinciples || []),
    normDerivedConstraints: clone(data.normDerivedConstraints || [])
  };
  next.conflicts = detectFunctionConflicts(next);
  return next;
};

const ensureDraft = () => {
  const packageData = store.getPackage("functionConstructPackage");
  if (
    packageData.revision === loadedRevision &&
    draft &&
    draft.functionTree?.length
  ) {
    return draft;
  }
  if (!packageData.data?.functionTree?.length) {
    const initial = createInitialFunctionConstructData(
      store.getPackage("boundaryAnchorPackage")
    );
    const assumptions = [
      {
        key: "functionDistribution",
        value: "系统根据建筑类型生成初始功能比例",
        reason: "任务书未提供完整功能分级表，用户可在本步骤修改。",
        source: "systemInference"
      }
    ];
    if (initial.areaAllocation.source === "systemEstimate") {
      assumptions.push({
        key: "targetGfaM2",
        value: initial.areaAllocation.targetGfaM2,
        reason: "总建筑面积未明确，暂按用地面积或默认值建立功能测算底盘。",
        source: "systemInference"
      });
    }
    internalUpdate = true;
    const updated = store.updatePackage(
      "functionConstructPackage",
      {
        completionStatus: "partial",
        confidenceLevel: "medium",
        blockingItems: validateFunctionConstructData(initial).blockingItems,
        assumptions,
        data: initial
      },
      {
        replaceData: true,
        source: "systemInference",
        reason: "Generate initial function structure from boundary anchor"
      }
    );
    internalUpdate = false;
    loadedRevision = updated.revision;
    draft = normalizeDraft(updated.data);
    return draft;
  }
  loadedRevision = packageData.revision;
  draft = normalizeDraft(packageData.data);
  return draft;
};

const saveDraft = (reason = "Function construct edited") => {
  if (!draft) return;
  draft = normalizeDraft(draft);
  const validation = validateFunctionConstructData(draft);
  internalUpdate = true;
  const updated = store.updatePackage(
    "functionConstructPackage",
    {
      completionStatus: validation.blockingItems.length ? "partial" : "ready",
      confidenceLevel: validation.blockingItems.length ? "medium" : "high",
      blockingItems: validation.blockingItems,
      data: draft
    },
    {
      replaceData: true,
      source: "manualEdit",
      reason
    }
  );
  internalUpdate = false;
  loadedRevision = updated.revision;
};

const options = (values, selected) =>
  values
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
    )
    .join("");

const renderFunctionRows = (data) => {
  const target = Math.max(1, numberValue(data.areaAllocation.targetGfaM2));
  return data.functionTree
    .map((item, index) => {
      const attributes = data.functionAttributes[item.id] || {};
      const ratio = ((numberValue(item.areaM2) / target) * 100).toFixed(1);
      return `
        <article class="step3-function-row" data-function-id="${escapeHtml(item.id)}">
          <div class="step3-function-main">
            <span class="step3-row-number">${String(index + 1).padStart(2, "0")}</span>
            <select data-field="level" aria-label="功能层级">
              ${options(
                [
                  ["1", "一级"],
                  ["2", "二级"],
                  ["3", "三级"]
                ],
                String(item.level || 1)
              )}
            </select>
            <input data-field="name" value="${escapeHtml(item.name)}" aria-label="功能名称" />
            <select data-field="category" aria-label="功能类型">
              ${options(
                [
                  ["required", "强制功能"],
                  ["flexible", "弹性功能"],
                  ["support", "配套功能"]
                ],
                item.category
              )}
            </select>
            <div class="step3-area-input">
              <input type="number" min="0" step="10" data-field="areaM2" value="${numberValue(item.areaM2)}" aria-label="功能面积" />
              <span>㎡</span>
            </div>
            <strong>${ratio}%</strong>
            <button type="button" class="step3-icon-button" data-action="delete-function" title="删除功能">删除</button>
          </div>
          <div class="step3-attribute-row">
            <label>公共性
              <select data-attribute="publicity">
                ${options(
                  [
                    ["public", "公共"],
                    ["semiPublic", "半公共"],
                    ["restricted", "受限"]
                  ],
                  attributes.publicity
                )}
              </select>
            </label>
            <label>私密性
              <select data-attribute="privacy">
                ${options(
                  [
                    ["low", "低"],
                    ["medium", "中"],
                    ["high", "高"]
                  ],
                  attributes.privacy
                )}
              </select>
            </label>
            <label>采光
              <select data-attribute="daylight">
                ${options(
                  [
                    ["required", "需要"],
                    ["preferred", "优先"],
                    ["optional", "可选"]
                  ],
                  attributes.daylight
                )}
              </select>
            </label>
            <label>层高
              <select data-attribute="floorHeight">
                ${options(
                  [
                    ["standard", "常规"],
                    ["high", "高空间"],
                    ["double", "通高"]
                  ],
                  attributes.floorHeight
                )}
              </select>
            </label>
            <label>噪声
              <select data-attribute="noise">
                ${options(
                  [
                    ["low", "低"],
                    ["medium", "中"],
                    ["high", "高"]
                  ],
                  attributes.noise
                )}
              </select>
            </label>
            <label>荷载
              <select data-attribute="load">
                ${options(
                  [
                    ["standard", "常规"],
                    ["high", "高荷载"],
                    ["special", "特殊"]
                  ],
                  attributes.load
                )}
              </select>
            </label>
            <label>洁净
              <select data-attribute="cleanliness">
                ${options(
                  [
                    ["clean", "洁净"],
                    ["general", "一般"],
                    ["dirty", "污染"]
                  ],
                  attributes.cleanliness
                )}
              </select>
            </label>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderBubbleGraph = (data) => {
  const nodes = data.bubbleGraph?.nodes || [];
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const lines = (data.relationshipGraph?.edges || [])
    .map((edge) => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target || edge.strength === "none") return "";
      return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" class="is-${edge.strength}" />`;
    })
    .join("");
  return `
    <svg class="step3-bubble-graph" viewBox="0 0 100 100" role="img" aria-label="功能气泡关系图">
      <g class="step3-bubble-lines">${lines}</g>
      ${nodes
        .map(
          (node) => `
          <g class="step3-bubble-node" transform="translate(${node.x} ${node.y})">
            <circle r="${Math.max(8, node.size / 2)}"></circle>
            <text text-anchor="middle" y="-1">${escapeHtml(node.label.slice(0, 7))}</text>
            <text class="step3-bubble-area" text-anchor="middle" y="5">${Math.round(
              numberValue(
                data.functionTree.find((item) => item.id === node.id)?.areaM2
              )
            )}㎡</text>
          </g>`
        )
        .join("")}
    </svg>
  `;
};

const renderRelations = (data) => {
  const names = Object.fromEntries(
    data.functionTree.map((item) => [item.id, item.name])
  );
  return (data.relationshipGraph?.edges || []).length
    ? data.relationshipGraph.edges
        .map(
          (edge) => `
          <div class="step3-relation-item">
            <span>${escapeHtml(names[edge.source] || "未知功能")}</span>
            <strong>${escapeHtml(RELATION_LABELS[edge.strength] || edge.strength)}</strong>
            <span>${escapeHtml(names[edge.target] || "未知功能")}</span>
            <button type="button" data-action="delete-relation" data-relation-id="${escapeHtml(edge.id)}">删除</button>
          </div>`
        )
        .join("")
    : '<p class="step3-empty">尚未建立功能联系。</p>';
};

const renderConflicts = (data) =>
  data.conflicts.length
    ? data.conflicts
        .map(
          (item) => `
          <article class="step3-conflict is-${item.severity}">
            <span>${item.severity === "blocking" ? "阻断" : "建议"}</span>
            <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div>
          </article>`
        )
        .join("")
    : `
      <div class="step3-conflict-empty">
        <strong>当前未发现明显冲突</strong>
        <p>面积、属性关系与核心动线判断处于可继续状态。</p>
      </div>`;

const renderWorkspace = () => {
  const main = document.querySelector("main");
  if (!main || store.getState().currentStep !== 3) return;
  const data = ensureDraft();
  let workspace = document.querySelector("#function-construct-workspace");
  if (!workspace) {
    workspace = document.createElement("section");
    workspace.id = "function-construct-workspace";
    workspace.className = "step3-workspace";
    const stageHeader = main.querySelector(".workflow-v2-stage-header");
    stageHeader?.after(workspace);
    [...main.children].forEach((child) => {
      if (
        child !== workspace &&
        child !== stageHeader &&
        !child.matches('[data-workflow-v2-timeline="true"]') &&
        !child.classList.contains("workflow-v2-legacy-page-heading")
      ) {
        child.classList.add("step3-legacy-content");
      }
    });
  }
  const allocated = leafFunctions(data.functionTree).reduce(
    (sum, item) => sum + numberValue(item.areaM2),
    0
  );
  const target = numberValue(data.areaAllocation.targetGfaM2);
  const difference = target - allocated;
  const primaryCount = data.functionTree.filter(
    (item) => Number(item.level) === 1
  ).length;
  const validation = validateFunctionConstructData(data);
  const signature = JSON.stringify({
    data,
    blockingItems: validation.blockingItems
  });
  if (workspace.dataset.signature === signature) return;
  workspace.dataset.signature = signature;

  const functionOptions = data.functionTree
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
    )
    .join("");

  workspace.innerHTML = `
    <div class="step3-overview">
      <div><span>一级功能</span><strong>${primaryCount}</strong><small>个分区</small></div>
      <div><span>目标面积</span><strong>${target.toLocaleString()}</strong><small>㎡</small></div>
      <div><span>已分配</span><strong>${allocated.toLocaleString()}</strong><small>㎡</small></div>
      <div class="${difference < 0 ? "is-risk" : ""}"><span>面积差额</span><strong>${difference.toLocaleString()}</strong><small>㎡</small></div>
      <div class="${validation.blockingItems.length ? "is-risk" : ""}"><span>阻断项</span><strong>${validation.blockingItems.length}</strong><small>项</small></div>
    </div>

    <div class="step3-layout">
      <div class="step3-main-column">
        <section class="step3-panel">
          <header class="step3-panel-header">
            <div><span>A</span><h2>功能分级与面积分配</h2></div>
            <div class="step3-header-actions">
              <button type="button" data-action="regenerate">根据前序条件重新生成</button>
              <button type="button" class="is-primary" data-action="add-function">新增功能</button>
            </div>
          </header>
          <p class="step3-panel-description">确认一级、二级、三级功能结构，并调整面积和空间属性。系统自动计算面积比例和潜在冲突。</p>
          <div class="step3-function-head">
            <span>序号</span><span>层级</span><span>功能名称</span><span>类型</span><span>面积</span><span>占比</span><span>操作</span>
          </div>
          <div class="step3-function-list">${renderFunctionRows(data)}</div>
        </section>

        <section class="step3-panel">
          <header class="step3-panel-header">
            <div><span>B</span><h2>功能关系与气泡图</h2></div>
          </header>
          <p class="step3-panel-description">建立紧邻、相邻、隔离或无关关系。图中实线表示强联系，虚线表示一般联系。</p>
          <div class="step3-relation-layout">
            <div class="step3-graph-frame">${renderBubbleGraph(data)}</div>
            <div class="step3-relation-editor">
              <div class="step3-relation-form">
                <select data-relation-source>${functionOptions}</select>
                <select data-relation-strength>
                  <option value="adjacent">紧邻</option>
                  <option value="near">相邻</option>
                  <option value="separate">隔离</option>
                  <option value="none">无关</option>
                </select>
                <select data-relation-target>${functionOptions}</select>
                <button type="button" data-action="add-relation">添加关系</button>
              </div>
              <div class="step3-relation-list">${renderRelations(data)}</div>
            </div>
          </div>
        </section>
      </div>

      <aside class="step3-side-column">
        <section class="step3-panel step3-area-panel">
          <header class="step3-panel-header"><div><span>C</span><h2>面积校核</h2></div></header>
          <label class="step3-target-area">目标总建筑面积
            <div><input type="number" min="1" step="100" data-global-field="targetGfaM2" value="${target}" /><span>㎡</span></div>
          </label>
          <dl>
            <div><dt>强制功能</dt><dd>${leafFunctions(data.functionTree).filter((item) => item.category === "required").reduce((sum, item) => sum + numberValue(item.areaM2), 0).toLocaleString()}㎡</dd></div>
            <div><dt>弹性功能</dt><dd>${leafFunctions(data.functionTree).filter((item) => item.category === "flexible").reduce((sum, item) => sum + numberValue(item.areaM2), 0).toLocaleString()}㎡</dd></div>
            <div><dt>配套功能</dt><dd>${leafFunctions(data.functionTree).filter((item) => item.category === "support").reduce((sum, item) => sum + numberValue(item.areaM2), 0).toLocaleString()}㎡</dd></div>
            <div class="is-total"><dt>已分配合计</dt><dd>${allocated.toLocaleString()}㎡</dd></div>
            <div class="${difference < 0 ? "is-risk" : ""}"><dt>剩余可分配</dt><dd>${difference.toLocaleString()}㎡</dd></div>
          </dl>
        </section>

        <section class="step3-panel">
          <header class="step3-panel-header"><div><span>D</span><h2>动线体系</h2></div></header>
          <div class="step3-circulation-fields">
            <label>主要人流
              <select data-circulation="publicFlow">${options([["independent", "独立组织"], ["shared", "局部共享"], ["integrated", "综合组织"]], data.circulationSystem.publicFlow)}</select>
            </label>
            <label>内部人流
              <select data-circulation="internalFlow">${options([["controlled", "受控组织"], ["shared", "与公众共享"], ["independent", "独立组织"]], data.circulationSystem.internalFlow)}</select>
            </label>
            <label>物流 / 后勤
              <select data-circulation="serviceFlow">${options([["independent", "独立组织"], ["timed", "分时共享"], ["shared", "与公众共享"]], data.circulationSystem.serviceFlow)}</select>
            </label>
            <label class="step3-check"><input type="checkbox" data-circulation-check="publicServiceSeparated" ${data.circulationSystem.publicServiceSeparated ? "checked" : ""} />公众与后勤流线分离</label>
            <label class="step3-check"><input type="checkbox" data-circulation-check="cleanDirtySeparated" ${data.circulationSystem.cleanDirtySeparated ? "checked" : ""} />洁净与污染流线分离</label>
            <label class="step3-check is-confirm"><input type="checkbox" data-circulation-check="coreDecisionConfirmed" ${data.circulationSystem.coreDecisionConfirmed ? "checked" : ""} />确认核心动线判断</label>
          </div>
        </section>

        <section class="step3-panel">
          <header class="step3-panel-header"><div><span>E</span><h2>冲突检测</h2></div><strong class="step3-count">${data.conflicts.length}</strong></header>
          <div class="step3-conflict-list">${renderConflicts(data)}</div>
        </section>

        ${
          data.normDerivedConstraints.length
            ? `
              <section class="step3-panel step3-norm-constraints">
                <header class="step3-panel-header"><div><span>F</span><h2>规范约束输入</h2></div><strong class="step3-count">${data.normDerivedConstraints.length}</strong></header>
                <p class="step3-panel-description">以下条件来自边界锚定，已参与功能分区、邻接和动线组织判断。</p>
                <ul>
                  ${data.normDerivedConstraints
                    .map(
                      (item) =>
                        `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span><em>${item.status === "systemEstimated" ? "系统估算" : "用户确认"}</em></li>`
                    )
                    .join("")}
                </ul>
              </section>`
            : ""
        }
      </aside>
    </div>
  `;
};

const newFunction = () => {
  const id = `function-${Date.now()}`;
  draft.functionTree.push({
    id,
    name: "新功能",
    level: 1,
    parentId: null,
    category: "flexible",
    areaM2: 0
  });
  draft.functionAttributes[id] = {
    publicity: "semiPublic",
    privacy: "medium",
    daylight: "preferred",
    floorHeight: "standard",
    noise: "medium",
    load: "standard",
    cleanliness: "general"
  };
};

const removeFunction = (id) => {
  draft.functionTree = draft.functionTree.filter((item) => item.id !== id);
  delete draft.functionAttributes[id];
  draft.relationshipGraph.edges = draft.relationshipGraph.edges.filter(
    (edge) => edge.source !== id && edge.target !== id
  );
};

const handleClick = (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !draft) return;
  const action = button.dataset.action;
  if (action === "add-function") {
    newFunction();
    saveDraft("Add function");
  }
  if (action === "delete-function") {
    const id = button.closest("[data-function-id]")?.dataset.functionId;
    if (id) {
      removeFunction(id);
      saveDraft("Delete function");
    }
  }
  if (action === "regenerate") {
    draft = normalizeDraft(
      createInitialFunctionConstructData(
        store.getPackage("boundaryAnchorPackage")
      )
    );
    saveDraft("Regenerate function structure from boundary anchor");
  }
  if (action === "add-relation") {
    const workspace = button.closest("#function-construct-workspace");
    const source = workspace.querySelector("[data-relation-source]").value;
    const target = workspace.querySelector("[data-relation-target]").value;
    const strength = workspace.querySelector("[data-relation-strength]").value;
    if (source && target && source !== target) {
      const duplicate = draft.relationshipGraph.edges.find(
        (edge) =>
          (edge.source === source && edge.target === target) ||
          (edge.source === target && edge.target === source)
      );
      if (duplicate) duplicate.strength = strength;
      else {
        draft.relationshipGraph.edges.push({
          id: `relation-${Date.now()}`,
          source,
          target,
          strength
        });
      }
      saveDraft("Update function relationship");
    }
  }
  if (action === "delete-relation") {
    draft.relationshipGraph.edges = draft.relationshipGraph.edges.filter(
      (edge) => edge.id !== button.dataset.relationId
    );
    saveDraft("Delete function relationship");
  }
  queueRender();
};

const handleChange = (event) => {
  if (!draft) return;
  const functionRow = event.target.closest("[data-function-id]");
  const id = functionRow?.dataset.functionId;
  if (id && event.target.dataset.field) {
    const item = draft.functionTree.find((entry) => entry.id === id);
    const field = event.target.dataset.field;
    if (item) {
      item[field] =
        field === "areaM2" || field === "level"
          ? numberValue(event.target.value)
          : event.target.value;
    }
  }
  if (id && event.target.dataset.attribute) {
    draft.functionAttributes[id] ||= {};
    draft.functionAttributes[id][event.target.dataset.attribute] =
      event.target.value;
  }
  if (event.target.dataset.globalField === "targetGfaM2") {
    draft.areaAllocation.targetGfaM2 = Math.max(
      0,
      numberValue(event.target.value)
    );
  }
  if (event.target.dataset.circulation) {
    draft.circulationSystem[event.target.dataset.circulation] =
      event.target.value;
  }
  if (event.target.dataset.circulationCheck) {
    draft.circulationSystem[event.target.dataset.circulationCheck] =
      event.target.checked;
  }
  saveDraft("Edit function construct");
  queueRender();
};

const mount = () => {
  const step = store.getState().currentStep;
  const existing = document.querySelector("#function-construct-workspace");
  if (step !== 3) {
    existing?.remove();
    document
      .querySelectorAll(".step3-legacy-content")
      .forEach((element) => element.classList.remove("step3-legacy-content"));
    return;
  }
  renderWorkspace();
  const workspace = document.querySelector("#function-construct-workspace");
  if (workspace && workspace.dataset.eventsBound !== "true") {
    workspace.dataset.eventsBound = "true";
    workspace.addEventListener("click", handleClick);
    workspace.addEventListener("change", handleChange);
  }
};

const queueRender = () => {
  if (renderQueued || typeof document === "undefined") return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    mount();
  });
};

if (typeof document !== "undefined") {
  const observer = new MutationObserver((mutations) => {
    if (
      mutations.every((mutation) =>
        mutation.target?.closest?.("#function-construct-workspace")
      )
    ) {
      return;
    }
    queueRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  store.subscribe(() => {
    if (!internalUpdate) {
      loadedRevision = -1;
      draft = null;
    }
    queueRender();
  });
  document.addEventListener("DOMContentLoaded", queueRender, { once: true });
  queueRender();
}

export { normalizeDraft };
