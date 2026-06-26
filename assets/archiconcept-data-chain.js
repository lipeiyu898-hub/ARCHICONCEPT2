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
const sumArea = (items = []) =>
  asArray(items).reduce((sum, item) => sum + (Number(item.areaM2) || 0), 0);
const rootItems = (items = []) =>
  asArray(items).filter(
    (item) => !item.parentId || !items.some((parent) => parent.id === item.parentId)
  );
const normDecisionLabel = (id) => {
  if (/fire/.test(id)) return "防火与消防约束";
  if (/industrial|service/.test(id)) return "工业服务约束";
  if (/access/.test(id)) return "无障碍与公共可达约束";
  return "规范约束";
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
  if (!hasValue(brief.needs || brief.program || brief.functionRequirements?.program)) {
    blockingItems.push({ field: "program", label: "功能需求", impact: "无法建立功能构成与空间意图。", severity: "blocking" });
  }
  if (!hasValue(brief.gfa)) {
    missingItems.push({ field: "gfa", label: "总建筑面积", impact: "可能影响功能面积分配与体量推导。", severity: "warning" });
  }
  [["area", area, "用地面积"], ["gfa", toNumber(brief.gfa), "总建筑面积"]].forEach(([field, numeric, label]) => {
    if (numeric !== null && !Number.isFinite(numeric)) {
      conflicts.push({ field, label, message: `${label}不是有效数字。`, severity: "blocking" });
    }
  });
  ["density", "greenRate"].forEach((field) => {
    const numeric = toNumber(brief[field]);
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0 || numeric > 100)) {
      conflicts.push({ field, label: field === "density" ? "建筑密度" : "绿地率", message: "百分比指标应在 0-100 之间。", severity: "blocking" });
    }
  });
  return { blockingItems, missingItems, conflicts };
};

export const parseAreaProgram = (value = "", targetAreaM2 = 0) => {
  if (value && typeof value === "object" && Array.isArray(value.items)) return calculateAreaProgramItems(value.items);
  const text = String(value || "");
  if (!text.trim()) return [];
  const structured = [];
  const sectionPattern = /(?:（?\s*([一二三四五六七八九十\d]+)\s*[）.)、]?\s*)?([^，；。\n:：]+?)(?:[:：])?\s*约?\s*(\d+(?:\.\d+)?)\s*(?:[—\-–~～至到]\s*(\d+(?:\.\d+)?))?\s*(?:㎡|m²|m2|平方米|銕)/g;
  const sections = [...text.matchAll(sectionPattern)];
  let lastParent = null;
  let lastEnd = 0;
  sections.forEach((match) => {
    const prefix = text.slice(lastEnd, match.index);
    if (/[；;]/.test(prefix)) lastParent = null;
    const isChild = Boolean(lastParent && (/其中|包括/.test(prefix) || !/[；。]/.test(prefix)));
    const areaM2 = match[4] ? (Number(match[3]) + Number(match[4])) / 2 : Number(match[3]);
    const item = {
      id: `program-${structured.length + 1}`,
      level: isChild ? 2 : 1,
      parentId: isChild ? lastParent.id : null,
      name: match[2].replace(/包括|其中/g, "").trim(),
      quantity: 1,
      unitAreaM2: areaM2,
      areaM2,
      category: "required"
    };
    if (item.name && !/合计|小计/.test(item.name)) structured.push(item);
    if (!isChild) lastParent = item;
    lastEnd = match.index + match[0].length;
  });
  if (structured.length) return calculateAreaProgramItems(structured);
  return calculateAreaProgramItems(text
    .split(/\n+/)
    .map((line, index) => {
      const match = line.match(/(?:(\d)级[:：｜|])?(.+?)[—\-｜|]\s*(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(?:㎡|m²|m2|%|平方米)?/i);
      if (!match) return null;
      const level = Number(match[1]) || 1;
      const quantity = Number(match[3]) || 1;
      const rawArea = Number(match[4]) || 0;
      const areaM2 = /%/.test(line) && targetAreaM2 ? (targetAreaM2 * rawArea) / 100 : rawArea * quantity;
      return { id: `program-${index + 1}`, level, parentId: null, name: match[2].trim(), quantity, unitAreaM2: areaM2 / quantity, areaM2, category: "required" };
    })
    .filter(Boolean));
};

export const serializeAreaProgram = (items = []) =>
  calculateAreaProgramItems(items)
    .sort((a, b) => {
      if (a.parentId === b.id) return 1;
      if (b.parentId === a.id) return -1;
      const aRoot = a.parentId || a.id;
      const bRoot = b.parentId || b.id;
      if (aRoot === bRoot) return Number(a.level || 1) - Number(b.level || 1);
      return asArray(items).findIndex((item) => item.id === aRoot) - asArray(items).findIndex((item) => item.id === bRoot);
    })
    .map((item) => `${Number(item.level) || 1}级｜${item.name}｜${Number(item.quantity) || 1}×${Number(item.unitAreaM2 || item.areaM2 || 0)}㎡`)
    .join("\n");

export const calculateAreaProgramItems = (items = []) =>
  {
    const normalized = asArray(items).map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitAreaM2 = Number(item.unitAreaM2) || (Number(item.areaM2) ? Number(item.areaM2) / quantity : 0);
    return { id: item.id || `program-${index + 1}`, level: Math.min(3, Math.max(1, Number(item.level) || 1)), parentId: item.parentId || null, name: item.name || "", quantity, unitAreaM2, areaM2: Number(item.areaM2) || quantity * unitAreaM2, category: item.category || "required" };
  });
    const flatRoots = normalized.every((item) => Number(item.level) === 1 && !item.parentId);
    if (flatRoots) {
      for (let index = 0; index < normalized.length; index += 1) {
        const parent = normalized[index];
        if (parent.parentId || Number(parent.areaM2) <= 0) continue;
        let total = 0;
        const childIndexes = [];
        for (let cursor = index + 1; cursor < normalized.length; cursor += 1) {
          total += Number(normalized[cursor].areaM2) || 0;
          childIndexes.push(cursor);
          if (Math.abs(total - Number(parent.areaM2)) < 0.001) {
            childIndexes.forEach((childIndex) => {
              normalized[childIndex].level = 2;
              normalized[childIndex].parentId = parent.id;
            });
            index = childIndexes[childIndexes.length - 1];
            break;
          }
          if (total > Number(parent.areaM2)) break;
        }
      }
    }
    normalized.forEach((item) => {
      const children = normalized.filter((child) => child.parentId === item.id);
      if (!children.length) return;
      item.childAreaM2 = sumArea(children);
      item.areaDifferenceM2 = item.childAreaM2 - (Number(item.areaM2) || 0);
    });
    return normalized;
  };

export const buildAreaProgramModel = (value = "", targetAreaM2 = 0) => {
  const items = calculateAreaProgramItems(parseAreaProgram(value, targetAreaM2));
  return { targetGfaM2: Number(targetAreaM2) || null, items, allocatedAreaM2: sumArea(rootItems(items)), legacyText: typeof value === "string" ? value : serializeAreaProgram(items) };
};

export const buildBubbleGraph = (functionTree = []) => {
  const items = asArray(functionTree);
  const roots = rootItems(items);
  const radius = 34;
  const rootPositions = Object.fromEntries(
    roots.map((item, index) => {
      const angle = roots.length ? (Math.PI * 2 * index) / roots.length - Math.PI / 2 : 0;
      return [item.id, { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }];
    })
  );
  const nodes = items.map((item, index) => {
    const parent = items.find((candidate) => candidate.id === item.parentId);
    const base = parent ? rootPositions[parent.id] || { x: 50, y: 50 } : rootPositions[item.id] || { x: 50, y: 50 };
    const siblingIndex = parent
      ? items.filter((candidate) => candidate.parentId === parent.id).findIndex((candidate) => candidate.id === item.id)
      : 0;
    const angle = parent ? (Math.PI * 2 * siblingIndex) / Math.max(1, items.filter((candidate) => candidate.parentId === parent.id).length) : 0;
    return {
      id: item.id,
      label: item.name,
      level: item.level,
      x: Number((parent ? base.x + Math.cos(angle) * 13 : base.x).toFixed(2)),
      y: Number((parent ? base.y + Math.sin(angle) * 13 : base.y).toFixed(2)),
      size: Math.max(16, Math.min(42, Math.sqrt(Number(item.areaM2 || 0)) || 24)),
      order: index
    };
  });
  const hierarchyEdges = items
    .filter((item) => item.parentId)
    .map((item) => ({ source: item.parentId, target: item.id, type: "contains" }));
  return { nodes, links: hierarchyEdges, hierarchyEdges };
};

export const detectFunctionConflicts = (data = {}) => {
  const conflicts = [];
  const target = Number(data.areaAllocation?.targetGfaM2) || 0;
  const allocated = sumArea(rootItems(data.functionTree || [])) || Number(data.areaAllocation?.allocatedM2) || 0;
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
  if (!data.circulationSystem?.coreDecisionConfirmed) {
    blockingItems.push({ field: "circulationSystem", label: "核心动线判断", impact: "进入策略匹配前需要确认公共、内部与后勤流线关系。", severity: "blocking" });
  }
  return { blockingItems, warningItems: conflicts.filter((item) => item.severity !== "blocking"), completionStatus: blockingItems.length ? "partial" : "ready" };
};

export const createInitialFunctionConstructData = (boundaryPackage = {}) => {
  const boundary = boundaryPackage.data || {};
  const targetGfaM2 = toNumber(boundary.hardControls?.grossFloorAreaM2) || toNumber(boundary.hardControls?.siteAreaM2) || 10000;
  const areaItems = calculateAreaProgramItems(boundary.areaProgram?.items || []);
  const programItems = splitRequirementItems(boundary.functionRequirements?.program || "");
  const generated = [
    ...(programItems.length ? programItems : ["主要功能", "公共活动", "配套服务"]).slice(0, 4),
    "交通联系",
    "设备后勤"
  ].slice(0, 6);
  while (generated.length < 6) generated.push(`弹性功能 ${generated.length + 1}`);
  const functionTree = areaItems.length
    ? areaItems
    : generated.map((name, index) => ({
        id: `function-${index + 1}`,
        level: 1,
        parentId: null,
        name,
        areaM2: Math.round(targetGfaM2 * ([0.28, 0.2, 0.16, 0.12, 0.14, 0.1][index] || 0.1)),
        category: index < 3 ? "required" : "support"
      }));
  const allocatedM2 = sumArea(rootItems(functionTree));
  const functionAttributes = Object.fromEntries(
    functionTree.map((item, index) => [
      item.id,
      {
        publicity: index <= 1 ? "public" : "semiPublic",
        privacy: index <= 1 ? "low" : "medium",
        daylight: index <= 3 ? "preferred" : "optional",
        floorHeight: index === 0 ? "high" : "standard",
        noise: /设备|后勤|机房/.test(item.name) ? "high" : "medium",
        load: /设备|数据|机房/.test(item.name) ? "high" : "standard",
        cleanliness: /后勤|设备/.test(item.name) ? "dirty" : "general"
      }
    ])
  );
  const normDerivedConstraints = Object.entries(asObject(boundary.normConstraintDecisions)).map(([id, decision]) => ({
    id,
    label: normDecisionLabel(id),
    value: decision.value || decision.text || "",
    status: decision.status || "pending",
    source: decision.source || "normConstraint"
  }));
  const organizationPrinciples = normDerivedConstraints
    .map((item) => item.value)
    .filter(Boolean);
  return {
    functionTree,
    areaAllocation: { targetGfaM2, allocatedM2, unallocatedM2: targetGfaM2 - allocatedM2, source: boundary.hardControls?.grossFloorAreaM2 ? "boundaryAnchor.grossFloorAreaM2" : "systemEstimate" },
    functionAttributes,
    relationshipGraph: { edges: [] },
    bubbleGraph: buildBubbleGraph(functionTree),
    circulationSystem: { publicFlow: "independent", internalFlow: "controlled", serviceFlow: "independent", publicServiceSeparated: true, cleanDirtySeparated: true, coreDecisionConfirmed: false },
    conflicts: [],
    organizationPrinciples,
    normDerivedConstraints
  };
};

export const recommendNormConstraints = (buildingType = "", context = {}) => {
  const typeText = String(buildingType || "");
  const contextText = [
    context.needs,
    context.program,
    context.users,
    context.targetUsers,
    context.functionRequirements?.program,
    context.functionRequirements?.targetUsers
  ].filter(Boolean).join(" ");
  if (!typeText.trim() && !contextText.trim()) return [];
  const isIndustrial = /工业|基础设施|数据|机房|industrial|infrastructure/i.test(`${typeText} ${contextText}`);
  const hasPublic = /公共|公众|市民|游客|展示|文化|教育|学校|public|visitor/i.test(`${typeText} ${contextText}`);
  const hasUndergroundOrEquipment = /地下|机房|设备|数据中心|冷却/i.test(contextText);
  const norms = [
    {
      id: "gb55037",
      name: "建筑防火通用规范",
      priority: hasUndergroundOrEquipment ? "重点关注" : "常规关注",
      matchStatus: "系统匹配",
      triggerReason: hasUndergroundOrEquipment ? "出现地下、机房或设备空间，需要提前校核防火与消防扑救条件。" : "建筑方案需满足基本防火约束。",
      downstreamImpact: "影响功能建构、疏散组织、消防车道和体量退让。",
      verificationItems: ["消防扑救面", "疏散距离", "防火分区"]
    },
    {
      id: "gb55019",
      name: "建筑与市政工程无障碍通用规范",
      priority: hasPublic ? "重点关注" : "常规关注",
      matchStatus: "系统匹配",
      triggerReason: hasPublic ? "包含公众、公共或游客使用场景。" : "公共可达性仍需在入口组织中校核。",
      downstreamImpact: "影响入口组织、公共界面和垂直交通。",
      verificationItems: ["无障碍入口", "连续通行路径", "无障碍设施"]
    },
    {
      id: "gb55031",
      name: "民用建筑通用规范",
      priority: "常规关注",
      matchStatus: "系统匹配",
      triggerReason: "项目进入建筑概念阶段，需要建立基本空间和安全底线。",
      downstreamImpact: "影响功能建构、空间尺度和安全疏散。",
      verificationItems: ["空间尺度", "安全出口", "使用安全"]
    },
    {
      id: "green-building",
      name: "绿色建筑评价相关要求",
      priority: "常规关注",
      matchStatus: "系统匹配",
      triggerReason: "前期概念需预留采光、通风、节能和场地生态策略。",
      downstreamImpact: "影响场地布局、界面朝向和空间意图。",
      verificationItems: ["自然采光", "通风组织", "节能策略"]
    }
  ];
  if (isIndustrial) {
    norms.unshift({
      id: "industrial",
      name: "工业与基础设施专项提醒",
      priority: "重点关注",
      matchStatus: "系统匹配",
      triggerReason: "建筑类型或功能包含工业、基础设施、数据中心或设备机房。",
      downstreamImpact: "影响功能建构、设备流线、吊装维护和公共安全隔离。",
      verificationItems: ["设备运维流线", "吊装检修条件", "公众与后勤隔离"]
    });
  }
  return norms;
};

export const resolveNormDesignConstraints = (data = {}) => {
  const type = data.projectIdentity?.buildingType || data.buildingType || "";
  const context = {
    needs: data.functionRequirements?.program || data.needs || data.program || "",
    users: data.functionRequirements?.targetUsers || data.users || data.targetUsers || ""
  };
  const norms = recommendNormConstraints(type, context);
  if (!norms.length) return [];
  const constraints = [
    {
      id: "fire-access",
      normId: "gb55037",
      label: "消防扑救条件",
      text: "预留可贯通消防车道及扑救面。",
      impact: "场地道路和建筑退让",
      target: "site",
      status: "pending",
      options: ["沿主要道路组织消防扑救面", "在红线内预留环通或尽端回车条件"],
      impactAreas: ["场地交通", "建筑退让"]
    },
    {
      id: "fire-zoning",
      normId: "gb55037",
      label: "防火分区与流线",
      text: "公众、后勤与设备空间独立分区。",
      impact: "功能分区和疏散组织",
      target: "function",
      status: "pending",
      options: ["按公共、后勤、设备建立分区", "将疏散核心与大人流空间联动"],
      impactAreas: ["功能建构", "动线体系"]
    }
  ];
  if (norms.some((item) => item.id === "industrial")) {
    constraints.push({
      id: "industrial-service",
      normId: "industrial",
      label: "设备运维与吊装组织",
      text: "设备运维、吊装与公众流线独立组织。",
      impact: "后勤流线、设备界面和体量开口",
      target: "function",
      status: "pending",
      options: ["设置独立后勤入口", "预留设备吊装和检修面"],
      impactAreas: ["功能建构", "后勤流线"]
    });
  }
  if (norms.some((item) => item.id === "gb55019" && item.priority === "重点关注")) {
    constraints.push({
      id: "accessibility-entry",
      normId: "gb55019",
      label: "公共入口无障碍连续性",
      text: "公共入口、开放界面和主要活动空间保持无障碍连续。",
      impact: "入口组织和公共界面",
      target: "site",
      status: "pending",
      options: ["将无障碍路径接入主要公共入口", "入口高差与开放空间同步处理"],
      impactAreas: ["入口组织", "公共界面"]
    });
  }
  return constraints;
};

export const estimateNormDesignConstraint = (constraintId, data = {}) => {
  const constraint = resolveNormDesignConstraints(data).find((item) => item.id === constraintId);
  if (!constraint) return null;
  return {
    ...constraint,
    value: constraint.text,
    status: "systemEstimated",
    source: "systemInference"
  };
};

export const deriveNormDownstreamEffects = (data = {}) => {
  const effects = { site: [], function: [], concept: [] };
  Object.entries(asObject(data.normConstraintDecisions)).forEach(([id, decision]) => {
    const base = estimateNormDesignConstraint(id, data) || { id, label: normDecisionLabel(id), target: /access|site/.test(id) ? "site" : "function" };
    const item = {
      id,
      label: base.label,
      text: decision.value || decision.text || base.text || "",
      value: decision.value || decision.text || base.text || "",
      status: decision.status || base.status || "pending",
      source: decision.source || base.source || "normConstraint",
      impact: base.impact || "后续设计判断"
    };
    const target = base.target === "site" ? "site" : base.target === "concept" ? "concept" : "function";
    effects[target].push(item);
  });
  return effects;
};

export const createInitialConceptStrategyData = (state = store.getState()) => {
  const boundary = state.boundaryAnchorPackage?.data || {};
  const site = state.siteAnalysisPackage?.data || {};
  const functionData = state.functionConstructPackage?.data || {};
  const title = boundary.projectIdentity?.projectName || "概念方案";
  const normEffects = deriveNormDownstreamEffects(boundary);
  const normEvidence = [...normEffects.site, ...normEffects.function, ...asArray(functionData.normDerivedConstraints)];
  const coreProblems = [
    {
      id: "problem-1",
      title: "场地边界与功能组织需要协同",
      category: "场地限制",
      priority: "P0",
      description: "场地限制、开放界面与主要功能组织需要形成同一套落位逻辑。",
      confirmed: true,
      evidence: [
        { source: "siteAnalysis", label: "场地限制", detail: asArray(site.siteLimits)[0] || "项目基本信息和场地条件共同影响方案落位。" }
      ]
    },
    {
      id: "problem-2",
      title: "功能面积需要与总体规模校核",
      category: "功能建构",
      priority: "P1",
      description: "功能分区、面积配比和核心动线需要在进入体量前稳定。",
      confirmed: true,
      evidence: [
        { source: "functionConstruct", label: "功能构成", detail: `当前功能项 ${functionData.functionTree?.length || 0} 项。` }
      ]
    },
    {
      id: "problem-3",
      title: "公共界面需要回应项目目标",
      category: "空间意图",
      priority: "P1",
      description: "概念策略需要把使用人群、开放界面和空间体验转化为可操作的设计动作。",
      confirmed: true,
      evidence: [
        { source: "boundaryAnchor", label: "目标人群", detail: boundary.functionRequirements?.targetUsers || boundary.functionRequirements?.program || "项目任务书提出公共使用目标。" }
      ]
    }
  ];
  if (normEvidence.length) {
    const first = normEvidence[0];
    coreProblems.push({
      id: "problem-norm-1",
      title: "规范约束需要前置转译为空间策略",
      category: "规范约束",
      priority: "P0",
      description: normEvidence.map((item) => item.value || item.text).filter(Boolean).join("；"),
      confirmed: true,
      evidence: [
        { source: "normConstraint", label: first.label || normDecisionLabel(first.id), detail: first.value || first.text || "" }
      ]
    });
  }
  const designStrategies = coreProblems.map((problem, index) => ({
    id: `strategy-${index + 1}`,
    title: ["以场地边界控制体量落位", "以功能分级组织空间", "以公共界面组织空间体验", "以前置规范约束校准方案底线"][index] || `回应${problem.title}`,
    problemIds: [problem.id],
    description: ["优先稳定红线、入口和主要开放面。", "按主要功能、配套功能和交通设备建立空间层级。", "把目标人群、开放界面和主要流线组织成明确的空间意图。", "将规范条件转译为场地、功能和动线控制线。"][index] || "形成可验证的设计动作。",
    impactAreas: ["总平面", "功能建构"],
    confirmed: true
  }));
  const strategyBindings = designStrategies.flatMap((strategy) =>
    strategy.problemIds.map((problemId) => ({ id: `binding-${strategy.id}-${problemId}`, problemId, strategyId: strategy.id }))
  );
  return {
    conceptName: title,
    conceptStatement: "",
    conceptNarrative: "",
    coreProblems,
    designStrategies,
    strategyBindings,
    problemEvidence: coreProblems.flatMap((problem) => problem.evidence.map((evidence) => ({ ...evidence, problemId: problem.id }))),
    conceptCandidates: [
      { id: "concept-a", name: "边界协同", statement: "以场地边界、功能分级和公共界面建立概念主线。" }
    ],
    selectedConceptId: "concept-a"
  };
};

export const validateConceptStrategyData = (data = {}) => {
  const blockingItems = [];
  const confirmedProblems = asArray(data.coreProblems).filter((item) => item.confirmed !== false);
  const activeStrategies = asArray(data.designStrategies).filter((item) => item.confirmed !== false);
  confirmedProblems.forEach((problem) => {
    const bound = activeStrategies.some((strategy) => asArray(strategy.problemIds).includes(problem.id));
    if (!bound) {
      blockingItems.push({ field: `strategyBinding.${problem.id}`, label: "策略绑定", impact: `核心问题「${problem.title}」尚未绑定设计策略。`, severity: "blocking" });
    }
  });
  const warningItems = confirmedProblems.length ? [] : [{ label: "核心问题", impact: "尚未生成核心问题。" }];
  return {
    blockingItems,
    warningItems,
    completionStatus: blockingItems.length ? "partial" : confirmedProblems.length && activeStrategies.length ? "ready" : "partial"
  };
};

export const buildDesignConstraintTable = (data = {}) => {
  const identity = data.projectIdentity || {};
  const controls = data.hardControls || {};
  const requirements = data.functionRequirements || {};
  const rows = [
    ["type", "建筑类型", identity.buildingType, "项目基本信息", "A", "影响规范匹配和功能建构"],
    ["location", "建设地点", identity.location, "项目基本信息", "A", "影响场地判断"],
    ["area", "用地面积", controls.siteAreaM2, "建设规模", "A", "影响容量和场地布局"],
    ["gfa", "总建筑面积", controls.grossFloorAreaM2, "建设规模", "A", "影响功能建构和体量推导"],
    ["far", "容积率", controls.floorAreaRatio, "建设规模", "A", "影响容量校核"],
    ["density", "建筑密度", controls.buildingDensity, "建设规模", "A", "影响场地覆盖率和开放空间"],
    ["height", "高度控制", controls.heightLimitM, "建设规模", "A", "影响体量轮廓和退界关系"],
    ["program", "功能构成", requirements.program, "功能需求", "C", "影响功能建构"],
    ["targetUsers", "使用人群", requirements.targetUsers, "功能需求", "C", "影响空间意图和公共界面"]
  ].map(([key, label, value, category, section, impact]) => ({
    key,
    field: key,
    category,
    label,
    currentValue: hasValue(value) ? value : `未填写${label}`,
    condition: hasValue(value) ? value : `未填写${label}`,
    source: "用户输入",
    status: hasValue(value) ? "已确认" : "待补充",
    statusCode: hasValue(value) ? "confirmed" : "missing",
    issue: hasValue(value) ? "" : `未填写${label}`,
    action: hasValue(value) ? "无" : `补充${label}`,
    impact,
    targetField: key,
    targetSection: section
  }));
  const area = toNumber(controls.siteAreaM2);
  const gfa = toNumber(controls.grossFloorAreaM2);
  const far = toNumber(controls.floorAreaRatio);
  if (Number.isFinite(area) && Number.isFinite(gfa) && Number.isFinite(far)) {
    const expectedGfa = area * far;
    if (Math.abs(expectedGfa - gfa) > Math.max(1, expectedGfa * 0.01)) {
      ["gfa", "far"].forEach((key) => {
        const row = rows.find((item) => item.key === key);
        if (!row) return;
        row.status = "冲突";
        row.statusCode = "conflict";
        row.issue = `按用地面积与容积率推算应为 ${Math.round(expectedGfa).toLocaleString()}㎡，当前总建筑面积为 ${Math.round(gfa).toLocaleString()}㎡。`;
        row.action = "确认总建筑面积或容积率";
      });
    }
  }
  const effects = deriveNormDownstreamEffects(data);
  [...effects.site, ...effects.function, ...effects.concept].forEach((item) => {
    rows.push({
      key: `norm-${item.id}`,
      field: item.id,
      category: "规范约束",
      label: item.label,
      currentValue: item.value || item.text,
      condition: item.value || item.text,
      source: item.source || "normConstraint",
      status: item.status === "systemEstimated" ? "系统估算" : "待确认",
      statusCode: item.status === "systemEstimated" ? "estimated" : "confirmed",
      issue: "",
      action: "在后续步骤校核",
      impact: item.impact || "后续设计判断",
      targetField: item.id,
      targetSection: "E"
    });
  });
  asArray(data.normDesignConstraints).forEach((item) => {
    if (rows.some((row) => row.key === `norm-${item.id}`)) return;
    rows.push({
      key: `norm-${item.id}`,
      field: item.id,
      category: "规范约束",
      label: item.label,
      currentValue: item.text,
      condition: item.text,
      source: item.normId || "normConstraint",
      status: "待确认",
      statusCode: "missing",
      issue: `待确认${item.label}`,
      action: "确认或估算规范约束",
      impact: item.impact,
      targetField: item.id,
      targetSection: "E"
    });
  });
  return rows;
};

export const deriveSiteInsights = (site = {}) => {
  const siteLimits = [...asArray(site.siteLimits)];
  const siteOpportunities = [...asArray(site.siteOpportunities)];
  const designImpactHints = [...asArray(site.designImpactHints)];
  Object.entries(asObject(site.surroundings)).forEach(([key, value]) => {
    const item = asObject(value);
    if (item.judgement) {
      if (/traffic|eco|交通|生态/.test(key)) siteOpportunities.push(item.judgement);
      else siteLimits.push(item.judgement);
    }
    if (item.designImpact) designImpactHints.push(item.designImpact);
  });
  asArray(site.normDerivedConstraints).forEach((item) => {
    if (item.text || item.label) siteLimits.push(item.text || item.label);
    if (item.impact) designImpactHints.push(item.impact);
  });
  return {
    siteLimits,
    siteOpportunities,
    designImpactHints,
    swot: {
      strengths: siteOpportunities.slice(0, 2),
      weaknesses: siteLimits.slice(0, 2),
      opportunities: siteOpportunities,
      threats: siteLimits
    }
  };
};
export const isGenericConcept = (name = "", statement = "") => {
  const title = String(name || "").trim();
  const detail = String(statement || "").trim();
  if (detail.length >= 12 && !/^(概念|方案|设计|绿色|生态|融合|人本)$/.test(detail)) return false;
  return /^(概念|方案|设计|绿色|生态|融合|人本|未来|活力)$/.test(title) || /概念|方案|设计$/.test(title);
};


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

export const legacyAdapters = {
  boundaryAnchorPackage(legacy = {}, context = {}) {
    const projectData = legacy.projectData || legacy || {};
    const validation = buildBoundaryValidation(projectData);
    const data = {
      projectIdentity: {
        projectName: projectData.name || projectData.projectName || "",
        buildingType: projectData.type || projectData.buildingType || "",
        location: projectData.location || ""
      },
      hardControls: {
        siteAreaM2: projectData.area || projectData.siteArea || "",
        grossFloorAreaM2: projectData.gfa || "",
        floorAreaRatio: projectData.far || "",
        buildingDensity: projectData.density || "",
        heightLimitM: projectData.height || ""
      },
      functionRequirements: {
        program: projectData.needs || projectData.program || "",
        programItems: splitRequirementItems(projectData.needs || projectData.program || ""),
        targetUsers: projectData.users || projectData.targetUsers || "",
        targetUserItems: splitRequirementItems(projectData.users || projectData.targetUsers || "")
      },
      areaProgram: buildAreaProgramModel(projectData.areaProgram || "", toNumber(projectData.gfa)),
      conflicts: validation.conflicts
    };
    data.norms = recommendNormConstraints(data.projectIdentity.buildingType, {
      needs: data.functionRequirements.program,
      users: data.functionRequirements.targetUsers
    });
    data.normDesignConstraints = resolveNormDesignConstraints(data);
    return {
      ...makePackage("boundaryAnchorPackage"),
      completionStatus: validation.blockingItems.length || validation.conflicts.some((item) => item.severity === "blocking") ? "partial" : "ready",
      confidenceLevel: validation.blockingItems.length ? "medium" : "high",
      blockingItems: validation.blockingItems,
      data,
      sourceTrace: { projectIdentity: { source: context.source || "legacyAdapter", updatedAt: now() } }
    };
  }
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

const buildBoundaryDataFromBrief = (brief = {}) => ({
  projectIdentity: {
    projectName: brief.name || brief.projectName || "",
    buildingType: brief.type || brief.buildingType || "",
    location: brief.location || ""
  },
  hardControls: {
    siteAreaM2: brief.area || brief.siteArea || "",
    buildableBoundaryAreaM2: brief.buildableArea || brief.buildableBoundaryArea || "",
    grossFloorAreaM2: brief.gfa || "",
    floorAreaRatio: brief.far || "",
    buildingDensity: brief.density || "",
    greenRate: brief.greenery || brief.greenRate || "",
    heightLimitM: brief.height || "",
    floors: brief.floors || ""
  },
  functionRequirements: {
    program: brief.needs || brief.program || "",
    programItems: splitRequirementItems(brief.needs || brief.program || ""),
    targetUsers: brief.users || brief.targetUsers || "",
    targetUserItems: splitRequirementItems(brief.users || brief.targetUsers || ""),
    siteCondition: brief.siteCondition || "",
    planningRestrictions: brief.planningRestrictions || "",
    accessConditions: brief.accessConditions || "",
    parking: brief.parking || "",
    pedestrianFlow: brief.pedestrianFlow || "",
    setback: brief.setback || ""
  },
  areaProgram: buildAreaProgramModel(brief.areaProgram || "", toNumber(brief.gfa)),
  siteIntelligencePackage: brief.siteIntelligencePackage || null,
  validationSkipped: brief.validationSkipped || {},
  validationSkippedDetails: asArray(brief.validationSkippedDetails)
});

const syncBoundaryPackageFromBrief = (brief = {}, source = "manualEdit", status = "partial") => {
  const data = buildBoundaryDataFromBrief(brief);
  data.norms = recommendNormConstraints(data.projectIdentity.buildingType, {
    needs: data.functionRequirements.program,
    users: data.functionRequirements.targetUsers
  });
  data.normDesignConstraints = resolveNormDesignConstraints(data);
  const validation = buildBoundaryValidation({
    name: data.projectIdentity.projectName,
    type: data.projectIdentity.buildingType,
    location: data.projectIdentity.location,
    area: data.hardControls.siteAreaM2,
    buildableArea: data.hardControls.buildableBoundaryAreaM2,
    gfa: data.hardControls.grossFloorAreaM2,
    needs: data.functionRequirements.program,
    density: data.hardControls.buildingDensity,
    greenRate: data.hardControls.greenRate
  });
  return store.updatePackage("boundaryAnchorPackage", {
    completionStatus: validation.blockingItems.length || validation.conflicts.some((item) => item.severity === "blocking") ? "partial" : status,
    confidenceLevel: validation.blockingItems.length ? "medium" : "high",
    blockingItems: validation.blockingItems,
    data: { ...data, conflicts: validation.conflicts }
  }, { source, reason: "Sync project brief from input form" });
};

export const bridge = {
  scheduleProjectBrief(brief = {}, source = "manualEdit") {
    return syncBoundaryPackageFromBrief(brief, source, "partial");
  },
  syncProjectBrief(brief = {}, source = "manualEdit") {
    const boundary = syncBoundaryPackageFromBrief(brief, source, "ready");
    const site = brief.siteIntelligencePackage;
    if (site) {
      store.updatePackage("siteAnalysisPackage", {
        completionStatus: site.boundary?.status || site.location ? "confirmed" : "partial",
        confidenceLevel: "high",
        data: {
          siteLocation: site.location || {},
          redline: site.boundary || {},
          ...site
        }
      }, { source, reason: "Sync site package from input form" });
    }
    return boundary;
  },
  syncProblemAnalysis(problemPackage = {}, answers = {}) {
    return store.updatePackage("conceptStrategyPackage", {
      completionStatus: "partial",
      confidenceLevel: "medium",
      data: {
        problemAnalysis: problemPackage || {},
        followUpAnswers: answers || {}
      }
    }, { source: "systemInference", reason: "Sync problem analysis" });
  },
  syncSpatialIntent(intentPackage = {}, selections = {}) {
    return store.updatePackage("functionConstructPackage", {
      completionStatus: "partial",
      confidenceLevel: "medium",
      data: {
        spatialIntentAnalysis: intentPackage || {},
        spatialIntentSelections: selections || {}
      }
    }, { source: "systemInference", reason: "Sync spatial intent" });
  },
  syncStrategy(strategyPackage = {}) {
    return store.updatePackage("conceptStrategyPackage", {
      completionStatus: "ready",
      confidenceLevel: "high",
      data: {
        strategyMatchAnalysis: strategyPackage || {}
      }
    }, { source: "systemInference", reason: "Sync strategy match" });
  },
  syncMassing(massingPackage = {}) {
    return store.updatePackage("massingPlacementPackage", {
      completionStatus: "ready",
      confidenceLevel: "medium",
      data: massingPackage || {}
    }, { source: "systemInference", reason: "Sync massing placement" });
  }
};

export const ARCHICONCEPT_DATA_CHAIN = Object.freeze({
  schemaVersion: 1,
  store,
  bridge,
  buildBoundaryValidation,
  buildDesignConstraintTable,
  calculateAreaProgramItems,
  parseAreaProgram,
  serializeAreaProgram,
  splitRequirementItems,
  createInitialFunctionConstructData,
  validateFunctionConstructData,
  createInitialConceptStrategyData,
  validateConceptStrategyData,
  recommendNormConstraints,
  resolveNormDesignConstraints,
  estimateNormDesignConstraint,
  deriveNormDownstreamEffects,
  deriveSiteInsights,
  legacyAdapters
});

globalThis.ARCHICONCEPT_DATA_CHAIN = ARCHICONCEPT_DATA_CHAIN;



