import {
  buildDesignConstraintTable,
  store,
  validateConceptStrategyData,
  validateFunctionConstructData
} from "./archiconcept-data-chain.js";

const WORKFLOW_V2_STEPS = Object.freeze([
  {
    step: 1,
    route: "boundary-anchor",
    title: "设计边界",
    englishTitle: "Boundary Anchor",
    shortEnglishTitle: "BOUNDARY ANCHOR",
    packageName: "boundaryAnchorPackage",
    description: "整理任务书、规划指标和功能要求，形成后续分析采用的条件基准。",
    modules: ["项目基本信息", "规划指标", "功能与面积", "规范条件", "约束汇总"]
  },
  {
    step: 2,
    route: "site-analysis",
    title: "场地解析",
    englishTitle: "Site Analysis",
    shortEnglishTitle: "SITE ANALYSIS",
    packageName: "siteAnalysisPackage",
    description: "解析场地限制与机会，形成可传递的场地判断。",
    modules: ["地点与红线", "出入口", "周边设施", "限制与机会", "场地 SWOT"]
  },
  {
    step: 3,
    route: "program-logic",
    title: "功能建构",
    englishTitle: "Program Logic",
    shortEnglishTitle: "PROGRAM LOGIC",
    packageName: "functionConstructPackage",
    description: "拆解功能需求，建立面积、关系和动线逻辑。",
    modules: ["功能分级", "面积分配", "功能属性", "关系图谱", "动线与冲突"]
  },
  {
    step: 4,
    route: "concept-strategy",
    title: "概念生成",
    englishTitle: "Concept Strategy",
    shortEnglishTitle: "CONCEPT STRATEGY",
    packageName: "conceptStrategyPackage",
    description: "从约束、场地和功能中提炼核心问题并绑定策略。",
    modules: ["核心问题", "问题依据", "设计策略", "策略绑定", "核心概念"]
  },
  {
    step: 5,
    route: "massing-placement",
    title: "形态落位",
    englishTitle: "Massing Placement",
    shortEnglishTitle: "MASSING PLACEMENT",
    packageName: "massingPlacementPackage",
    description: "将功能与概念转化为体块、总平和多方案布局。",
    modules: ["入口落位", "功能体块", "操作链", "指标测算", "多方案总平"]
  },
  {
    step: 6,
    route: "option-validation",
    title: "比选定型",
    englishTitle: "Option Validation",
    shortEnglishTitle: "OPTION VALIDATION",
    packageName: "finalConceptPackage",
    description: "比较方案、校核硬性条件并形成最终概念方案。",
    modules: ["方案比选", "硬性校核", "软性评分", "风险记录", "最终报告"]
  }
]);

const WORKFLOW_V2_PRODUCT_NAV = Object.freeze({
  top: ["项目", "档案", "流程", "实验室", "工作台"],
  primary: [
    "项目概览",
    "概念方案",
    "概念生成",
    "平面布局",
    "立面生成",
    "渲染表现",
    "图纸导出"
  ],
  secondary: ["文件管理", "协作成员", "项目设置"],
  activeTop: "工作台",
  activeSide: "概念方案"
});

const WORKFLOW_V2_SIDE_ICONS = Object.freeze([
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 12h14M5 17.5h9"/><path d="M4.5 4.5h15v15h-15z"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V7.5L12 4l7 3.5V19"/><path d="M8 19v-6h8v6"/><path d="M9.5 9.5h5"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16"/><path d="M6 8h12"/><path d="M7.5 13h9"/><path d="M9 18h6"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18l5-12 4 8 2-4 3 8"/><path d="M4 18h16"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18V6h12v12"/><path d="M9 18v-7h6v7"/><path d="M6 18h12"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5h14"/><path d="M7 17.5V9l5-3 5 3v8.5"/><path d="M10 17.5v-5h4v5"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10v15H7z"/><path d="M9.5 8h5"/><path d="M9.5 12h5"/><path d="M9.5 16h3"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v11H5z"/><path d="M8 9.5h8"/><path d="M8 13.5h5"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9a5 5 0 0 1 10 0"/><path d="M5.5 18.5c1.5-3 11.5-3 13 0"/><path d="M9 9a3 3 0 0 0 6 0"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v3"/><path d="M12 16.5v3"/><path d="M4.5 12h3"/><path d="M16.5 12h3"/><path d="M8.2 8.2l2.1 2.1"/><path d="M13.7 13.7l2.1 2.1"/><path d="M15.8 8.2l-2.1 2.1"/><path d="M10.3 13.7l-2.1 2.1"/></svg>'
]);

const workflowV2SideIcon = (index) =>
  WORKFLOW_V2_SIDE_ICONS[index % WORKFLOW_V2_SIDE_ICONS.length];

const STATUS_META = Object.freeze({
  empty: { label: "未开始", tone: "muted" },
  partial: { label: "进行中", tone: "active" },
  ready: { label: "待确认", tone: "warning" },
  confirmed: { label: "已完成", tone: "success" }
});

const getStepConfig = (step) =>
  WORKFLOW_V2_STEPS.find((item) => item.step === Number(step)) ||
  WORKFLOW_V2_STEPS[0];

const getPackageForStep = (chain, step) => {
  const config = getStepConfig(step);
  return chain?.[config.packageName] || null;
};

const deriveStepState = (chain, step) => {
  const packageData = getPackageForStep(chain, step);
  if (!packageData) {
    return {
      status: "empty",
      label: STATUS_META.empty.label,
      tone: STATUS_META.empty.tone,
      stale: false,
      blockingCount: 0,
      assumptionCount: 0,
      confidenceLevel: "low"
    };
  }

  const base = STATUS_META[packageData.completionStatus] || STATUS_META.empty;
  if (packageData.stale) {
    return {
      status: packageData.completionStatus,
      label: "需复核",
      tone: "stale",
      stale: true,
      blockingCount: packageData.blockingItems?.length || 0,
      assumptionCount: packageData.assumptions?.length || 0,
      confidenceLevel: packageData.confidenceLevel || "low"
    };
  }
  if (packageData.blockingItems?.length) {
    return {
      status: packageData.completionStatus,
      label: "有必须补充项",
      tone: "blocking",
      stale: false,
      blockingCount: packageData.blockingItems.length,
      assumptionCount: packageData.assumptions?.length || 0,
      confidenceLevel: packageData.confidenceLevel || "low"
    };
  }
  return {
    status: packageData.completionStatus,
    label: base.label,
    tone: base.tone,
    stale: false,
    blockingCount: 0,
    assumptionCount: packageData.assumptions?.length || 0,
    confidenceLevel: packageData.confidenceLevel || "low"
  };
};

const hasMinimumBoundaryData = (chain) => {
  const boundary = chain?.boundaryAnchorPackage;
  const identity = boundary?.data?.projectIdentity || {};
  const controls = boundary?.data?.hardControls || {};
  const requirements = boundary?.data?.functionRequirements || {};
  return Boolean(
    identity.projectName &&
      identity.buildingType &&
      (controls.siteAreaM2 || controls.buildableBoundaryAreaM2) &&
      (requirements.program || requirements.siteCondition)
  );
};

const hasMinimumFunctionData = (chain) => {
  const data = chain?.functionConstructPackage?.data || {};
  return validateFunctionConstructData(data).blockingItems.length === 0;
};

const hasMinimumConceptData = (chain) => {
  const data = chain?.conceptStrategyPackage?.data || {};
  return validateConceptStrategyData(data).blockingItems.length === 0;
};

const hasMinimumMassingData = (chain) => {
  const options = chain?.massingPlacementPackage?.data?.massingOptions || [];
  return options.length >= 2;
};

const guardStepNavigation = (chain, targetStep, currentStep = chain?.currentStep || 1) => {
  const target = Math.min(6, Math.max(1, Number(targetStep) || 1));
  const current = Math.min(6, Math.max(1, Number(currentStep) || 1));
  if (target <= current) {
    return { allowed: true, severity: "none", missingItems: [], targetStep: target };
  }

  const boundary = chain?.boundaryAnchorPackage;
  if (
    target >= 2 &&
    (!hasMinimumBoundaryData(chain) || boundary?.blockingItems?.length)
  ) {
    return {
      allowed: false,
      severity: "blocking",
      targetStep: target,
      redirectStep: 1,
      missingItems: boundary?.blockingItems || ["请先完成设计边界的最小必填项"],
      message: "设计边界尚未达到进入后续阶段的条件。"
    };
  }

  if (target >= 4 && !hasMinimumFunctionData(chain)) {
    return {
      allowed: false,
      severity: "blocking",
      targetStep: target,
      redirectStep: 3,
      missingItems: ["一级功能结构", "核心面积或动线判断"],
      message: "请先在功能建构中形成最小功能与动线判断。"
    };
  }

  if (target >= 5 && !hasMinimumConceptData(chain)) {
    return {
      allowed: false,
      severity: "blocking",
      targetStep: target,
      redirectStep: 4,
      missingItems: ["核心问题", "对应设计策略或核心概念"],
      message: "概念生成尚未形成问题与策略的有效对应。"
    };
  }

  if (target >= 6 && !hasMinimumMassingData(chain)) {
    return {
      allowed: false,
      severity: "blocking",
      targetStep: target,
      redirectStep: 5,
      missingItems: ["至少两个可比较的形态方向"],
      message: "请先生成至少两个可比较方案。"
    };
  }

  const warnings = [];
  if (target >= 3) {
    const site = chain?.siteAnalysisPackage;
    if (!site || site.completionStatus === "empty") {
      warnings.push("场地定位与红线尚未确认，后续推导可信度会降低");
    } else if (site.stale) {
      warnings.push("场地数据已发生变化，后续结果需要复核");
    }
  }
  if (target >= 5 && chain?.conceptStrategyPackage?.stale) {
    warnings.push("概念与策略结果已过期，需要重新确认");
  }
  if (warnings.length) {
    return {
      allowed: true,
      severity: "warning",
      targetStep: target,
      missingItems: warnings,
      message: warnings.join("；")
    };
  }

  return { allowed: true, severity: "none", missingItems: [], targetStep: target };
};

const getStepSummary = (chain, step) => {
  const config = getStepConfig(step);
  const packageData = getPackageForStep(chain, step);
  const state = deriveStepState(chain, step);
  const confidenceLabels = { high: "高", medium: "中", low: "低" };
  const nextStep = WORKFLOW_V2_STEPS.find((item) => item.step === step + 1);
  let nextMessage = nextStep
    ? `完成本阶段后可进入「${nextStep.title}」。`
    : "完成硬性校核后可锁定并导出最终方案。";

  if (state.blockingCount) {
    nextMessage = `仍有 ${state.blockingCount} 个必须处理项。`;
  } else if (state.stale) {
    nextMessage = "前序数据发生变化，本阶段结果需要重新计算或确认。";
  } else if (packageData?.completionStatus === "empty") {
    nextMessage = `开始填写「${config.title}」的核心内容。`;
  }

  return {
    config,
    packageData,
    state,
    confidenceLabel: confidenceLabels[state.confidenceLevel] || "低",
    nextMessage
  };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const asFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/,/g, "").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
};

const formatSquareMeter = (value) => {
  const number = asFiniteNumber(value);
  return number === null ? "未填写" : `${number.toLocaleString("zh-CN")}㎡`;
};

const formatPlainValue = (value, suffix = "") => {
  if (value === null || value === undefined || value === "") return "未填写";
  return `${value}${suffix}`;
};

const hasConfirmedSiteLocation = (data = {}, chain = {}) => {
  const identity = data.projectIdentity || {};
  const site = chain.siteAnalysisPackage?.data || {};
  return Boolean(
    identity.location ||
      site.location?.name ||
      site.siteLocation?.name ||
      site.selectedLocation?.name
  );
};

const hasConfirmedRedLine = (data = {}, chain = {}) => {
  const site = chain.siteAnalysisPackage?.data || {};
  const candidates = [
    data.redLine,
    data.boundary,
    site.redLine,
    site.boundary,
    site.boundaryData
  ];
  return candidates.some((item) => {
    const points =
      item?.points ||
      item?.nodes ||
      item?.coordinates ||
      item?.path ||
      item?.polygon;
    return Array.isArray(points) && points.length >= 3;
  });
};

const getAreaProgramCount = (data = {}) =>
  Array.isArray(data.areaProgram?.items) ? data.areaProgram.items.length : 0;

const renderBoundaryAnchorSummary = (
  panel,
  aside,
  summary,
  chain,
  boundaryConstraints,
  confirmedBoundaryCount
) => {
  const data = summary.packageData?.data || {};
  const controls = data.hardControls || {};
  const metrics = [
    ["用地面积", formatSquareMeter(controls.siteAreaM2)],
    ["总建筑面积", formatSquareMeter(controls.grossFloorAreaM2)],
    ["容积率", formatPlainValue(controls.floorAreaRatio)],
    ["建筑限高", formatPlainValue(controls.heightLimitM, controls.heightLimitM ? " m" : "")]
  ];
  const statusRows = [
    ["场地定位", hasConfirmedSiteLocation(data, chain) ? "已确认" : "未确认"],
    ["用地红线", hasConfirmedRedLine(data, chain) ? "已绘制" : "未绘制"],
    [
      "功能面积",
      getAreaProgramCount(data)
        ? `${getAreaProgramCount(data)} 项`
        : "未填写"
    ]
  ];

  aside
    .querySelectorAll(":scope > .sticky, :scope > .assistant-bubble-merged-source")
    .forEach((element) =>
      element.classList.add("workflow-v2-hidden-legacy-review")
    );
  panel.classList.add("workflow-v2-boundary-summary");
  panel.innerHTML = `
    <div class="workflow-v2-summary-header">
      <div>
        <span>阶段状态</span>
        <strong>${escapeHtml(summary.config.title)}</strong>
      </div>
      <span class="workflow-v2-status is-${summary.state.tone}">
        ${escapeHtml(summary.state.label)}
      </span>
    </div>
    <dl class="workflow-v2-summary-list">
      <div><dt>条件确认度</dt><dd>${confirmedBoundaryCount} / ${boundaryConstraints.length}</dd></div>
      <div><dt>必须处理</dt><dd>${summary.state.blockingCount} 项</dd></div>
      <div><dt>采用估算</dt><dd>${summary.state.assumptionCount} 项</dd></div>
    </dl>
    <div class="workflow-v2-summary-section">
      <div class="workflow-v2-summary-section-title">关键指标</div>
      <div class="workflow-v2-summary-metrics">
        ${metrics
          .map(
            ([label, value]) => `
              <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
    <div class="workflow-v2-summary-section">
      <div class="workflow-v2-summary-section-title">场地与功能</div>
      <div class="workflow-v2-summary-status-grid">
        ${statusRows
          .map(
            ([label, value]) => `
              <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
    ${
      summary.state.stale
        ? `<div class="workflow-v2-stale-note">前序数据已变更，建议复核本阶段内容。</div>`
        : ""
    }
    <div class="workflow-v2-summary-assistant">
      <div>
        <span>ARCHICONCEPT ASSISTANT</span>
        <p>这里保留本页关键条件，后续步骤会读取这些确认结果。</p>
      </div>
      <img src="/images/ip-input-guide2.png" alt="" aria-hidden="true" />
    </div>
  `;
};

const LEGACY_WORKFLOW_LABELS = Object.freeze(
  new Map([
    ["输入条件", "设计边界"],
    ["问题识别", "场地解析"],
    ["空间意图", "功能建构"],
    ["策略匹配", "概念生成"],
    ["原型生成", "形态落位"],
    ["解释输出", "比选定型"],
    ["INPUT BRIEF", "BOUNDARY ANCHOR"],
    ["PROBLEM ID", "SITE ANALYSIS"],
    ["SPATIAL INTENT", "PROGRAM LOGIC"],
    ["STRATEGY MATCH", "CONCEPT STRATEGY"],
    ["PROTOTYPE GEN", "MASSING PLACEMENT"],
    ["OUTCOME EXPLAIN", "OPTION VALIDATION"],
    ["INPUT CONDITIONS", "BOUNDARY ANCHOR"],
    ["ISSUE IDENTIFICATION", "SITE ANALYSIS"],
    ["STRATEGY MATCHING", "CONCEPT STRATEGY"],
    ["PROTOTYPE GENERATION", "MASSING PLACEMENT"],
    ["EXPLAINABLE OUTPUT", "OPTION VALIDATION"],
    ["开始输入条件 START INPUT", "开始设计边界 START"],
    ["开始输入条件", "开始设计边界"],
    ["START INPUT", "START"],
    ["先从输入条件开始吧", "先从设计边界开始"]
  ])
);

const renameGlobalWorkflowLabels = () => {
  document
    .querySelectorAll("h1, h2, h3, h4, p, span, button, div")
    .forEach((element) => {
      if (element.children.length > 0) return;
      const text = element.textContent?.trim() || "";
      const replacement = LEGACY_WORKFLOW_LABELS.get(text);
      if (replacement && text !== replacement) {
        element.textContent = replacement;
      }
    });
};

const findWorkflowMain = () =>
  document.querySelector("main:has(#id-section-a)") ||
  document.querySelector("#main-container-step2") ||
  [...document.querySelectorAll("main")].find((main) =>
    main.querySelector('[class*="max-w-"][class*="mx-auto"]')
  ) ||
  document.querySelector("main");

const isWorkflowPage = () =>
  Boolean(
    document.querySelector("#id-section-a") ||
      document.querySelector("#main-container-step2") ||
      [...document.querySelectorAll("main h1")].some((title) =>
        /空间意图|策略匹配|原型生成|解释输出|功能建构|概念生成|形态落位|比选定型/.test(
          title.textContent || ""
        )
      )
  );

const getRightColumn = (main) =>
  main?.querySelector("#right-column") ||
  main?.querySelector('.lg\\:col-span-4[class*="sticky"]') ||
  main?.querySelector(".workflow-v2-created-aside");

const getLegacyGrid = (main) =>
  main?.querySelector("#grid-container") ||
  [...(main?.querySelectorAll(".grid") || [])].find((grid) =>
    grid.querySelector('.lg\\:col-span-8, #left-column')
  );

const ensureCreatedAside = (main) => {
  let aside = main.querySelector(".workflow-v2-created-aside");
  if (aside) return aside;
  const grid = getLegacyGrid(main);
  if (!grid) return null;
  aside = document.createElement("aside");
  aside.className =
    "workflow-v2-created-aside lg:col-span-4 self-start text-left";
  grid.appendChild(aside);
  return aside;
};

const renderStatusSummary = (chain, step, main) => {
  const summary = getStepSummary(chain, step);
  const boundaryConstraints =
    step === 1
      ? buildDesignConstraintTable(
          summary.packageData?.data || {},
          summary.packageData || {}
        )
      : [];
  const confirmedBoundaryCount = boundaryConstraints.filter(
    (item) => item.statusCode === "confirmed"
  ).length;
  const aside = getRightColumn(main) || ensureCreatedAside(main);
  if (!aside) return;

  let panel = aside.querySelector(":scope > .workflow-v2-summary");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "workflow-v2-summary";
    aside.prepend(panel);
  }

  if (step === 1) {
    renderBoundaryAnchorSummary(
      panel,
      aside,
      summary,
      chain,
      boundaryConstraints,
      confirmedBoundaryCount
    );
    return;
  }

  panel.classList.remove("workflow-v2-boundary-summary");
  aside
    .querySelectorAll(":scope > .workflow-v2-hidden-legacy-review")
    .forEach((element) =>
      element.classList.remove("workflow-v2-hidden-legacy-review")
    );

  panel.innerHTML = `
    <div class="workflow-v2-summary-header">
      <div>
        <span>阶段状态</span>
        <strong>${escapeHtml(summary.config.title)}</strong>
      </div>
      <span class="workflow-v2-status is-${summary.state.tone}">
        ${escapeHtml(summary.state.label)}
      </span>
    </div>
    <dl class="workflow-v2-summary-list">
      <div><dt>${step === 1 ? "条件确认度" : "数据可信度"}</dt><dd>${
        step === 1
          ? `${confirmedBoundaryCount} / ${boundaryConstraints.length}`
          : summary.confidenceLabel
      }</dd></div>
      <div><dt>${step === 1 ? "必须处理" : "阻断项"}</dt><dd>${summary.state.blockingCount} 项</dd></div>
      <div><dt>采用估算</dt><dd>${summary.state.assumptionCount} 项</dd></div>
      <div><dt>数据版本</dt><dd>R${summary.packageData?.revision || 0}</dd></div>
    </dl>
    ${
      summary.state.stale
        ? `<div class="workflow-v2-stale-note">前序数据已经变化，本阶段结果需要重新计算。</div>`
        : ""
    }
    <div class="workflow-v2-summary-next">
      <span>下一步状态</span>
      <p>${escapeHtml(summary.nextMessage)}</p>
    </div>
  `;
};

const renderStageHeader = (chain, step, main) => {
  const config = getStepConfig(step);
  const state = deriveStepState(chain, step);
  let header = main.querySelector(":scope > .workflow-v2-stage-header");
  if (!header) {
    header = document.createElement("section");
    header.className = "workflow-v2-stage-header";
    const timeline =
      main.querySelector('[data-workflow-v2-timeline="true"]') ||
      [...main.children].find((child) =>
        /输入条件|问题识别|空间意图|设计边界|场地解析|功能建构/.test(
          child.textContent || ""
        )
      );
    if (timeline?.nextSibling) {
      main.insertBefore(header, timeline.nextSibling);
    } else {
      main.prepend(header);
    }
  }

  header.innerHTML = `
    <div class="workflow-v2-stage-copy">
      <div class="workflow-v2-stage-kicker">
        STEP ${String(step).padStart(2, "0")} / ${escapeHtml(config.englishTitle)}
      </div>
      <div class="workflow-v2-stage-title-row">
        <h1>${escapeHtml(config.title)}</h1>
        <span class="workflow-v2-status is-${state.tone}">${escapeHtml(
          state.label
        )}</span>
      </div>
      <p>${escapeHtml(config.description)}</p>
    </div>
    <div class="workflow-v2-module-strip" aria-label="本阶段工作范围">
      ${config.modules
        .map((module) => `<span>${escapeHtml(module)}</span>`)
        .join("")}
    </div>
  `;
};

const renameLegacyPage = (step, main) => {
  const config = getStepConfig(step);
  const oldTitle = [...main.querySelectorAll("h1")].find(
    (title) => !title.closest(".workflow-v2-stage-header")
  );
  if (oldTitle) {
    oldTitle.parentElement?.classList.add("workflow-v2-legacy-page-heading");
    if (oldTitle.textContent?.trim() !== config.title) {
      oldTitle.textContent = config.title;
    }
  }
};

const updateTimeline = (chain, step, main) => {
  const candidates = [...main.querySelectorAll("div")].filter((element) => {
    const text = element.textContent || "";
    return (
      element.children.length >= 6 &&
      /输入条件|设计边界/.test(text) &&
      /问题识别|场地解析/.test(text) &&
      /解释输出|比选定型/.test(text)
    );
  });
  const timeline = candidates.sort(
    (a, b) => a.querySelectorAll("div").length - b.querySelectorAll("div").length
  )[0];
  if (!timeline) return;
  timeline.dataset.workflowV2Timeline = "true";

  const oldNames = [
    /输入条件|设计边界/,
    /问题识别|场地解析/,
    /空间意图|功能建构/,
    /策略匹配|概念生成/,
    /原型生成|形态落位/,
    /解释输出|比选定型/
  ];
  WORKFLOW_V2_STEPS.forEach((config, index) => {
    const nameNode = [...timeline.querySelectorAll("div")].find(
      (element) =>
        element.children.length === 0 &&
        oldNames[index].test(element.textContent || "")
    );
    if (nameNode && nameNode.textContent?.trim() !== config.title) {
      nameNode.textContent = config.title;
    }
  });

  const nodes = [...timeline.querySelectorAll(".rounded-full")].filter(
    (element) => /^[1-6]$/.test(element.textContent?.trim() || "")
  );
  nodes.slice(0, 6).forEach((node, index) => {
    const targetStep = index + 1;
    const state = deriveStepState(chain, targetStep);
    const group = node.closest(".group");
    group?.setAttribute("data-step-state", state.tone);
    group?.setAttribute("data-workflow-step", targetStep);
    group?.setAttribute(
      "data-current-workflow-step",
      targetStep === step ? "true" : "false"
    );
  });
};

const showNotice = (message, tone = "neutral") => {
  document.querySelector(".workflow-v2-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `workflow-v2-toast is-${tone}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 2800);
};

const showNavigationDialog = (result, onContinue) => {
  document.querySelector(".workflow-v2-dialog-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "workflow-v2-dialog-overlay";
  overlay.innerHTML = `
    <section class="workflow-v2-dialog" role="dialog" aria-modal="true">
      <span class="workflow-v2-dialog-kicker">WORKFLOW CHECK / 流程校核</span>
      <h2>${
        result.severity === "blocking" ? "暂时无法进入该阶段" : "进入前请确认"
      }</h2>
      <p>${escapeHtml(result.message)}</p>
      <ul>${(result.missingItems || [])
        .map((item) => `<li>${escapeHtml(item?.field || item)}</li>`)
        .join("")}</ul>
      <footer>
        <button type="button" data-action="cancel">${
          result.severity === "blocking" ? "返回补充" : "暂不进入"
        }</button>
        ${
          result.severity === "warning"
            ? '<button type="button" data-action="continue">确认并继续</button>'
            : ""
        }
      </footer>
    </section>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay
    .querySelector('[data-action="cancel"]')
    ?.addEventListener("click", close);
  overlay
    .querySelector('[data-action="continue"]')
    ?.addEventListener("click", () => {
      close();
      onContinue?.();
    });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
};

const dispatchNavigation = (step) => {
  store.setCurrentStep(step);
  window.dispatchEvent(
    new CustomEvent("archiconcept:workflow-v2-route", {
      detail: { step }
    })
  );
};

const navigate = (step, options = {}) => {
  const chain = store.getState();
  const result = guardStepNavigation(chain, step, chain.currentStep);
  if (!result.allowed) {
    showNavigationDialog(result);
    return result;
  }
  if (result.severity === "warning" && !options.skipWarning) {
    showNavigationDialog(result, () => dispatchNavigation(step));
    return result;
  }
  dispatchNavigation(step);
  return result;
};

const findNativeNextButton = (step) => {
  const selectors = {
    1: /开始问题识别|NEXT STEP/,
    2: /进入空间意图|请先回答|使用系统估算继续/,
    3: /进入策略匹配|下一步/,
    4: /生成概念方案|进入原型|下一步/,
    5: /进入解释输出|完成原型|下一步/
  };
  const pattern = selectors[step];
  if (!pattern) return null;
  return [...document.querySelectorAll("button")].find(
    (button) =>
      !button.closest(".workflow-v2-actionbar") &&
      pattern.test(button.textContent || "") &&
      !button.disabled
  );
};

const saveCurrentDraft = () => {
  const button = [...document.querySelectorAll("button")].find(
    (item) =>
      !item.closest(".workflow-v2-actionbar") &&
      /保存草稿|SAVE DRAFT/.test(item.textContent || "")
  );
  if (button) button.click();
  else {
    store.persist();
    showNotice("当前数据链草稿已保存。");
  }
};

const continueFromCurrentStep = (step) => {
  if (step === 1) {
    const result = guardStepNavigation(store.getState(), 2, 1);
    if (!result.allowed) {
      showNavigationDialog(result);
      return;
    }
    store.confirmPackage("boundaryAnchorPackage", {
      source: "userInput",
      reason: "Boundary anchor confirmed before entering site analysis",
      invalidateDownstream: false
    });
    navigate(2, { skipWarning: true });
    return;
  }
  if (step === 2) {
    const site = store.getPackage("siteAnalysisPackage");
    if (
      site.data?.siteLocation &&
      site.data?.redline?.geometry?.length >= 3
    ) {
      store.confirmPackage("siteAnalysisPackage", {
        source: "userInput",
        reason: "Site analysis confirmed before entering program logic",
        invalidateDownstream: false
      });
    }
    navigate(3);
    return;
  }
  if (step === 3) {
    const functionPackage = store.getPackage("functionConstructPackage");
    const validation = validateFunctionConstructData(functionPackage.data);
    if (validation.blockingItems.length) {
      showNavigationDialog({
        allowed: false,
        severity: "blocking",
        missingItems: validation.blockingItems,
        message:
          "功能建构尚未达到进入概念生成的条件，请先完成一级功能分区与核心动线判断。"
      });
      return;
    }
    store.confirmPackage("functionConstructPackage", {
      source: "manualEdit",
      reason: "Function construct confirmed before concept strategy",
      confidenceLevel: "high",
      blockingItems: [],
      invalidateDownstream: false
    });
    navigate(4, { skipWarning: true });
    return;
  }
  if (step === 4) {
    const conceptPackage = store.getPackage("conceptStrategyPackage");
    const validation = validateConceptStrategyData(conceptPackage.data);
    if (validation.blockingItems.length) {
      showNavigationDialog({
        allowed: false,
        severity: "blocking",
        missingItems: validation.blockingItems,
        message:
          "概念生成尚未形成完整的问题、依据与策略绑定，请先处理阻断项。"
      });
      return;
    }
    store.confirmPackage("conceptStrategyPackage", {
      source: "manualEdit",
      reason: "Concept strategy confirmed before massing placement",
      confidenceLevel: "high",
      blockingItems: [],
      invalidateDownstream: false
    });
    navigate(5, { skipWarning: true });
    return;
  }
  const nativeButton = findNativeNextButton(step);
  if (nativeButton) {
    nativeButton.click();
    return;
  }
  if (step < 6) navigate(step + 1);
};

const renderActionBar = (chain, step) => {
  let bar = document.querySelector(".workflow-v2-actionbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "workflow-v2-actionbar";
    document.body.appendChild(bar);
  }
  const state = deriveStepState(chain, step);
  bar.innerHTML = `
    <div class="workflow-v2-actionbar-inner">
      <button type="button" class="is-secondary" data-action="back" ${
        step === 1 ? "disabled" : ""
      }>返回上一步</button>
      <div class="workflow-v2-actionbar-meta">
        <span>STEP ${step} / 6</span>
        <strong>${escapeHtml(getStepConfig(step).title)}</strong>
      </div>
      <div class="workflow-v2-actionbar-actions">
        <button type="button" class="is-secondary" data-action="save">保存草稿</button>
        ${
          state.stale
            ? '<button type="button" class="is-secondary" data-action="recalculate">重新计算</button>'
            : ""
        }
        ${
          step < 6
            ? `<button type="button" class="is-primary" data-action="next">继续下一步</button>`
            : '<button type="button" class="is-primary" data-action="finish">完成并保存</button>'
        }
      </div>
    </div>
  `;
  bar.querySelector('[data-action="back"]')?.addEventListener("click", () => {
    if (step > 1) navigate(step - 1, { skipWarning: true });
  });
  bar
    .querySelector('[data-action="save"]')
    ?.addEventListener("click", saveCurrentDraft);
  bar.querySelector('[data-action="recalculate"]')?.addEventListener(
    "click",
    () => {
      showNotice("请在当前兼容工作区重新确认或生成结果。", "warning");
      document
        .querySelector(".workflow-v2-legacy-page-heading")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  );
  bar
    .querySelector('[data-action="next"]')
    ?.addEventListener("click", () => continueFromCurrentStep(step));
  bar.querySelector('[data-action="finish"]')?.addEventListener("click", () => {
    store.persist();
    showNotice("最终方案数据已保存。");
  });
};

const bindTimelineNavigation = (main) => {
  if (main.dataset.workflowV2NavigationBound === "true") return;
  main.dataset.workflowV2NavigationBound = "true";
  main.addEventListener("click", (event) => {
    const target = event.target.closest("[data-workflow-step]");
    if (!target) return;
    event.preventDefault();
    navigate(Number(target.dataset.workflowStep));
  });
};

const getLegacyTopNav = () =>
  [...document.querySelectorAll("nav")].find((nav) => {
    const text = nav.textContent || "";
    return (
      !nav.classList.contains("workflow-v2-topnav") &&
      /ARCHICONCEPT/.test(text) &&
      /工作台|BACK|返回上一步/.test(text)
    );
  });

let workflowV2SidebarExpanded = false;

const renderProductShell = (step) => {
  document.body.classList.add("workflow-v2-shell-active");
  document.body.classList.toggle(
    "workflow-v2-sidebar-expanded",
    workflowV2SidebarExpanded
  );
  getLegacyTopNav()?.classList.add("workflow-v2-legacy-topnav");

  let topNav = document.querySelector(".workflow-v2-topnav");
  if (!topNav) {
    topNav = document.createElement("nav");
    topNav.className = "workflow-v2-topnav";
    topNav.setAttribute("aria-label", "ARCHICONCEPT 顶部导航");
    document.body.appendChild(topNav);
  }
  topNav.innerHTML = `
    <div class="workflow-v2-brand">
      <strong>ARCHICONCEPT</strong>
    </div>
    <span class="workflow-v2-topnav-divider" aria-hidden="true"></span>
    <div class="workflow-v2-topnav-center" aria-label="产品模块">
      ${WORKFLOW_V2_PRODUCT_NAV.top
        .map(
          (item) => `
            <button type="button" ${
              item === WORKFLOW_V2_PRODUCT_NAV.activeTop ? 'aria-current="page"' : ""
            }>${escapeHtml(item)}${item === "工作台" ? '<span aria-hidden="true">⌄</span>' : ""}</button>
          `
        )
        .join("")}
    </div>
    <div class="workflow-v2-topnav-actions" aria-label="账户操作">
      <button type="button" class="workflow-v2-login">登录</button>
      <button type="button" class="workflow-v2-register">注册</button>
    </div>
  `;

  let sidebar = document.querySelector(".workflow-v2-sidebar");
  if (!sidebar) {
    sidebar = document.createElement("aside");
    sidebar.className = "workflow-v2-sidebar";
    sidebar.setAttribute("aria-label", "ARCHICONCEPT 侧边导航");
    document.body.appendChild(sidebar);
  }
  sidebar.classList.toggle("is-expanded", workflowV2SidebarExpanded);
  sidebar.innerHTML = `
    <button type="button" class="workflow-v2-new-project">
      <span class="workflow-v2-new-project-icon" aria-hidden="true"></span>
      <span class="workflow-v2-nav-text">新建项目</span>
    </button>
    <div class="workflow-v2-side-section" aria-label="项目导航">
      ${WORKFLOW_V2_PRODUCT_NAV.primary
        .map(
          (item, index) => `
            <button type="button" ${
              item === WORKFLOW_V2_PRODUCT_NAV.activeSide ? 'aria-current="page"' : ""
            }>
              <span class="workflow-v2-side-icon" aria-hidden="true">${workflowV2SideIcon(
                index
              )}</span>
              <span>${escapeHtml(item)}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div class="workflow-v2-side-section workflow-v2-side-secondary" aria-label="项目设置">
      ${WORKFLOW_V2_PRODUCT_NAV.secondary
        .map(
          (item, index) => `
            <button type="button">
              <span class="workflow-v2-side-icon" aria-hidden="true">${workflowV2SideIcon(
                WORKFLOW_V2_PRODUCT_NAV.primary.length + index
              )}</span>
              <span>${escapeHtml(item)}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div class="workflow-v2-side-footer">
      <span>当前模块</span>
      <strong>概念方案</strong>
      <small>STEP ${step} / 6</small>
      <button type="button" class="workflow-v2-sidebar-toggle" aria-expanded="${
        workflowV2SidebarExpanded ? "true" : "false"
      }">
        <span aria-hidden="true">${workflowV2SidebarExpanded ? "‹" : "›"}</span>
        <span class="workflow-v2-nav-text">${
          workflowV2SidebarExpanded ? "收起" : "展开"
        }</span>
      </button>
    </div>
  `;
  sidebar
    .querySelector(".workflow-v2-sidebar-toggle")
    ?.addEventListener("click", () => {
      workflowV2SidebarExpanded = !workflowV2SidebarExpanded;
      renderProductShell(step);
    });
};

const cleanupProductShell = () => {
  document.body.classList.remove("workflow-v2-shell-active");
  document.body.classList.remove("workflow-v2-sidebar-expanded");
  document.querySelector(".workflow-v2-topnav")?.remove();
  document.querySelector(".workflow-v2-sidebar")?.remove();
  document
    .querySelector(".workflow-v2-legacy-topnav")
    ?.classList.remove("workflow-v2-legacy-topnav");
};

const renderWorkflowShell = () => {
  renameGlobalWorkflowLabels();
  if (!isWorkflowPage()) {
    document.querySelector(".workflow-v2-actionbar")?.remove();
    cleanupProductShell();
    return;
  }
  const chain = store.getState();
  const step = chain.currentStep || 1;
  const main = findWorkflowMain();
  if (!main) return;
  main.classList.add("workflow-v2-main");
  main.dataset.workflowV2Step = String(step);

  renderProductShell(step);
  updateTimeline(chain, step, main);
  renderStageHeader(chain, step, main);
  renameLegacyPage(step, main);
  renderStatusSummary(chain, step, main);
  renderActionBar(chain, step);
  bindTimelineNavigation(main);
};

let renderQueued = false;
const queueRender = () => {
  if (typeof document === "undefined") return;
  if (renderQueued) return;
  renderQueued = true;
  const schedule = globalThis.requestAnimationFrame || ((callback) => callback());
  schedule(() => {
    renderQueued = false;
    renderWorkflowShell();
  });
};

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const observer = new MutationObserver((mutations) => {
    const generatedSelectors =
      ".workflow-v2-stage-header, .workflow-v2-summary, .workflow-v2-actionbar, .workflow-v2-dialog-overlay, .workflow-v2-toast, .workflow-v2-topnav, .workflow-v2-sidebar";
    const onlyGeneratedMutations = mutations.every((mutation) => {
      const target =
        mutation.target?.nodeType === 1
          ? mutation.target
          : mutation.target?.parentElement;
      return target?.closest?.(generatedSelectors);
    });
    if (!onlyGeneratedMutations) queueRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  store.subscribe(queueRender);
  window.addEventListener("archiconcept:workflow-v2-render", queueRender);
  document.addEventListener("DOMContentLoaded", queueRender, { once: true });
  queueRender();
}

const workflowV2 = Object.freeze({
  steps: WORKFLOW_V2_STEPS,
  getStepConfig,
  getPackageForStep,
  deriveStepState,
  guardStepNavigation,
  getStepSummary,
  navigate,
  render: queueRender
});

globalThis.ARCHICONCEPT_WORKFLOW_V2 = workflowV2;

export {
  WORKFLOW_V2_PRODUCT_NAV,
  WORKFLOW_V2_STEPS,
  deriveStepState,
  getPackageForStep,
  getStepConfig,
  getStepSummary,
  guardStepNavigation,
  navigate,
  workflowV2
};
