export const PACKAGE_ORDER = [
  "boundaryAnchorPackage",
  "siteAnalysisPackage",
  "functionConstructPackage",
  "conceptStrategyPackage",
  "massingPlacementPackage",
  "finalConceptPackage"
];

const PACKAGE_STEP = Object.freeze({
  boundaryAnchorPackage: 1,
  siteAnalysisPackage: 2,
  functionConstructPackage: 3,
  conceptStrategyPackage: 4,
  massingPlacementPackage: 5,
  finalConceptPackage: 6
});

const now = () => new Date().toISOString();
const hasValue = (value) => value != null && String(value).trim() !== "";
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const toNumber = (value) => {
  if (!hasValue(value)) return null;
  const text = String(value).replace(/,/g, "").trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return Number.NaN;
  const number = Number(match[0]);
  if (/ha|公顷/i.test(text)) return number * 10000;
  return number;
};

export const splitRequirementItems = (value = "") => {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n、，,；;]+/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
};

const makePackage = (name) => ({
  packageName: name,
  step: PACKAGE_STEP[name],
  completionStatus: "empty",
  confidenceLevel: "low",
  blockingItems: [],
  assumptions: [],
  sourceTrace: {},
  downstreamHints: {},
  stale: false,
  staleReasons: [],
  revision: 0,
  createdAt: now(),
  updatedAt: now(),
  confirmedAt: null,
  data: {}
});

const makeInitialState = () => {
  const state = {
    schemaVersion: 1,
    projectId: `project-${Date.now()}`,
    currentStep: 1,
    createdAt: now(),
    updatedAt: now(),
    revision: 0,
    revisionHistory: [],
    metadata: {}
  };
  PACKAGE_ORDER.forEach((name) => {
    state[name] = makePackage(name);
  });
  return state;
};

let chainState = makeInitialState();
const subscribers = new Set();
const notify = () => subscribers.forEach((listener) => listener(chainState));

const mergeData = (target, patch) => {
  Object.entries(asObject(patch)).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      target[key] = { ...target[key], ...value };
    } else {
      target[key] = value;
    }
  });
  return target;
};

export const store = {
  getState() {
    return chainState;
  },
  setState(next) {
    chainState = { ...chainState, ...asObject(next), updatedAt: now() };
    notify();
    return chainState;
  },
  getPackage(name) {
    if (!chainState[name]) chainState[name] = makePackage(name);
    return chainState[name];
  },
  updatePackage(name, patch = {}) {
    const current = this.getPackage(name);
    const nextData = { ...current.data };
    if (patch.data) mergeData(nextData, patch.data);
    const next = {
      ...current,
      ...patch,
      data: nextData,
      revision: Number(current.revision || 0) + 1,
      updatedAt: now()
    };
    chainState = {
      ...chainState,
      [name]: next,
      updatedAt: now(),
      revision: Number(chainState.revision || 0) + 1
    };
    notify();
    return next;
  },
  confirmPackage(name) {
    return this.updatePackage(name, {
      completionStatus: "confirmed",
      confidenceLevel: "high",
      confirmedAt: now()
    });
  },
  setCurrentStep(step) {
    chainState = { ...chainState, currentStep: Number(step) || 1, updatedAt: now() };
    notify();
    return chainState.currentStep;
  },
  subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }
};

export const buildBoundaryValidation = (brief = {}) => {
  const blockingItems = [];
  const missingItems = [];
  const conflicts = [];
  const area = toNumber(brief.area || brief.siteArea);
  const redlineArea = toNumber(brief.buildableArea || brief.buildableBoundaryArea);
  if (!hasValue(brief.name || brief.projectName)) {
    blockingItems.push({ field: "projectName", label: "项目名称", impact: "无法建立项目身份与后续成果归属。", severity: "blocking" });
  }
  if (!hasValue(brief.type || brief.buildingType)) {
    blockingItems.push({ field: "buildingType", label: "建筑类型", impact: "无法匹配典型功能要求。", severity: "blocking" });
  }
  if ((!Number.isFinite(area) || area <= 0) && (!Number.isFinite(redlineArea) || redlineArea <= 0)) {
    blockingItems.push({ field: "siteAreaM2", label: "用地面积", impact: "无法进行容量和体量判断。", severity: "blocking" });
  }
  if (!hasValue(brief.gfa)) {
    missingItems.push({ field: "gfa", label: "总建筑面积", impact: "可能影响功能面积分配与体量推导。", severity: "warning" });
  }
  [["area", area, "用地面积"], ["gfa", toNumber(brief.gfa), "总建筑面积"]].forEach(([field, numeric, label]) => {
    if (numeric !== null && !Number.isFinite(numeric)) {
      conflicts.push({ field, label, message: `${label}不是有效数字。`, severity: "blocking" });
    }
  });
  return { blockingItems, missingItems, conflicts };
};

export const parseAreaProgram = (value = "", targetAreaM2 = 0) => {
  if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
  const text = String(value || "");
  if (!text.trim()) return [];
  return text
    .split(/\n+/)
    .map((line, index) => {
      const match = line.match(/(?:(\d)级[:：])?(.+?)[—-]\s*(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(?:㎡|m²|m2|%|平方米)?/i);
      if (!match) return null;
      const level = Number(match[1]) || 1;
      const quantity = Number(match[3]) || 1;
      const rawArea = Number(match[4]) || 0;
      const areaM2 = /%/.test(line) && targetAreaM2 ? (targetAreaM2 * rawArea) / 100 : rawArea * quantity;
      return { id: `program-${index + 1}`, level, parentId: null, name: match[2].trim(), quantity, unitAreaM2: areaM2 / quantity, areaM2, category: "required" };
    })
    .filter(Boolean);
};

export const serializeAreaProgram = (items = []) =>
  asArray(items)
    .map((item) => `${Number(item.level) || 1}级：${item.name} — ${Number(item.quantity) || 1}×${Number(item.unitAreaM2 || item.areaM2 || 0)}㎡`)
    .join("\n");

export const calculateAreaProgramItems = (items = []) =>
  asArray(items).map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitAreaM2 = Number(item.unitAreaM2) || (Number(item.areaM2) ? Number(item.areaM2) / quantity : 0);
    return { id: item.id || `program-${index + 1}`, level: Math.min(3, Math.max(1, Number(item.level) || 1)), parentId: item.parentId || null, name: item.name || "", quantity, unitAreaM2, areaM2: Number(item.areaM2) || quantity * unitAreaM2, category: item.category || "required" };
  });

export const buildAreaProgramModel = (value = "", targetAreaM2 = 0) => {
  const items = calculateAreaProgramItems(parseAreaProgram(value, targetAreaM2));
  return { targetGfaM2: Number(targetAreaM2) || null, items, allocatedAreaM2: items.filter((item) => !item.parentId).reduce((sum, item) => sum + Number(item.areaM2 || 0), 0), legacyText: typeof value === "string" ? value : serializeAreaProgram(items) };
};

export const buildBubbleGraph = (functionTree = []) => ({
  nodes: asArray(functionTree).map((item) => ({ id: item.id, label: item.name, level: item.level, size: Math.max(24, Math.sqrt(Number(item.areaM2 || 0)) || 24) })),
  links: asArray(functionTree).filter((item) => item.parentId).map((item) => ({ source: item.parentId, target: item.id, type: "contains" }))
});

export const detectFunctionConflicts = (data = {}) => {
  const conflicts = [];
  const target = Number(data.areaAllocation?.targetGfaM2) || 0;
  const allocated = Number(data.areaAllocation?.allocatedM2) || 0;
  if (target && allocated > target * 1.05) {
    conflicts.push({ id: "area-overflow", type: "area", severity: "blocking", title: "功能面积超过总建筑面积", message: `已分配 ${Math.round(allocated)}㎡，超过目标 ${Math.round(target)}㎡。` });
  }
  return conflicts;
};

export const validateFunctionConstructData = (data = {}) => {
  const conflicts = detectFunctionConflicts(data);
  const blockingItems = conflicts.filter((item) => item.severity === "blocking");
  const hasPrimaryFunction = asArray(data.functionTree).some((item) => Number(item.level) === 1);
  if (!hasPrimaryFunction) {
    blockingItems.push({ field: "functionTree", label: "一级功能", impact: "缺少一级功能，无法生成方案策略。", severity: "blocking" });
  }
  return { blockingItems, warningItems: conflicts.filter((item) => item.severity !== "blocking"), completionStatus: blockingItems.length ? "partial" : "ready" };
};

export const createInitialFunctionConstructData = (boundaryPackage = {}) => {
  const boundary = boundaryPackage.data || {};
  const targetGfaM2 = toNumber(boundary.hardControls?.grossFloorAreaM2) || toNumber(boundary.hardControls?.siteAreaM2) || 10000;
  const areaItems = calculateAreaProgramItems(boundary.areaProgram?.items || []);
  const functionTree = areaItems.length ? areaItems : [
    { id: "function-1", level: 1, name: "主要功能", areaM2: Math.round(targetGfaM2 * 0.7), category: "required" },
    { id: "function-2", level: 1, name: "配套服务", areaM2: Math.round(targetGfaM2 * 0.2), category: "support" },
    { id: "function-3", level: 1, name: "交通与设备", areaM2: Math.round(targetGfaM2 * 0.1), category: "support" }
  ];
  const allocatedM2 = functionTree.filter((item) => !item.parentId).reduce((sum, item) => sum + Number(item.areaM2 || 0), 0);
  return { functionTree, areaAllocation: { targetGfaM2, allocatedM2, unallocatedM2: targetGfaM2 - allocatedM2, source: boundary.hardControls?.grossFloorAreaM2 ? "boundaryAnchor.grossFloorAreaM2" : "systemEstimate" }, functionAttributes: {}, relationshipGraph: { edges: [] }, bubbleGraph: buildBubbleGraph(functionTree), circulationSystem: { publicFlow: "independent", internalFlow: "controlled", serviceFlow: "independent", publicServiceSeparated: true, cleanDirtySeparated: true }, conflicts: [] };
};

export const createInitialConceptStrategyData = (state = store.getState()) => {
  const boundary = state.boundaryAnchorPackage?.data || {};
  const functionData = state.functionConstructPackage?.data || {};
  const title = boundary.projectIdentity?.projectName || "概念方案";
  const coreProblems = [
    { id: "problem-1", title: "场地边界与功能组织需要协同", priority: "P0", evidence: [{ source: "设计边界", text: "项目基本信息和场地条件共同影响方案落位。" }] },
    { id: "problem-2", title: "功能面积需要与总体规模校核", priority: "P1", evidence: [{ source: "功能与空间", text: `当前功能项 ${functionData.functionTree?.length || 0} 项。` }] }
  ];
  const designStrategies = [
    { id: "strategy-1", title: "以场地边界控制体量落位", problemIds: ["problem-1"], description: "优先稳定红线、入口和主要开放面。" },
    { id: "strategy-2", title: "以功能分级组织空间", problemIds: ["problem-2"], description: "按主要功能、配套功能和交通设备建立空间层级。" }
  ];
  return { conceptName: title, coreProblems, designStrategies, strategyBindings: [], problemEvidence: [] };
};

export const validateConceptStrategyData = (data = {}) => ({
  blockingItems: [],
  warningItems: data.coreProblems?.length ? [] : [{ label: "核心问题", impact: "尚未生成核心问题。" }],
  completionStatus: data.coreProblems?.length && data.designStrategies?.length ? "ready" : "partial"
});

export const buildDesignConstraintTable = (data = {}) => {
  const identity = data.projectIdentity || {};
  const controls = data.hardControls || {};
  const rows = [
    ["type", "建筑类型", identity.buildingType, "项目基本信息", "A"],
    ["location", "建设地点", identity.location, "项目基本信息", "A"],
    ["area", "用地面积", controls.siteAreaM2, "建设规模", "A"],
    ["gfa", "总建筑面积", controls.grossFloorAreaM2, "建设规模", "A"]
  ];
  return rows.map(([key, label, value, category, section]) => ({ key, field: key, category, label, currentValue: hasValue(value) ? value : `未填写${label}`, condition: hasValue(value) ? value : `未填写${label}`, source: "用户输入", status: hasValue(value) ? "已确认" : "待补充", statusCode: hasValue(value) ? "confirmed" : "missing", issue: hasValue(value) ? "" : `未填写${label}`, action: hasValue(value) ? "无" : `补充${label}`, impact: "后续设计判断", targetField: key, targetSection: section }));
};

export const deriveSiteInsights = (site = {}) => ({ siteLimits: asArray(site.siteLimits), siteOpportunities: asArray(site.siteOpportunities), designImpactHints: asArray(site.designImpactHints) });
export const isGenericConcept = (value = "") => /概念|方案|设计$/.test(String(value || "").trim());


export const createProjectDataChain = (overrides = {}) => {
  const state = makeInitialState();
  Object.entries(asObject(overrides)).forEach(([key, value]) => {
    if (PACKAGE_ORDER.includes(key)) {
      state[key] = { ...state[key], ...asObject(value), data: asObject(value.data) };
    } else {
      state[key] = value;
    }
  });
  return state;
};

const DATA_CHAIN_STORAGE_KEY = "archiconcept:project-data-chain:v1";
const DOWNSTREAM_PACKAGES = Object.freeze({
  boundaryAnchorPackage: ["functionConstructPackage", "conceptStrategyPackage", "massingPlacementPackage", "finalConceptPackage"],
  siteAnalysisPackage: ["conceptStrategyPackage", "massingPlacementPackage", "finalConceptPackage"],
  functionConstructPackage: ["conceptStrategyPackage", "massingPlacementPackage", "finalConceptPackage"],
  conceptStrategyPackage: ["massingPlacementPackage", "finalConceptPackage"],
  massingPlacementPackage: ["finalConceptPackage"],
  finalConceptPackage: []
});

export class ProjectDataChainStore {
  constructor(options = {}) {
    this.storage = options.storage || globalThis.localStorage || null;
    this.listeners = new Set();
    const stored = this.storage?.getItem?.(DATA_CHAIN_STORAGE_KEY);
    try {
      this.state = stored ? JSON.parse(stored) : createProjectDataChain(options.initialState || {});
    } catch {
      this.state = createProjectDataChain(options.initialState || {});
    }
  }

  persist() {
    this.storage?.setItem?.(DATA_CHAIN_STORAGE_KEY, JSON.stringify(this.state));
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  getState() {
    return this.state;
  }

  getPackage(name) {
    if (!this.state[name]) this.state[name] = makePackage(name);
    return this.state[name];
  }

  updatePackage(name, patch = {}, meta = {}) {
    const current = this.getPackage(name);
    const data = { ...current.data };
    if (patch.data) mergeData(data, patch.data);
    const sourceTrace = { ...(current.sourceTrace || {}) };
    (meta.changedFields || []).forEach((field) => {
      sourceTrace[field] = { source: meta.source || "manualEdit", updatedAt: now(), reason: meta.reason || "" };
    });
    const next = { ...current, ...patch, data, sourceTrace, revision: Number(current.revision || 0) + 1, updatedAt: now() };
    this.state[name] = next;
    this.state.revision = Number(this.state.revision || 0) + 1;
    this.state.updatedAt = now();
    if (meta.invalidateDownstream !== false) {
      (DOWNSTREAM_PACKAGES[name] || []).forEach((packageName) => {
        this.state[packageName] = { ...this.getPackage(packageName), stale: true, staleReasons: [meta.reason || `${name} changed`] };
      });
    }
    this.persist();
    this.notify();
    return next;
  }

  confirmPackage(name, patch = {}, meta = {}) {
    return this.updatePackage(name, { ...patch, completionStatus: "confirmed", confirmedAt: now() }, { ...meta, invalidateDownstream: false });
  }

  setCurrentStep(step) {
    this.state.currentStep = Number(step) || 1;
    this.persist();
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const migrateLegacyProject = (legacy = {}, context = {}) => {
  const projectData = legacy.projectData || legacy || {};
  const site = legacy.siteIntelligencePackage || projectData.siteIntelligencePackage || {};
  const chain = createProjectDataChain({ projectId: projectData.projectId || "legacy-project" });
  const validation = buildBoundaryValidation(projectData);
  chain.boundaryAnchorPackage = {
    ...chain.boundaryAnchorPackage,
    completionStatus: validation.blockingItems.length ? "partial" : "ready",
    confidenceLevel: validation.blockingItems.length ? "medium" : "high",
    blockingItems: validation.blockingItems,
    data: {
      projectIdentity: { projectName: projectData.name || projectData.projectName || "", buildingType: projectData.type || projectData.buildingType || "", location: projectData.location || "" },
      hardControls: { siteAreaM2: projectData.area || projectData.siteArea || "", grossFloorAreaM2: projectData.gfa || "" },
      functionRequirements: { program: projectData.needs || projectData.program || "", programItems: splitRequirementItems(projectData.needs || projectData.program || "") },
      areaProgram: buildAreaProgramModel(projectData.areaProgram || "", toNumber(projectData.gfa))
    },
    sourceTrace: { projectIdentity: { source: context.source || "legacyMigration", updatedAt: now() } }
  };
  if (site.location || site.boundary) {
    chain.siteAnalysisPackage = {
      ...chain.siteAnalysisPackage,
      completionStatus: site.boundary?.status || site.location ? "confirmed" : "partial",
      confidenceLevel: "high",
      data: { siteLocation: site.location || {}, redline: site.boundary || {} }
    };
  }
  return chain;
};
export const ARCHICONCEPT_DATA_CHAIN = Object.freeze({ schemaVersion: 1, store, buildBoundaryValidation, buildDesignConstraintTable, calculateAreaProgramItems, parseAreaProgram, serializeAreaProgram, splitRequirementItems, createInitialFunctionConstructData, validateFunctionConstructData, createInitialConceptStrategyData, validateConceptStrategyData });

globalThis.ARCHICONCEPT_DATA_CHAIN = ARCHICONCEPT_DATA_CHAIN;



