import {
  createInitialConceptStrategyData,
  store,
  validateConceptStrategyData
} from "./archiconcept-data-chain.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

let draft = null;
let loadedRevision = -1;
let internalUpdate = false;
let queued = false;

const rebuildDerived = (data) => {
  const next = clone(data);
  next.coreProblems ||= [];
  next.designStrategies ||= [];
  next.strategyBindings = next.designStrategies.flatMap((strategy) =>
    (strategy.problemIds || []).map((problemId) => ({
      id: `binding-${strategy.id}-${problemId}`,
      problemId,
      strategyId: strategy.id
    }))
  );
  next.problemEvidence = next.coreProblems.flatMap((problem) =>
    (problem.evidence || []).map((evidence) => ({
      ...evidence,
      problemId: problem.id
    }))
  );
  next.conceptDiagram = {
    nodes: [
      ...next.coreProblems.map((problem) => ({
        id: problem.id,
        label: problem.title,
        type: "problem"
      })),
      ...next.designStrategies.map((strategy) => ({
        id: strategy.id,
        label: strategy.title,
        type: "strategy"
      })),
      {
        id: "concept",
        label: next.conceptName || "核心概念",
        type: "concept"
      }
    ],
    links: next.strategyBindings.flatMap((binding) => [
      {
        source: binding.problemId,
        target: binding.strategyId,
        type: "responds"
      },
      {
        source: binding.strategyId,
        target: "concept",
        type: "supports"
      }
    ])
  };
  return next;
};

const ensureDraft = () => {
  const packageData = store.getPackage("conceptStrategyPackage");
  if (draft && loadedRevision === packageData.revision) return draft;
  const current = packageData.data || {};
  if (!current.coreProblems?.length || !current.designStrategies?.length) {
    const initial = createInitialConceptStrategyData(store.getState());
    const validation = validateConceptStrategyData(initial);
    internalUpdate = true;
    const updated = store.updatePackage(
      "conceptStrategyPackage",
      {
        completionStatus: validation.blockingItems.length ? "partial" : "ready",
        confidenceLevel: "medium",
        blockingItems: validation.blockingItems,
        assumptions: [
          {
            key: "conceptStrategyDraft",
            value: "系统根据前三步数据生成初始问题与策略",
            reason: "用户可在本步骤确认、删除、补充或修改。",
            source: "systemInference"
          }
        ],
        data: initial
      },
      {
        replaceData: true,
        source: "systemInference",
        reason: "Generate initial concept strategy from upstream packages"
      }
    );
    internalUpdate = false;
    loadedRevision = updated.revision;
    draft = rebuildDerived(updated.data);
    return draft;
  }
  loadedRevision = packageData.revision;
  draft = rebuildDerived(current);
  return draft;
};

const saveDraft = (reason) => {
  draft = rebuildDerived(draft);
  const validation = validateConceptStrategyData(draft);
  internalUpdate = true;
  const updated = store.updatePackage(
    "conceptStrategyPackage",
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

const selectOptions = (items, selected) =>
  items
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");

const renderEvidence = (problem) =>
  (problem.evidence || [])
    .map(
      (evidence) => `
      <div class="step4-evidence">
        <span>${escapeHtml(evidence.label || evidence.source)}</span>
        <p>${escapeHtml(evidence.detail)}</p>
      </div>`
    )
    .join("");

const renderProblems = (data) =>
  data.coreProblems
    .map(
      (problem, index) => `
      <article class="step4-problem" data-problem-id="${escapeHtml(problem.id)}">
        <header>
          <span class="step4-problem-index">${String(index + 1).padStart(2, "0")}</span>
          <select data-problem-field="priority" aria-label="问题优先级">
            ${selectOptions(
              [
                ["P0", "P0 必须回应"],
                ["P1", "P1 建议回应"],
                ["P2", "P2 参考问题"]
              ],
              problem.priority
            )}
          </select>
          <span class="step4-category">${escapeHtml(problem.category)}</span>
          <label class="step4-confirm">
            <input type="checkbox" data-problem-field="confirmed" ${problem.confirmed !== false ? "checked" : ""} />
            已确认
          </label>
          <button type="button" data-action="delete-problem">删除</button>
        </header>
        <input class="step4-title-input" data-problem-field="title" value="${escapeHtml(problem.title)}" aria-label="核心问题标题" />
        <textarea data-problem-field="description" rows="2" aria-label="核心问题说明">${escapeHtml(problem.description)}</textarea>
        <div class="step4-evidence-list">
          <strong>依据来源</strong>
          ${renderEvidence(problem)}
        </div>
      </article>`
    )
    .join("");

const renderStrategies = (data) => {
  const problemOptions = data.coreProblems
    .map(
      (problem) =>
        `<option value="${escapeHtml(problem.id)}">${escapeHtml(problem.title)}</option>`
    )
    .join("");
  return data.designStrategies
    .map(
      (strategy, index) => `
      <article class="step4-strategy" data-strategy-id="${escapeHtml(strategy.id)}">
        <header>
          <span>S${String(index + 1).padStart(2, "0")}</span>
          <label><input type="checkbox" data-strategy-field="confirmed" ${strategy.confirmed !== false ? "checked" : ""} />启用</label>
          <button type="button" data-action="delete-strategy">删除</button>
        </header>
        <input class="step4-title-input" data-strategy-field="title" value="${escapeHtml(strategy.title)}" aria-label="设计策略标题" />
        <textarea data-strategy-field="description" rows="2" aria-label="设计策略说明">${escapeHtml(strategy.description)}</textarea>
        <label class="step4-field-label">回应问题
          <select data-strategy-field="problemId">
            ${problemOptions.replace(
              `value="${escapeHtml(strategy.problemIds?.[0] || "")}"`,
              `value="${escapeHtml(strategy.problemIds?.[0] || "")}" selected`
            )}
          </select>
        </label>
        <label class="step4-field-label">影响范围
          <input data-strategy-field="impactAreas" value="${escapeHtml((strategy.impactAreas || []).join("、"))}" placeholder="如：总平布局、体块组织、公共界面" />
        </label>
      </article>`
    )
    .join("");
};

const renderBindings = (data) => {
  const problems = Object.fromEntries(
    data.coreProblems.map((item) => [item.id, item])
  );
  return data.designStrategies
    .filter((strategy) => strategy.confirmed !== false)
    .map((strategy) => {
      const problem = problems[strategy.problemIds?.[0]];
      return `
        <div class="step4-binding-row">
          <span class="is-problem">${escapeHtml(problem?.title || "未绑定问题")}</span>
          <i>回应</i>
          <span class="is-strategy">${escapeHtml(strategy.title)}</span>
          <i>支撑</i>
          <span class="is-concept">${escapeHtml(data.conceptName || "核心概念")}</span>
        </div>`;
    })
    .join("");
};

const renderWorkspace = () => {
  const main = document.querySelector("main");
  if (!main || store.getState().currentStep !== 4) return;
  const data = ensureDraft();
  let workspace = document.querySelector("#concept-strategy-workspace");
  if (!workspace) {
    workspace = document.createElement("section");
    workspace.id = "concept-strategy-workspace";
    workspace.className = "step4-workspace";
    const header = main.querySelector(".workflow-v2-stage-header");
    header?.after(workspace);
    [...main.children].forEach((child) => {
      if (
        child !== workspace &&
        child !== header &&
        !child.matches('[data-workflow-v2-timeline="true"]') &&
        !child.classList.contains("workflow-v2-legacy-page-heading")
      ) {
        child.classList.add("step4-legacy-content");
      }
    });
  }
  const validation = validateConceptStrategyData(data);
  const confirmedProblems = data.coreProblems.filter(
    (item) => item.confirmed !== false
  );
  const confirmedStrategies = data.designStrategies.filter(
    (item) => item.confirmed !== false
  );
  const signature = JSON.stringify({ data, validation });
  if (workspace.dataset.signature === signature) return;
  workspace.dataset.signature = signature;
  workspace.innerHTML = `
    <div class="step4-overview">
      <div><span>核心问题</span><strong>${confirmedProblems.length}</strong><small>项</small></div>
      <div><span>P0 问题</span><strong>${confirmedProblems.filter((item) => item.priority === "P0").length}</strong><small>项</small></div>
      <div><span>设计策略</span><strong>${confirmedStrategies.length}</strong><small>项</small></div>
      <div><span>有效绑定</span><strong>${data.strategyBindings.length}</strong><small>组</small></div>
      <div class="${validation.blockingItems.length ? "is-risk" : ""}"><span>阻断项</span><strong>${validation.blockingItems.length}</strong><small>项</small></div>
    </div>

    <div class="step4-grid">
      <section class="step4-panel">
        <header class="step4-panel-header">
          <div><span>A</span><h2>核心问题与依据</h2></div>
          <div>
            <button type="button" data-action="regenerate">重新提炼</button>
            <button type="button" class="is-primary" data-action="add-problem">补充问题</button>
          </div>
        </header>
        <p class="step4-description">从硬性约束、场地限制、功能冲突和用户目标中提炼 3 至 5 个核心问题。每个问题必须保留依据来源。</p>
        <div class="step4-problem-list">${renderProblems(data)}</div>
      </section>

      <section class="step4-panel">
        <header class="step4-panel-header">
          <div><span>B</span><h2>设计策略与问题绑定</h2></div>
          <button type="button" class="is-primary" data-action="add-strategy">新增策略</button>
        </header>
        <p class="step4-description">策略需要明确回应一个核心问题，并说明对总平、体块、功能或界面的影响范围。</p>
        <div class="step4-strategy-list">${renderStrategies(data)}</div>
      </section>
    </div>

    <section class="step4-panel step4-concept-panel">
      <header class="step4-panel-header">
        <div><span>C</span><h2>核心概念与叙事</h2></div>
      </header>
      <div class="step4-concept-layout">
        <div class="step4-candidates">
          <h3>概念方向</h3>
          ${(data.conceptCandidates || [])
            .map(
              (candidate) => `
              <button type="button" data-action="select-concept" data-concept-id="${escapeHtml(candidate.id)}" class="${candidate.id === data.selectedConceptId ? "is-selected" : ""}">
                <strong>${escapeHtml(candidate.name)}</strong>
                <span>${escapeHtml(candidate.statement)}</span>
              </button>`
            )
            .join("")}
        </div>
        <div class="step4-concept-editor">
          <label>概念名称
            <input data-concept-field="conceptName" value="${escapeHtml(data.conceptName)}" />
          </label>
          <label>一句话概念说明
            <textarea data-concept-field="conceptStatement" rows="3">${escapeHtml(data.conceptStatement)}</textarea>
          </label>
          <label>概念叙事
            <textarea data-concept-field="conceptNarrative" rows="5">${escapeHtml(data.conceptNarrative)}</textarea>
          </label>
          <p>概念必须引用具体问题和策略，避免仅使用“绿色、生态、人本、融合”等通用词。</p>
        </div>
      </div>
    </section>

    <div class="step4-bottom-grid">
      <section class="step4-panel">
        <header class="step4-panel-header"><div><span>D</span><h2>推导关系</h2></div></header>
        <div class="step4-binding-list">${renderBindings(data)}</div>
      </section>
      <section class="step4-panel">
        <header class="step4-panel-header"><div><span>E</span><h2>进入方案优化前校核</h2></div></header>
        <div class="step4-validation">
          ${
            validation.blockingItems.length
              ? validation.blockingItems
                  .map(
                    (item) => `
                    <article>
                      <strong>${escapeHtml(item.label)}</strong>
                      <p>${escapeHtml(item.impact)}</p>
                    </article>`
                  )
                  .join("")
              : `<div class="step4-ready"><strong>问题与策略已形成有效对应</strong><p>当前概念具备进入方案优化的最小依据链。</p></div>`
          }
        </div>
      </section>
    </div>
  `;
};

const saveAndRender = (reason) => {
  saveDraft(reason);
  queueRender();
};

const handleClick = (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !draft) return;
  const action = button.dataset.action;
  if (action === "regenerate") {
    draft = createInitialConceptStrategyData(store.getState());
    saveAndRender("Regenerate concept strategy");
  }
  if (action === "add-problem") {
    const id = `problem-${Date.now()}`;
    draft.coreProblems.push({
      id,
      priority: "P1",
      category: "用户补充",
      title: "待补充核心问题",
      description: "请说明该问题为何会影响后续设计判断。",
      confirmed: true,
      evidence: [
        {
          id: `evidence-${Date.now()}`,
          source: "userInput",
          label: "用户输入",
          detail: "用户在方案生成阶段补充。"
        }
      ]
    });
    saveAndRender("Add core problem");
  }
  if (action === "delete-problem") {
    const id = button.closest("[data-problem-id]")?.dataset.problemId;
    draft.coreProblems = draft.coreProblems.filter((item) => item.id !== id);
    draft.designStrategies.forEach((strategy) => {
      strategy.problemIds = (strategy.problemIds || []).filter(
        (problemId) => problemId !== id
      );
    });
    saveAndRender("Delete core problem");
  }
  if (action === "add-strategy") {
    const problemId = draft.coreProblems[0]?.id || null;
    draft.designStrategies.push({
      id: `strategy-${Date.now()}`,
      title: "新设计策略",
      description: "说明该策略如何回应核心问题并转化为空间操作。",
      problemIds: problemId ? [problemId] : [],
      impactAreas: ["体块组织"],
      actions: [],
      confirmed: true
    });
    saveAndRender("Add design strategy");
  }
  if (action === "delete-strategy") {
    const id = button.closest("[data-strategy-id]")?.dataset.strategyId;
    draft.designStrategies = draft.designStrategies.filter(
      (item) => item.id !== id
    );
    saveAndRender("Delete design strategy");
  }
  if (action === "select-concept") {
    const candidate = draft.conceptCandidates.find(
      (item) => item.id === button.dataset.conceptId
    );
    if (candidate) {
      draft.selectedConceptId = candidate.id;
      draft.conceptName = candidate.name;
      draft.conceptStatement = candidate.statement;
      saveAndRender("Select concept direction");
    }
  }
};

const handleChange = (event) => {
  if (!draft) return;
  const problemId = event.target.closest("[data-problem-id]")?.dataset.problemId;
  const problemField = event.target.dataset.problemField;
  if (problemId && problemField) {
    const problem = draft.coreProblems.find((item) => item.id === problemId);
    if (problem) {
      problem[problemField] =
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;
    }
  }
  const strategyId =
    event.target.closest("[data-strategy-id]")?.dataset.strategyId;
  const strategyField = event.target.dataset.strategyField;
  if (strategyId && strategyField) {
    const strategy = draft.designStrategies.find(
      (item) => item.id === strategyId
    );
    if (strategy) {
      if (strategyField === "problemId") {
        strategy.problemIds = event.target.value ? [event.target.value] : [];
      } else if (strategyField === "impactAreas") {
        strategy.impactAreas = event.target.value
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
      } else {
        strategy[strategyField] =
          event.target.type === "checkbox"
            ? event.target.checked
            : event.target.value;
      }
    }
  }
  const conceptField = event.target.dataset.conceptField;
  if (conceptField) draft[conceptField] = event.target.value;
  saveAndRender("Edit concept strategy");
};

const mount = () => {
  const step = store.getState().currentStep;
  const existing = document.querySelector("#concept-strategy-workspace");
  if (step !== 4) {
    existing?.remove();
    document
      .querySelectorAll(".step4-legacy-content")
      .forEach((element) => element.classList.remove("step4-legacy-content"));
    return;
  }
  renderWorkspace();
  const workspace = document.querySelector("#concept-strategy-workspace");
  if (workspace && workspace.dataset.eventsBound !== "true") {
    workspace.dataset.eventsBound = "true";
    workspace.addEventListener("click", handleClick);
    workspace.addEventListener("change", handleChange);
  }
};

const queueRender = () => {
  if (queued || typeof document === "undefined") return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    mount();
  });
};

if (typeof document !== "undefined") {
  const observer = new MutationObserver((mutations) => {
    if (
      mutations.every((mutation) =>
        mutation.target?.closest?.("#concept-strategy-workspace")
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

export { rebuildDerived };
