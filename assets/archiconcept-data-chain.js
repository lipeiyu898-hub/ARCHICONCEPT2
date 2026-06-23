const DATA_CHAIN_SCHEMA_VERSION = 1;
const STORAGE_KEY = "archiconcept:project-data-chain:v1";

const PACKAGE_ORDER = [
  "boundaryAnchorPackage",
  "siteAnalysisPackage",
  "functionConstructPackage",
  "conceptStrategyPackage",
  "massingPlacementPackage",
  "finalConceptPackage"
];

const PACKAGE_STEPS = Object.freeze({
  boundaryAnchorPackage: 1,
  siteAnalysisPackage: 2,
  functionConstructPackage: 3,
  conceptStrategyPackage: 4,
  massingPlacementPackage: 5,
  finalConceptPackage: 6
});

const STALE_DEPENDENCIES = Object.freeze({
  boundaryAnchorPackage: PACKAGE_ORDER.slice(1),
  siteAnalysisPackage: [
    "conceptStrategyPackage",
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  functionConstructPackage: [
    "conceptStrategyPackage",
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  conceptStrategyPackage: [
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  massingPlacementPackage: ["finalConceptPackage"],
  finalConceptPackage: []
});

const COMPLETION_STATUSES = new Set([
  "empty",
  "partial",
  "ready",
  "confirmed"
]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const SOURCE_TYPES = new Set([
  "userInput",
  "importedBrief",
  "mapAPI",
  "systemInference",
  "manualEdit",
  "legacyMigration"
]);

const now = () => new Date().toISOString();
const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const asArray = (value) => (Array.isArray(value) ? clone(value) : []);
const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? clone(value)
    : {};
const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toNumber = (value) => {
  if (!hasValue(value)) return null;
  const normalized = String(value).replace(/,/g, "").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return Number.NaN;
  const numeric = Number(match[0]);
  if (/ha|公顷/i.test(normalized)) return numeric * 10000;
  return numeric;
};

const recommendNormConstraints = (buildingType = "", context = {}) => {
  const data = asObject(context.data || context);
  const identity = asObject(data.projectIdentity);
  const requirements = asObject(data.functionRequirements);
  const controls = asObject(data.hardControls);
  const resolvedType =
    buildingType ||
    identity.buildingType ||
    data.type ||
    data.buildingType ||
    "";
  const program = [
    requirements.program,
    requirements.targetUsers,
    requirements.siteCondition,
    data.needs,
    data.users,
    data.siteCondition
  ]
    .filter(Boolean)
    .join(" ");
  const hasPublicUse =
    /公共|市民|游客|展览|教育|商业|办公|酒店|交通|Public|Cultural|Commercial|Education|Office|Hospitality/i.test(
      `${resolvedType} ${program}`
    );
  const hasUnderground =
    /地下|机房|设备|数据中心|停车|人防/i.test(
      `${program} ${controls.floorRange || data.floors || ""}`
    );
  const hasComplexFunctions =
    splitRequirementItems(requirements.program || data.needs).length >= 4;
  const common = [
    {
      id: "gb55031",
      title: "民用建筑通用规范",
      code: "GB 55031",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: "基础规范",
      triggerReason: resolvedType
        ? `当前项目类型为“${resolvedType}”，需建立建筑基本性能与空间使用底线。`
        : "建筑类型尚未确认，先按通用建筑要求建立基础核验方向。",
      verificationItems: [
        "基本空间尺度与使用安全",
        "室内环境与耐久性要求",
        "公共空间和设备空间的基本性能"
      ],
      downstreamImpact: "边界锚定、功能建构、概念生成",
      note: "用于前期检查建筑基本性能与空间要求。"
    },
    {
      id: "gb55037",
      title: "建筑防火通用规范",
      code: "GB 55037",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: hasUnderground || hasComplexFunctions ? "重点关注" : "基础规范",
      triggerReason: hasUnderground
        ? "项目包含地下、机房或设备空间，消防分区与疏散组织可能成为核心边界。"
        : hasComplexFunctions
          ? "项目功能类型较多，需要提前核验分区、流线和疏散关系。"
          : "建筑项目需要在概念阶段预留消防间距、疏散和防火分区条件。",
      verificationItems: [
        "消防间距与消防扑救条件",
        "防火分区与安全疏散距离",
        hasUnderground ? "地下空间疏散与设备区防火分隔" : "公众与后勤流线的消防组织"
      ],
      downstreamImpact: "场地解析、功能建构、形态落位",
      note: "用于前期识别消防间距、疏散和防火分区风险。"
    },
    {
      id: "gb55019",
      title: "建筑与市政工程无障碍通用规范",
      code: "GB 55019",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: hasPublicUse ? "重点关注" : "基础规范",
      triggerReason: hasPublicUse
        ? "项目包含公众使用、参观或公共服务人群，需要保证连续无障碍到达。"
        : "建筑与场地公共通行空间需要预留连续无障碍路径。",
      verificationItems: [
        "场地主入口的无障碍到达",
        "公共空间与垂直交通的连续性",
        "高差、坡道及无障碍卫生设施"
      ],
      downstreamImpact: "场地解析、入口组织、功能建构",
      note: "用于前期识别无障碍到达与公共空间要求。"
    }
  ];
  const specialized = [];
  if (/教育|学校|Education/i.test(resolvedType)) {
    specialized.push({
      id: "education",
      title: "教育建筑专项规范",
      code: "按项目类型核验",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: "专项规范",
      triggerReason: "项目建筑类型属于教育建筑，需要追加教学与学生活动空间专项核验。",
      verificationItems: ["教学空间采光", "学生疏散组织", "室外活动场地与安全边界"],
      downstreamImpact: "功能建构、概念生成、形态落位",
      note: "需进一步核验教学空间、采光、疏散和活动场地要求。"
    });
  }
  if (/居住|住宅|Residential/i.test(resolvedType)) {
    specialized.push({
      id: "residential",
      title: "住宅项目专项规范",
      code: "按项目类型核验",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: "专项规范",
      triggerReason: "项目建筑类型属于居住建筑，需要追加日照、套型和公共交通空间核验。",
      verificationItems: ["住宅日照与间距", "套型基本要求", "公共交通与消防组织"],
      downstreamImpact: "场地解析、概念生成、形态落位",
      note: "需进一步核验日照、套型、公共交通和消防要求。"
    });
  }
  if (/工业|基础设施|数据中心|Industrial/i.test(resolvedType)) {
    specialized.push({
      id: "industrial",
      title: "工业与基础设施专项规范",
      code: "按具体工艺核验",
      matchStatus: "系统匹配",
      status: "待专业核验",
      priority: "专项规范",
      triggerReason: "项目包含工业、基础设施或数据中心功能，需结合具体工艺和设备条件专项核验。",
      verificationItems: [
        "设备荷载、层高与检修空间",
        "工艺流线、运维和吊装条件",
        "设备消防、噪声和振动控制"
      ],
      downstreamImpact: "功能建构、概念生成、形态落位",
      note: "需结合工艺、荷载、设备、消防和运维条件专项复核。"
    });
  }
  return [...common, ...specialized];
};

const buildNormRequirementDefinitions = (norms = [], context = {}) => {
  const data = asObject(context.data || context);
  const requirements = asObject(data.functionRequirements);
  const controls = asObject(data.hardControls);
  const projectText = [
    data.projectIdentity?.buildingType,
    requirements.program,
    requirements.targetUsers,
    requirements.siteCondition,
    controls.floorRange
  ]
    .filter(Boolean)
    .join(" ");
  const hasUnderground = /地下|机房|设备|数据中心|停车|人防/i.test(projectText);
  const definitions = {
    gb55031: [
      {
        id: "basic-performance",
        label: "建筑基本性能控制方式",
        prompt: "本项目应按何种基本性能条件建立前期空间边界？",
        options: [
          "按常规民用建筑基本性能预留",
          "按设备建筑专项性能要求深化",
          "由专业顾问另行确定"
        ],
        estimateValue: /工业|基础设施|数据中心|Industrial/i.test(projectText)
          ? "按设备建筑专项性能要求深化"
          : "按常规民用建筑基本性能预留",
        impactAreas: ["function", "concept"],
        impact: "功能空间尺度、设备空间和概念策略"
      }
    ],
    gb55037: [
      {
        id: "fire-access",
        label: "消防扑救条件",
        prompt: "场地总平阶段采用何种消防扑救条件？",
        options: [
          "预留可贯通消防车道及扑救面",
          "结合城市道路设置消防扑救面",
          "由消防顾问结合总图确定"
        ],
        estimateValue:
          Number(controls.siteAreaM2) >= 20000
            ? "预留可贯通消防车道及扑救面"
            : "结合城市道路设置消防扑救面",
        impactAreas: ["site", "concept"],
        impact: "场地道路、建筑退让和形态落位"
      },
      {
        id: "fire-zoning",
        label: "防火分区与流线分隔",
        prompt: "公众、后勤和设备空间应采用何种分区原则？",
        options: [
          "公众、后勤与设备空间独立分区",
          "允许局部共享，但设置受控防火分隔",
          "由消防顾问结合功能深化"
        ],
        estimateValue: hasUnderground
          ? "公众、后勤与设备空间独立分区"
          : "允许局部共享，但设置受控防火分隔",
        impactAreas: ["function", "concept"],
        impact: "功能分区、疏散组织和交通核设置"
      }
    ],
    gb55019: [
      {
        id: "accessible-route",
        label: "连续无障碍到达",
        prompt: "场地入口至主要公共空间如何组织无障碍路线？",
        options: [
          "建立连续无障碍路线并接入主要公共空间",
          "设置独立无障碍到达路线",
          "由专业顾问结合高差确定"
        ],
        estimateValue: "建立连续无障碍路线并接入主要公共空间",
        impactAreas: ["site", "function"],
        impact: "入口位置、场地高差与公共流线"
      },
      {
        id: "accessible-entrance",
        label: "无障碍入口与垂直交通",
        prompt: "无障碍入口与垂直交通采用何种前期原则？",
        options: [
          "至少预留一处无障碍主入口并接入垂直交通",
          "无障碍入口与主要公共入口合并设置",
          "由专业顾问结合运营需求确定"
        ],
        estimateValue: "无障碍入口与主要公共入口合并设置",
        impactAreas: ["site", "function"],
        impact: "主要入口、门厅和垂直交通组织"
      }
    ],
    education: [
      {
        id: "education-safety",
        label: "教学与活动空间安全边界",
        prompt: "教学、活动及后勤空间采用何种组织原则？",
        options: [
          "教学与后勤流线分离，活动场地独立设置",
          "允许分时共享并设置管理边界",
          "由教育建筑顾问深化"
        ],
        estimateValue: "教学与后勤流线分离，活动场地独立设置",
        impactAreas: ["function", "concept"],
        impact: "功能分区、活动场地和流线组织"
      }
    ],
    residential: [
      {
        id: "residential-spacing",
        label: "日照与住宅间距控制",
        prompt: "概念阶段如何处理住宅日照与建筑间距？",
        options: [
          "优先保证主要朝向日照并预留间距校核空间",
          "以组团布局为主，后续进行精确日照校核",
          "由规划顾问结合地方规定确定"
        ],
        estimateValue: "优先保证主要朝向日照并预留间距校核空间",
        impactAreas: ["site", "concept"],
        impact: "建筑朝向、组团间距和形态落位"
      }
    ],
    industrial: [
      {
        id: "industrial-service",
        label: "设备运维与吊装组织",
        prompt: "设备运维、吊装与公众使用空间如何组织？",
        options: [
          "设备运维、吊装与公众流线独立组织",
          "允许分时共享，但保留独立检修通道",
          "由工艺顾问结合设备清单确定"
        ],
        estimateValue: "设备运维、吊装与公众流线独立组织",
        impactAreas: ["site", "function", "concept"],
        impact: "后勤入口、设备区、吊装路径和体量组织"
      },
      {
        id: "industrial-isolation",
        label: "设备区环境隔离",
        prompt: "设备空间与公共空间采用何种环境隔离原则？",
        options: [
          "设置声学、振动与安全缓冲空间",
          "通过垂直分层和结构隔离控制影响",
          "由工艺与声学顾问专项确定"
        ],
        estimateValue: "设置声学、振动与安全缓冲空间",
        impactAreas: ["function", "concept"],
        impact: "功能邻接、结构分区和公共空间品质"
      }
    ]
  };
  return norms.flatMap((norm) =>
    asArray(definitions[norm.id]).map((definition) => ({
      ...definition,
      normId: norm.id,
      normTitle: norm.title,
      normCode: norm.code
    }))
  );
};

const resolveNormDesignConstraints = (data = {}) => {
  const norms = recommendNormConstraints(
    data.projectIdentity?.buildingType,
    data
  );
  const definitions = buildNormRequirementDefinitions(norms, data);
  const decisions = asObject(data.normConstraintDecisions);
  return definitions.map((definition) => {
    const decision = asObject(decisions[definition.id]);
    const hasDecision = hasValue(decision.value);
    return {
      ...definition,
      value: hasDecision ? decision.value : "",
      status: hasDecision ? decision.status || "userConfirmed" : "pending",
      source: hasDecision ? decision.source || "userInput" : null,
      updatedAt: decision.updatedAt || null,
      constraintText: hasDecision
        ? `${definition.label}：${decision.value}`
        : `${definition.label}待确认`
    };
  });
};

const estimateNormDesignConstraint = (constraintId, data = {}) => {
  const constraint = resolveNormDesignConstraints(data).find(
    (item) => item.id === constraintId
  );
  if (!constraint) return null;
  return {
    value: constraint.estimateValue,
    status: "systemEstimated",
    source: "systemInference",
    updatedAt: now()
  };
};

const deriveNormDownstreamEffects = (data = {}) => {
  const resolved = resolveNormDesignConstraints(data).filter(
    (item) => item.status !== "pending" && hasValue(item.value)
  );
  const pick = (area) =>
    resolved
      .filter((item) => item.impactAreas.includes(area))
      .map((item) => ({
        id: item.id,
        normId: item.normId,
        normTitle: item.normTitle,
        label: item.label,
        value: item.value,
        source: item.source,
        status: item.status,
        text: item.constraintText
      }));
  return {
    resolved,
    site: pick("site"),
    function: pick("function"),
    concept: pick("concept")
  };
};

const buildBoundaryValidation = (brief = {}) => {
  const blockingItems = [];
  const missingItems = [];
  const conflicts = [];
  const addBlocking = (field, label, impact) =>
    blockingItems.push({ field, label, impact, severity: "blocking" });
  const addMissing = (field, label, impact) =>
    missingItems.push({ field, label, impact, severity: "warning" });

  if (!hasValue(brief.name || brief.projectName)) {
    addBlocking("projectName", "项目名称", "无法建立项目身份与后续成果归属。");
  }
  if (!hasValue(brief.type || brief.buildingType)) {
    addBlocking("buildingType", "建筑类型", "无法匹配专项规范和典型功能要求。");
  }
  const area = toNumber(brief.area || brief.siteArea);
  const redlineArea = toNumber(
    brief.buildableArea || brief.buildableBoundaryArea
  );
  if (
    (!Number.isFinite(area) || area <= 0) &&
    (!Number.isFinite(redlineArea) || redlineArea <= 0)
  ) {
    addBlocking("siteAreaM2", "用地面积", "无法进行容量、密度和体量判断。");
  }
  if (
    !hasValue(
      brief.needs ||
        brief.program ||
        brief.siteCondition ||
        brief.siteInfo
    )
  ) {
    addBlocking(
      "functionRequirements",
      "功能需求或场地问题",
      "无法建立功能刚需和设计任务边界。"
    );
  }

  [
    ["far", "容积率", "可能影响开发强度与容量校核。"],
    ["gfa", "总建筑面积", "可能影响功能面积分配与体量推导。"],
    ["height", "建筑限高", "可能影响层数、体量与城市界面判断。"],
    ["floors", "层数范围", "可能影响垂直组织与交通核判断。"]
  ].forEach(([field, label, impact]) => {
    if (!hasValue(brief[field])) addMissing(field, label, impact);
  });

  const numericChecks = [
    ["area", area, "用地面积"],
    ["gfa", toNumber(brief.gfa), "总建筑面积"],
    ["far", toNumber(brief.far), "容积率"],
    ["density", toNumber(brief.density), "建筑密度"],
    ["greenery", toNumber(brief.greenery), "绿化率"],
    ["height", toNumber(brief.height), "建筑高度"]
  ];
  numericChecks.forEach(([field, numeric, label]) => {
    if (numeric !== null && !Number.isFinite(numeric)) {
      conflicts.push({
        field,
        label,
        message: `${label}不是有效数字。`,
        severity: "blocking"
      });
    } else if (Number.isFinite(numeric) && numeric < 0) {
      conflicts.push({
        field,
        label,
        message: `${label}不能小于 0。`,
        severity: "blocking"
      });
    }
  });
  [
    ["density", toNumber(brief.density), "建筑密度"],
    ["greenery", toNumber(brief.greenery), "绿化率"]
  ].forEach(([field, numeric, label]) => {
    if (Number.isFinite(numeric) && numeric > 100) {
      conflicts.push({
        field,
        label,
        message: `${label}不能大于 100%。`,
        severity: "blocking"
      });
    }
  });
  if (Number.isFinite(toNumber(brief.far)) && toNumber(brief.far) > 20) {
    conflicts.push({
      field: "far",
      label: "容积率",
      message: "容积率高于 20，请核对单位或项目条件。",
      severity: "warning"
    });
  }

  return { blockingItems, missingItems, conflicts };
};

const buildDesignConstraintTable = (data = {}, packageContext = {}) => {
  const identity = data.projectIdentity || {};
  const controls = data.hardControls || {};
  const requirements = data.functionRequirements || {};
  const conflicts = asArray(data.conflicts);
  const sourceTrace = asObject(packageContext.sourceTrace);
  const sourceLabel = (field) => {
    const source = sourceTrace[field]?.source;
    if (source === "importedBrief") return "任务书导入";
    if (source === "mapAPI") return "场地编辑器";
    if (source === "systemInference") return "系统推断";
    if (source === "manualEdit") return "人工调整";
    return "用户输入";
  };
  const rowConflict = (fields) =>
    conflicts.find((item) => fields.includes(item.field));
  const makeRow = ({
    key,
    field,
    category,
    label,
    value,
    displayValue,
    missingText,
    action,
    impact,
    section,
    sourceField = field
  }) => {
    const conflict = rowConflict([field, key]);
    const hasCurrentValue = hasValue(value);
    return {
      key,
      field,
      category,
      label,
      currentValue: hasCurrentValue ? displayValue || String(value) : missingText,
      condition: hasCurrentValue ? displayValue || String(value) : missingText,
      source: sourceLabel(sourceField),
      status: conflict
        ? "存在冲突"
        : hasCurrentValue
          ? "已确认"
          : "待补充",
      statusCode: conflict
        ? "conflict"
        : hasCurrentValue
          ? "confirmed"
          : "missing",
      issue: conflict?.message || (hasCurrentValue ? "" : missingText),
      action: conflict ? "核对并修正当前数值" : hasCurrentValue ? "无需处理" : action,
      impact,
      targetField: field,
      targetSection: section
    };
  };
  const areaItems = asArray(data.areaProgram?.items);
  const allocatedArea = Number(data.areaProgram?.allocatedAreaM2) || 0;
  const rows = [
    makeRow({
      key: "projectType",
      field: "type",
      category: "项目身份",
      label: "建筑类型",
      value: identity.buildingType,
      displayValue: identity.buildingType,
      missingText: "未选择建筑类型",
      action: "补充建筑类型",
      impact: "规范匹配 / 概念生成",
      section: "A",
      sourceField: "projectIdentity"
    }),
    makeRow({
      key: "location",
      field: "location",
      category: "项目身份",
      label: "项目地点",
      value: identity.location,
      displayValue: identity.location,
      missingText: "未填写项目地点",
      action: "补充项目地点",
      impact: "场地解析 / 规范匹配",
      section: "A",
      sourceField: "projectIdentity"
    }),
    makeRow({
      key: "siteArea",
      field: "area",
      category: "规模边界",
      label: "用地面积",
      value: controls.siteAreaM2,
      displayValue: hasValue(controls.siteAreaM2)
        ? `${toNumber(controls.siteAreaM2)?.toLocaleString("zh-CN")} ㎡`
        : "",
      missingText: "未填写用地面积",
      action: "补充用地面积",
      impact: "容量校核 / 形态落位",
      section: "A",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "gfa",
      field: "gfa",
      category: "规模边界",
      label: "总建筑面积",
      value: controls.grossFloorAreaM2,
      displayValue: hasValue(controls.grossFloorAreaM2)
        ? `${toNumber(controls.grossFloorAreaM2)?.toLocaleString("zh-CN")} ㎡`
        : "",
      missingText: "未填写总建筑面积",
      action: "补充总建筑面积",
      impact: "功能建构 / 形态落位",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "far",
      field: "far",
      category: "强控指标",
      label: "容积率",
      value: controls.floorAreaRatio,
      displayValue: controls.floorAreaRatio,
      missingText: "未填写容积率",
      action: "补充容积率",
      impact: "容量校核 / 形态落位",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "density",
      field: "density",
      category: "强控指标",
      label: "建筑密度",
      value: controls.buildingDensityPercent,
      displayValue: hasValue(controls.buildingDensityPercent)
        ? `${controls.buildingDensityPercent}%`
        : "",
      missingText: "未填写建筑密度",
      action: "补充建筑密度",
      impact: "首层占地 / 开放空间",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "greenery",
      field: "greenery",
      category: "强控指标",
      label: "绿化率",
      value: controls.greenRatioPercent,
      displayValue: hasValue(controls.greenRatioPercent)
        ? `${controls.greenRatioPercent}%`
        : "",
      missingText: "未填写绿化率",
      action: "补充绿化率",
      impact: "场地解析 / 开放空间",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "height",
      field: "height",
      category: "强控指标",
      label: "建筑限高",
      value: controls.heightLimitM,
      displayValue: hasValue(controls.heightLimitM)
        ? `${controls.heightLimitM} m`
        : "",
      missingText: "未填写建筑限高",
      action: "补充建筑限高",
      impact: "层数判断 / 城市界面",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "floors",
      field: "floors",
      category: "规模边界",
      label: "层数范围",
      value: controls.floorRange,
      displayValue: controls.floorRange,
      missingText: "未填写层数范围",
      action: "补充层数范围",
      impact: "垂直组织 / 交通核",
      section: "B",
      sourceField: "hardControls"
    }),
    makeRow({
      key: "program",
      field: "needs",
      category: "功能刚需",
      label: "核心功能需求",
      value: requirements.program,
      displayValue: requirements.program,
      missingText: "未填写核心功能需求",
      action: "添加核心功能",
      impact: "功能建构 / 概念生成",
      section: "C",
      sourceField: "functionRequirements"
    }),
    makeRow({
      key: "targetUsers",
      field: "users",
      category: "功能刚需",
      label: "主要使用人群",
      value: requirements.targetUsers,
      displayValue: requirements.targetUsers,
      missingText: "未填写主要使用人群",
      action: "添加使用人群",
      impact: "流线组织 / 空间属性",
      section: "C",
      sourceField: "functionRequirements"
    }),
    makeRow({
      key: "areaProgram",
      field: "areaProgram",
      category: "功能刚需",
      label: "功能面积组成",
      value: areaItems.length ? allocatedArea : "",
      displayValue: areaItems.length
        ? `${areaItems.length} 项 / ${allocatedArea.toLocaleString("zh-CN")} ㎡`
        : "",
      missingText: "未建立功能面积分表",
      action: "补充功能面积分表",
      impact: "功能建构 / 面积校核",
      section: "C",
      sourceField: "areaProgram"
    })
  ];

  const siteArea = toNumber(controls.siteAreaM2);
  const gfa = toNumber(controls.grossFloorAreaM2);
  const far = toNumber(controls.floorAreaRatio);
  if (
    Number.isFinite(siteArea) &&
    siteArea > 0 &&
    Number.isFinite(gfa) &&
    gfa > 0 &&
    Number.isFinite(far) &&
    far > 0
  ) {
    const expectedGfa = siteArea * far;
    const difference = Math.abs(gfa - expectedGfa);
    const tolerance = Math.max(100, expectedGfa * 0.02);
    if (difference > tolerance) {
      const message = `总建筑面积 ${gfa.toLocaleString("zh-CN")} ㎡与用地面积 × 容积率推算值 ${Math.round(
        expectedGfa
      ).toLocaleString("zh-CN")} ㎡不一致。`;
      ["gfa", "far"].forEach((key) => {
        const row = rows.find((item) => item.key === key);
        if (!row) return;
        row.status = "存在冲突";
        row.statusCode = "conflict";
        row.issue = message;
        row.action = "核对总建筑面积与容积率";
      });
    }
  }

  resolveNormDesignConstraints(data).forEach((constraint) => {
    const isPending = constraint.status === "pending";
    const isEstimated = constraint.status === "systemEstimated";
    rows.push({
      key: `norm-${constraint.id}`,
      field: `normConstraintDecisions.${constraint.id}`,
      category: "规范约束",
      label: constraint.label,
      currentValue: isPending ? "待确认" : constraint.value,
      condition: isPending ? "待确认" : constraint.value,
      source: isEstimated ? "系统估算" : isPending ? "规范匹配" : "用户确认",
      status: isPending ? "待补充" : isEstimated ? "系统估算" : "已确认",
      statusCode: isPending ? "missing" : isEstimated ? "estimated" : "confirmed",
      issue: isPending ? `${constraint.normTitle}要求明确该设计条件。` : "",
      action: isPending
        ? "补充条件或采用系统估算"
        : isEstimated
          ? "建议后续专业复核"
          : "无需处理",
      impact: constraint.impact,
      targetField: `norm:${constraint.id}`,
      targetSection: "D"
    });
  });

  return rows;
};

const createPackage = (packageName) => {
  const timestamp = now();
  return {
    packageName,
    step: PACKAGE_STEPS[packageName],
    completionStatus: "empty",
    confidenceLevel: "low",
    blockingItems: [],
    assumptions: [],
    sourceTrace: {},
    downstreamHints: {},
    stale: false,
    staleReasons: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: null,
    data: {}
  };
};

const createProjectDataChain = (seed = {}) => {
  const timestamp = now();
  const chain = {
    schemaVersion: DATA_CHAIN_SCHEMA_VERSION,
    projectId: seed.projectId || globalThis.crypto?.randomUUID?.() || `project-${Date.now()}`,
    currentStep: Number(seed.currentStep) || 1,
    createdAt: seed.createdAt || timestamp,
    updatedAt: timestamp,
    revision: Number(seed.revision) || 0,
    revisionHistory: asArray(seed.revisionHistory),
    metadata: asObject(seed.metadata)
  };

  PACKAGE_ORDER.forEach((packageName) => {
    chain[packageName] = {
      ...createPackage(packageName),
      ...asObject(seed[packageName]),
      packageName,
      step: PACKAGE_STEPS[packageName],
      data: asObject(seed[packageName]?.data)
    };
  });

  return chain;
};

const normalizeCompletionStatus = (value, data) => {
  if (COMPLETION_STATUSES.has(value)) return value;
  return Object.keys(data || {}).length ? "partial" : "empty";
};

const normalizeConfidence = (value) =>
  CONFIDENCE_LEVELS.has(value) ? value : "low";

const normalizeSourceType = (value) =>
  SOURCE_TYPES.has(value) ? value : "systemInference";

const makeSourceTrace = (source, fields = [], detail = {}) => {
  const sourceType = normalizeSourceType(source);
  const timestamp = now();
  return fields.reduce((trace, field) => {
    if (!field) return trace;
    trace[field] = {
      source: sourceType,
      updatedAt: timestamp,
      ...asObject(detail)
    };
    return trace;
  }, {});
};

const mergeSourceTrace = (current, incoming) => {
  const next = { ...asObject(current) };
  Object.entries(asObject(incoming)).forEach(([field, trace]) => {
    next[field] = {
      ...asObject(next[field]),
      ...asObject(trace),
      source: normalizeSourceType(trace?.source),
      updatedAt: trace?.updatedAt || now()
    };
  });
  return next;
};

const splitRequirementItems = (value = "") => {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n、，,；;]+/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
};

const normalizeAreaItem = (item = {}, index = 0) => {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitAreaM2 = Math.max(
    0,
    Number(item.unitAreaM2) ||
      (Number(item.areaM2) > 0 ? Number(item.areaM2) / quantity : 0)
  );
  return {
    id: item.id || `program-${index + 1}`,
    parentId: item.parentId || null,
    level: Math.min(3, Math.max(1, Number(item.level) || 1)),
    name: String(item.name || "").trim(),
    quantity,
    unitAreaM2,
    areaM2: Math.max(0, Number(item.areaM2) || quantity * unitAreaM2),
    declaredAreaM2: Math.max(
      0,
      Number(item.declaredAreaM2) || Number(item.areaM2) || quantity * unitAreaM2
    ),
    category: item.category || "required"
  };
};

const calculateAreaProgramItems = (items = []) => {
  const normalized = asArray(items)
    .map(normalizeAreaItem)
    .filter((item) => item.name);
  const childrenByParent = normalized.reduce((map, item) => {
    if (!item.parentId) return map;
    if (!map[item.parentId]) map[item.parentId] = [];
    map[item.parentId].push(item);
    return map;
  }, {});
  const byId = Object.fromEntries(normalized.map((item) => [item.id, item]));
  const calculate = (item, stack = new Set()) => {
    if (stack.has(item.id)) return item.areaM2;
    const children = childrenByParent[item.id] || [];
    if (!children.length) {
      item.areaM2 = Math.max(
        0,
        Number(item.quantity) * Number(item.unitAreaM2)
      );
      return item.areaM2;
    }
    const nextStack = new Set(stack).add(item.id);
    item.childAreaM2 = children.reduce(
      (sum, child) => sum + calculate(child, nextStack),
      0
    );
    item.areaM2 =
      Number(item.declaredAreaM2) > 0
        ? Number(item.declaredAreaM2)
        : item.childAreaM2;
    item.areaDifferenceM2 =
      item.childAreaM2 - item.areaM2;
    return item.areaM2;
  };
  normalized.forEach((item) => calculate(item));
  normalized.forEach((item) => {
    if (item.parentId && !byId[item.parentId]) {
      item.parentId = null;
      item.level = 1;
    }
  });
  return normalized;
};

const parseAreaProgram = (value = "", targetAreaM2 = 0) => {
  if (value && typeof value === "object" && Array.isArray(value.items)) {
    return calculateAreaProgramItems(value.items);
  }
  if (!hasValue(value)) return [];

  const rawRows = String(value)
    .split(/\n|；|;/)
    .flatMap((raw) => {
      const parts = raw.split(/，其中/);
      if (parts.length < 2) return [raw];
      return [
        parts[0],
        ...parts
          .slice(1)
          .join("，")
          .split(/，/)
          .map((item) => `  ${item}`)
      ];
    })
    .map((raw) => ({ raw, text: raw.trim() }))
    .filter((item) => item.text);
  const items = [];
  let currentLevelOneId = null;
  let currentLevelTwoId = null;
  let expectsChildren = false;

  rawRows.forEach(({ raw, text }, index) => {
    const explicit = text.match(
      /^([123])级\s*[｜|]\s*([^｜|]+?)\s*[｜|]\s*(?:(\d+(?:\.\d+)?)\s*[×x*]\s*)?(\d+(?:\.\d+)?)\s*(㎡|m²|m2|平方米|%|％)?$/i
    );
    const numbered = text.match(
      /^(?:[（(]\s*\d+\s*[）)]|\d+[.、])\s*(.+?)[：:]\s*(\d+(?:\.\d+)?)\s*(㎡|m²|m2|平方米|%|％)?(?:\s*[,，]?\s*包括)?$/i
    );
    const range = text.match(
      /^(.+?)(?:约)?\s*(\d+(?:\.\d+)?)\s*[–—~-]\s*(\d+(?:\.\d+)?)\s*(㎡|m²|m2|平方米)$/i
    );
    const simple = text.match(
      /^(.+?)[：:\s]+(?:(\d+(?:\.\d+)?)\s*[×x*]\s*)?(\d+(?:\.\d+)?)\s*(㎡|m²|m2|平方米|%|％)?(?:\s*[,，]?\s*包括)?$/i
    );
    const match = explicit || numbered || range || simple;
    if (!match) return;

    let level;
    let name;
    let quantity;
    let numeric;
    let unit;
    if (explicit) {
      level = Number(explicit[1]);
      name = explicit[2];
      quantity = Number(explicit[3]) || 1;
      numeric = Number(explicit[4]);
      unit = explicit[5] || "";
    } else if (numbered) {
      level = 1;
      name = numbered[1];
      quantity = 1;
      numeric = Number(numbered[2]);
      unit = numbered[3] || "";
      expectsChildren = /包括/.test(text);
    } else if (range) {
      name = range[1].replace(/[：:\s]+$/, "").trim();
      quantity = 1;
      numeric = (Number(range[2]) + Number(range[3])) / 2;
      unit = range[4] || "";
      level = /^\s{2,}/.test(raw) ? 2 : 1;
    } else {
      name = simple[1];
      quantity = Number(simple[2]) || 1;
      numeric = Number(simple[3]);
      unit = simple[4] || "";
      const indented = /^\s{2,}/.test(raw);
      level = indented || expectsChildren ? 2 : 1;
    }

    const isPercent = /%|％/.test(unit);
    const totalAreaM2 =
      isPercent && targetAreaM2
        ? (targetAreaM2 * numeric) / 100
        : numeric * quantity;
    const id = `program-${index + 1}`;
    const parentId =
      level === 1
        ? null
        : level === 2
          ? currentLevelOneId
          : currentLevelTwoId || currentLevelOneId;
    items.push({
      id,
      name: name.trim(),
      level,
      parentId,
      category: index < 2 ? "required" : "flexible",
      quantity,
      unitAreaM2: totalAreaM2 / quantity,
      areaM2: totalAreaM2,
      declaredAreaM2: totalAreaM2
    });
    if (level === 1) {
      currentLevelOneId = id;
      currentLevelTwoId = null;
      if (!numbered) expectsChildren = false;
    } else if (level === 2) {
      currentLevelTwoId = id;
    }
  });

  return calculateAreaProgramItems(items);
};

const serializeAreaProgram = (items = []) => {
  const normalized = calculateAreaProgramItems(items);
  const childrenByParent = normalized.reduce((map, item) => {
    if (!item.parentId) return map;
    if (!map[item.parentId]) map[item.parentId] = [];
    map[item.parentId].push(item);
    return map;
  }, {});
  const ordered = [];
  const visited = new Set();
  const appendBranch = (item) => {
    if (!item || visited.has(item.id)) return;
    visited.add(item.id);
    ordered.push(item);
    (childrenByParent[item.id] || []).forEach(appendBranch);
  };
  normalized.filter((item) => !item.parentId).forEach(appendBranch);
  normalized.forEach(appendBranch);
  return ordered
    .map(
      (item) =>
        `${item.level}级｜${item.name}｜${item.quantity}×${Number(
          item.unitAreaM2
        ).toFixed(Number(item.unitAreaM2) % 1 ? 1 : 0)}㎡`
    )
    .join("\n");
};

const buildAreaProgramModel = (value = "", targetAreaM2 = 0) => {
  const items = parseAreaProgram(value, targetAreaM2);
  return {
    targetGfaM2: Number(targetAreaM2) || null,
    items,
    allocatedAreaM2: items
      .filter(
        (item) =>
          !item.parentId ||
          !items.some((parent) => parent.id === item.parentId)
      )
      .reduce((sum, item) => sum + Number(item.areaM2 || 0), 0),
    legacyText:
      value && typeof value === "object"
        ? value.legacyText || serializeAreaProgram(items)
        : String(value || "")
  };
};

const buildBoundaryData = (brief = {}) => {
  const validation = buildBoundaryValidation(brief);
  const targetGfaM2 = toNumber(brief.gfa);
  const areaProgram = buildAreaProgramModel(brief.areaProgram, targetGfaM2);
  const data = {
    projectIdentity: {
      projectName: brief.name || brief.projectName || "",
      buildingType: brief.type || brief.buildingType || "",
      location: brief.location || ""
    },
    hardControls: {
      siteAreaM2: brief.area || brief.siteArea || "",
      grossFloorAreaM2: brief.gfa || "",
      floorAreaRatio: brief.far || "",
      buildingDensityPercent: brief.density || brief.buildingDensity || "",
      greenRatioPercent: brief.greenery || brief.greenRatio || "",
      heightLimitM: brief.height || brief.heightLimit || "",
      floorRange: brief.floors || "",
      buildableBoundaryAreaM2:
        brief.buildableArea || brief.buildableBoundaryArea || ""
    },
    areaProgram,
    functionRequirements: {
      program: brief.needs || brief.program || "",
      programItems: splitRequirementItems(brief.needs || brief.program),
      targetUsers: brief.users || brief.targetUsers || "",
      targetUserItems: splitRequirementItems(
        brief.users || brief.targetUsers
      ),
      siteCondition: brief.siteCondition || brief.siteInfo || ""
    },
    normConstraints: asArray(brief.normConstraints).length
      ? asArray(brief.normConstraints)
      : recommendNormConstraints(brief.type || brief.buildingType, brief),
    missingItems: [
      ...validation.missingItems,
      ...asArray(brief.validationSkippedDetails)
    ],
    conflicts: [...validation.conflicts, ...asArray(brief.conflicts)]
  };
  data.designConstraintTable = buildDesignConstraintTable(data);
  return data;
};

const inferBoundaryStatus = (brief = {}) => {
  const validation = buildBoundaryValidation(brief);
  const hasAnyValue = Object.values(brief).some(hasValue);
  if (!hasAnyValue) return "empty";
  return validation.blockingItems.length ||
    validation.conflicts.some((item) => item.severity === "blocking")
    ? "partial"
    : "ready";
};

const deriveSiteInsights = (site = {}) => {
  const context = asObject(site.surroundings || site.poiContext);
  const pick = (key, field) =>
    hasValue(context[key]?.[field]) ? context[key][field] : "";
  const siteLimits = asArray(site.siteLimits);
  const siteOpportunities = asArray(site.siteOpportunities);
  const designImpactHints = asArray(site.designImpactHints);
  asArray(site.normDerivedConstraints).forEach((item) => {
    const text = item.text || item.constraintText || item.value || item;
    if (text && !siteLimits.includes(text)) siteLimits.push(text);
    const impact = item.impact
      ? `${item.label || "规范条件"}将影响${item.impact}。`
      : `场地解析需回应规范条件：${text}`;
    if (!designImpactHints.includes(impact)) designImpactHints.push(impact);
  });

  ["sensitive", "disturbance"].forEach((key) => {
    const value = pick(key, "judgement") || pick(key, "summary");
    if (value && !siteLimits.includes(value)) siteLimits.push(value);
  });
  ["traffic", "public", "eco", "commercial"].forEach((key) => {
    const value = pick(key, "judgement") || pick(key, "summary");
    if (value && !siteOpportunities.includes(value)) {
      siteOpportunities.push(value);
    }
  });
  Object.values(context).forEach((item) => {
    if (
      hasValue(item?.designImpact) &&
      !designImpactHints.includes(item.designImpact)
    ) {
      designImpactHints.push(item.designImpact);
    }
  });

  const swot = asObject(site.swot);
  return {
    siteLimits,
    siteOpportunities,
    designImpactHints,
    swot: {
      strengths: asArray(swot.strengths).length
        ? asArray(swot.strengths)
        : siteOpportunities.slice(0, 2),
      weaknesses: asArray(swot.weaknesses).length
        ? asArray(swot.weaknesses)
        : siteLimits.slice(0, 1),
      opportunities: asArray(swot.opportunities).length
        ? asArray(swot.opportunities)
        : siteOpportunities.slice(2, 4),
      threats: asArray(swot.threats).length
        ? asArray(swot.threats)
        : siteLimits.slice(1, 3)
    }
  };
};

const getFunctionTemplate = (buildingType = "") => {
  if (/工业|基础设施|数据中心|Industrial/i.test(buildingType)) {
    return [
      ["核心生产与机房", "required", 42],
      ["技术支持与设备", "required", 18],
      ["公共展示与交流", "flexible", 12],
      ["办公与研发", "flexible", 10],
      ["运维与后勤", "support", 10],
      ["交通与公共空间", "support", 8]
    ];
  }
  if (/教育|学校|Education/i.test(buildingType)) {
    return [
      ["教学与学习", "required", 38],
      ["实验与专业空间", "required", 18],
      ["公共交流", "flexible", 12],
      ["行政办公", "support", 8],
      ["体育与活动", "flexible", 14],
      ["后勤与交通", "support", 10]
    ];
  }
  if (/文化|展览|公共|Cultural|Exhibition|Public/i.test(buildingType)) {
    return [
      ["核心公共功能", "required", 35],
      ["展览与活动", "required", 20],
      ["公共交流与服务", "flexible", 15],
      ["管理与办公", "support", 8],
      ["库房与后勤", "support", 12],
      ["交通与共享空间", "support", 10]
    ];
  }
  if (/商业|综合体|Commercial|Mixed/i.test(buildingType)) {
    return [
      ["核心经营空间", "required", 42],
      ["公共服务与体验", "flexible", 18],
      ["配套经营空间", "flexible", 14],
      ["管理办公", "support", 6],
      ["仓储与后勤", "support", 10],
      ["交通与共享空间", "support", 10]
    ];
  }
  return [
    ["核心使用功能", "required", 40],
    ["公共与共享空间", "flexible", 18],
    ["专项功能空间", "required", 16],
    ["管理与办公", "support", 8],
    ["后勤与设备", "support", 10],
    ["交通空间", "support", 8]
  ];
};

const defaultFunctionAttributes = (category, index) => ({
  publicity:
    category === "support" ? "restricted" : index < 2 ? "public" : "semiPublic",
  privacy: category === "support" ? "high" : index < 2 ? "low" : "medium",
  daylight: category === "support" ? "optional" : "required",
  floorHeight: category === "required" ? "high" : "standard",
  noise: category === "support" ? "high" : "medium",
  load: category === "required" ? "high" : "standard",
  cleanliness: category === "support" ? "dirty" : "general"
});

const buildBubbleGraph = (functionTree = []) => {
  const active = calculateAreaProgramItems(functionTree);
  const roots = active.filter(
    (item) =>
      Number(item.level) === 1 ||
      !active.some((candidate) => candidate.id === item.parentId)
  );
  const byParent = active.reduce((map, item) => {
    if (!item.parentId) return map;
    if (!map[item.parentId]) map[item.parentId] = [];
    map[item.parentId].push(item);
    return map;
  }, {});
  const maxArea = Math.max(...roots.map((item) => Number(item.areaM2) || 0), 1);
  const nodes = [];
  const hierarchyEdges = [];
  const placeChildren = (parent, parentNode, depth = 2) => {
    const children = byParent[parent.id] || [];
    children.forEach((child, index) => {
      const angle =
        (Math.PI * 2 * index) / Math.max(children.length, 1) -
        Math.PI / 2 +
        (parentNode.x / 100) * 0.45;
      const orbit =
        depth === 2
          ? Math.max(15, Number(parentNode.size || 0) / 2 + 9)
          : Math.max(8, Number(parentNode.size || 0) / 2 + 5);
      const node = {
        id: child.id,
        parentId: parent.id,
        level: Number(child.level) || depth,
        label: child.name,
        x: Math.max(5, Math.min(95, parentNode.x + Math.cos(angle) * orbit)),
        y: Math.max(5, Math.min(95, parentNode.y + Math.sin(angle) * orbit)),
        size: depth === 2 ? 12 : 8
      };
      nodes.push(node);
      hierarchyEdges.push({
        id: `hierarchy-${parent.id}-${child.id}`,
        source: parent.id,
        target: child.id
      });
      placeChildren(child, node, depth + 1);
    });
  };
  roots.forEach((item, index) => {
    const angle =
      (Math.PI * 2 * index) / Math.max(roots.length, 1) - Math.PI / 2;
    const radius = roots.length <= 4 ? 27 : 31;
    const isSingleRoot = roots.length === 1;
    const node = {
      id: item.id,
      parentId: null,
      level: 1,
      label: item.name,
      x: isSingleRoot ? 50 : Math.round(50 + Math.cos(angle) * radius),
      y: isSingleRoot ? 50 : Math.round(50 + Math.sin(angle) * radius),
      size: Math.round(18 + ((Number(item.areaM2) || 0) / maxArea) * 18)
    };
    nodes.push(node);
    placeChildren(item, node);
  });
  return {
    nodes,
    hierarchyEdges
  };
};

const detectFunctionConflicts = (data = {}) => {
  const conflicts = [];
  const functions = asArray(data.functionTree);
  const allocation = asObject(data.areaAllocation);
  const attributes = asObject(data.functionAttributes);
  const circulation = asObject(data.circulationSystem);
  const edges = asArray(data.relationshipGraph?.edges);
  const allocated = functions
    .filter(
      (item) =>
        !item.parentId ||
        !functions.some((parent) => parent.id === item.parentId)
    )
    .reduce(
    (sum, item) => sum + Math.max(0, Number(item.areaM2) || 0),
    0
  );
  const target = Number(allocation.targetGfaM2) || 0;

  if (target && allocated > target * 1.05) {
    conflicts.push({
      id: "area-overflow",
      type: "area",
      severity: "blocking",
      title: "功能面积超过总建筑面积",
      message: `已分配 ${Math.round(allocated)}㎡，超过目标 ${Math.round(target)}㎡。`
    });
  } else if (target && Math.abs(allocated - target) > target * 0.1) {
    conflicts.push({
      id: "area-gap",
      type: "area",
      severity: "warning",
      title: "功能面积与目标面积存在偏差",
      message: `当前尚有 ${Math.round(target - allocated)}㎡ 未完成分配。`
    });
  }
  if (!circulation.publicServiceSeparated) {
    conflicts.push({
      id: "people-service-conflict",
      type: "circulation",
      severity: "warning",
      title: "公众流线与后勤流线未分离",
      message: "可能产生人货交叉、开放时间冲突和首层界面干扰。"
    });
  }
  if (!circulation.cleanDirtySeparated) {
    conflicts.push({
      id: "clean-dirty-conflict",
      type: "circulation",
      severity: "warning",
      title: "洁净与污染流线未明确分离",
      message: "对设备、后勤或特殊工艺空间可能形成洁污冲突。"
    });
  }
  edges.forEach((edge) => {
    if (!["adjacent", "near"].includes(edge.strength)) return;
    const source = attributes[edge.source] || {};
    const targetAttributes = attributes[edge.target] || {};
    if (
      (source.noise === "high" && targetAttributes.publicity === "public") ||
      (targetAttributes.noise === "high" && source.publicity === "public")
    ) {
      conflicts.push({
        id: `noise-${edge.source}-${edge.target}`,
        type: "attribute",
        severity: "warning",
        title: "高噪声空间紧邻公共空间",
        message: "建议增加缓冲空间或降低两者联系强度。"
      });
    }
    if (
      (source.cleanliness === "dirty" &&
        targetAttributes.cleanliness === "clean") ||
      (targetAttributes.cleanliness === "dirty" &&
        source.cleanliness === "clean")
    ) {
      conflicts.push({
        id: `clean-${edge.source}-${edge.target}`,
        type: "attribute",
        severity: "blocking",
        title: "洁净空间与污染空间直接相邻",
        message: "需要设置隔离、缓冲或独立物流路径。"
      });
    }
  });
  return conflicts;
};

const validateFunctionConstructData = (data = {}) => {
  const primaryFunctions = asArray(data.functionTree).filter(
    (item) => Number(item.level) === 1 && hasValue(item.name)
  );
  const blockingItems = [];
  if (!primaryFunctions.length) {
    blockingItems.push({
      field: "functionTree",
      label: "一级功能分区",
      impact: "没有一级功能分区，无法建立空间组织和面积逻辑。"
    });
  }
  if (!data.circulationSystem?.coreDecisionConfirmed) {
    blockingItems.push({
      field: "circulationSystem",
      label: "核心动线判断",
      impact: "需要确认公众、内部与后勤流线的基本组织原则。"
    });
  }
  const conflicts = detectFunctionConflicts(data);
  return {
    blockingItems: [
      ...blockingItems,
      ...conflicts
        .filter((item) => item.severity === "blocking")
        .map((item) => ({
          field: item.type,
          label: item.title,
          impact: item.message
        }))
    ],
    conflicts
  };
};

const createInitialFunctionConstructData = (boundaryPackage = {}) => {
  const boundary = boundaryPackage.data || boundaryPackage;
  const identity = boundary.projectIdentity || {};
  const controls = boundary.hardControls || {};
  const targetGfaM2 =
    toNumber(controls.grossFloorAreaM2) ||
    (toNumber(controls.siteAreaM2) && toNumber(controls.floorAreaRatio)
      ? Math.round(
          toNumber(controls.siteAreaM2) * toNumber(controls.floorAreaRatio)
        )
      : null) ||
    toNumber(controls.siteAreaM2) ||
    10000;
  const parsed = parseAreaProgram(boundary.areaProgram, targetGfaM2);
  const template = getFunctionTemplate(identity.buildingType);
  const normEffects = deriveNormDownstreamEffects(boundary);
  const functionTree = parsed.length
    ? parsed
    : template.map(([name, category, percent], index) => ({
        id: `function-${index + 1}`,
        name,
        level: 1,
        parentId: null,
        category,
        areaM2: Math.round((targetGfaM2 * percent) / 100)
      }));
  const functionAttributes = Object.fromEntries(
    functionTree.map((item, index) => [
      item.id,
      defaultFunctionAttributes(item.category, index)
    ])
  );
  const primaryFunctions = functionTree.filter(
    (item) => Number(item.level) === 1
  );
  const edges = primaryFunctions.slice(1).map((item, index) => ({
    id: `relation-${index + 1}`,
    source: primaryFunctions[index].id,
    target: item.id,
    strength: index < 2 ? "adjacent" : "near"
  }));
  const data = {
    functionTree,
    areaAllocation: {
      targetGfaM2,
      allocatedM2: functionTree
        .filter(
          (item) =>
            !item.parentId ||
            !functionTree.some((parent) => parent.id === item.parentId)
        )
        .reduce((sum, item) => sum + Number(item.areaM2 || 0), 0),
      source: controls.grossFloorAreaM2
        ? "boundaryAnchor.grossFloorAreaM2"
        : "systemEstimate"
    },
    functionAttributes,
    relationshipGraph: { edges },
    bubbleGraph: buildBubbleGraph(functionTree),
    circulationSystem: {
      publicFlow: "independent",
      internalFlow: "controlled",
      serviceFlow: "independent",
      publicServiceSeparated: true,
      cleanDirtySeparated: true,
      coreDecisionConfirmed: false
    },
    conflicts: [],
    organizationPrinciples: [
      "核心功能形成清晰一级分区。",
      "公共空间与后勤空间保持可控分离。",
      "面积与功能关系在进入概念阶段前完成校核。",
      ...normEffects.function.map((item) => item.text)
    ],
    normDerivedConstraints: normEffects.function
  };
  data.conflicts = detectFunctionConflicts(data);
  return data;
};

const createEvidence = (source, label, detail) => ({
  id: `evidence-${Math.random().toString(36).slice(2, 9)}`,
  source,
  label,
  detail
});

const createInitialConceptStrategyData = (chain = {}) => {
  const boundary = chain.boundaryAnchorPackage?.data || {};
  const site = chain.siteAnalysisPackage?.data || {};
  const functions = chain.functionConstructPackage?.data || {};
  const normEffects = deriveNormDownstreamEffects(boundary);
  const problems = [];
  const addProblem = (problem) => {
    if (problems.length >= 5 || problems.some((item) => item.title === problem.title)) {
      return;
    }
    problems.push({
      id: `problem-${problems.length + 1}`,
      priority: problems.length < 2 ? "P0" : "P1",
      confirmed: true,
      ...problem
    });
  };

  asArray(boundary.conflicts).slice(0, 2).forEach((item) => {
    addProblem({
      category: "硬性约束",
      title: item.label || item.title || "强控指标存在冲突",
      description: item.message || item.impact || "需要在概念阶段回应前置硬性条件。",
      evidence: [
        createEvidence(
          "boundaryAnchor",
          "边界锚定",
          item.message || item.impact || item.label
        )
      ]
    });
  });
  normEffects.concept.slice(0, 2).forEach((item) => {
    addProblem({
      category: "规范约束",
      title: item.label,
      description: item.value,
      evidence: [
        createEvidence(
          "normConstraint",
          item.normTitle,
          `${item.label}：${item.value}`
        )
      ]
    });
  });
  asArray(site.siteLimits).slice(0, 2).forEach((item) => {
    addProblem({
      category: "场地限制",
      title: String(item).slice(0, 26),
      description: String(item),
      evidence: [createEvidence("siteAnalysis", "场地解析", String(item))]
    });
  });
  asArray(functions.conflicts).slice(0, 2).forEach((item) => {
    addProblem({
      category: "功能冲突",
      title: item.title || "功能与动线存在冲突",
      description: item.message || "需要通过空间组织化解功能冲突。",
      evidence: [
        createEvidence(
          "functionConstruct",
          "功能建构",
          item.message || item.title
        )
      ]
    });
  });
  if (
    functions.circulationSystem?.publicServiceSeparated &&
    problems.length < 3
  ) {
    addProblem({
      category: "流线组织",
      title: "公共开放与后勤运维需要协同分离",
      description:
        "公众、内部与后勤流线应保持清晰边界，同时避免削弱公共空间连续性。",
      evidence: [
        createEvidence(
          "functionConstruct",
          "功能建构",
          "核心动线判断要求公众流线与后勤流线分离。"
        )
      ]
    });
  }
  asArray(site.siteOpportunities).slice(0, 2).forEach((item) => {
    if (problems.length >= 4) return;
    addProblem({
      category: "场地机会",
      title: `如何利用${String(item).replace(/[。；]/g, "").slice(0, 18)}`,
      description: `场地机会需要转化为空间组织和建筑界面策略：${item}`,
      evidence: [createEvidence("siteAnalysis", "场地解析", String(item))]
    });
  });
  if (!problems.length) {
    addProblem({
      category: "综合组织",
      title: "如何统合项目约束、场地关系与功能结构",
      description:
        "需要建立一个可同时回应硬性边界、场地机会和功能动线的核心组织方式。",
      evidence: [
        createEvidence(
          "systemInference",
          "系统推断",
          "前序数据未形成显性冲突，系统按综合组织问题建立概念起点。"
        )
      ]
    });
  }

  const strategyByCategory = {
    硬性约束: ["边界内聚", "将强控指标转译为清晰的体量边界和退让层级。"],
    规范约束: ["约束转译", "将已确认的规范条件转化为空间边界、流线和体量控制。"],
    场地限制: ["缓冲与转向", "通过退让、缓冲界面和空间转向降低外部干扰。"],
    功能冲突: ["分层解耦", "以水平分区和垂直分层化解功能、洁污与动静冲突。"],
    流线组织: ["双系统组织", "建立公众开放系统与后勤运维系统的可控分离。"],
    场地机会: ["界面激活", "将主要场地资源转化为公共界面、视线和开放空间序列。"],
    综合组织: ["主脊串联", "以连续公共主脊串联功能组团，并组织多层次空间关系。"]
  };
  const designStrategies = problems.map((problem, index) => {
    const preset = strategyByCategory[problem.category] || strategyByCategory.综合组织;
    return {
      id: `strategy-${index + 1}`,
      title: preset[0],
      description: preset[1],
      problemIds: [problem.id],
      impactAreas: ["总平布局", "体块组织", "功能关系"],
      actions: [
        "在形态落位阶段记录对应体块操作。",
        "在方案比选阶段校核该策略的落实程度。"
      ],
      confirmed: true
    };
  });
  const strategyBindings = designStrategies.map((strategy) => ({
    id: `binding-${strategy.id}`,
    problemId: strategy.problemIds[0],
    strategyId: strategy.id
  }));
  const primary = problems[0];
  const mainStrategy = designStrategies[0];
  const projectType =
    boundary.projectIdentity?.buildingType?.split("/")[0]?.trim() || "复合项目";
  const conceptName =
    primary.category === "场地机会"
      ? "场地脉络"
      : primary.category === "流线组织"
        ? "双脉协同"
        : "边界协同体";
  return {
    coreProblems: problems,
    problemEvidence: problems.flatMap((problem) =>
      problem.evidence.map((evidence) => ({
        ...evidence,
        problemId: problem.id
      }))
    ),
    designStrategies,
    strategyBindings,
    conceptCandidates: [
      {
        id: "concept-a",
        name: conceptName,
        statement: `${mainStrategy.title}回应“${primary.title}”，形成兼顾约束、开放性与功能效率的${projectType}空间原型。`
      },
      {
        id: "concept-b",
        name: "多层公共地景",
        statement:
          "以连续公共空间连接场地资源和核心功能，通过分层组织控制后勤与设备影响。"
      },
      {
        id: "concept-c",
        name: "组团与共享主脊",
        statement:
          "以共享主脊串联多个功能组团，在清晰分区基础上形成可生长的空间关系。"
      }
    ],
    selectedConceptId: "concept-a",
    conceptName,
    conceptStatement: `${mainStrategy.title}回应“${primary.title}”，形成兼顾约束、开放性与功能效率的${projectType}空间原型。`,
    conceptNarrative: `概念从“${primary.title}”出发，以“${mainStrategy.title}”作为主策略。后续形态操作需要逐项引用问题依据和策略目标，避免概念与方案脱节。`,
    conceptDiagram: {
      nodes: problems.map((problem) => ({
        id: problem.id,
        label: problem.title,
        type: "problem"
      })).concat(
        designStrategies.map((strategy) => ({
          id: strategy.id,
          label: strategy.title,
          type: "strategy"
        })),
        [{ id: "concept", label: conceptName, type: "concept" }]
      ),
      links: strategyBindings.flatMap((binding) => [
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
    }
  };
};

const isGenericConcept = (name = "", statement = "") => {
  const text = `${name} ${statement}`.trim();
  if (!text) return true;
  const genericWords = ["绿色", "生态", "人本", "融合", "智慧", "共生"];
  const meaningfulLength = text.replace(/\s/g, "").length;
  return meaningfulLength < 10 || genericWords.some((word) => text === word);
};

const validateConceptStrategyData = (data = {}) => {
  const problems = asArray(data.coreProblems).filter(
    (item) => item.confirmed !== false
  );
  const strategies = asArray(data.designStrategies).filter(
    (item) => item.confirmed !== false
  );
  const bindings = asArray(data.strategyBindings);
  const blockingItems = [];
  if (!problems.length) {
    blockingItems.push({
      field: "coreProblems",
      label: "核心问题",
      impact: "至少需要确认一个有依据的核心问题。"
    });
  }
  problems.forEach((problem) => {
    if (!asArray(problem.evidence).length) {
      blockingItems.push({
        field: `problemEvidence.${problem.id}`,
        label: `问题依据：${problem.title}`,
        impact: "核心问题必须引用边界、场地、功能或用户目标作为依据。"
      });
    }
    const bound = bindings.some(
      (binding) =>
        binding.problemId === problem.id &&
        strategies.some((strategy) => strategy.id === binding.strategyId)
    );
    if (!bound) {
      blockingItems.push({
        field: `strategyBinding.${problem.id}`,
        label: `策略绑定：${problem.title}`,
        impact: "每个已确认核心问题必须至少绑定一个设计策略。"
      });
    }
  });
  if (isGenericConcept(data.conceptName, data.conceptStatement)) {
    blockingItems.push({
      field: "conceptStatement",
      label: "核心概念",
      impact: "概念名称和说明需要回应具体问题，不能只使用空泛概念词。"
    });
  }
  return { blockingItems };
};

const adaptSitePackage = (site = {}) => {
  const insights = deriveSiteInsights(site);
  return {
    siteLocation: clone(site.location || site.siteLocation || null),
    redline: clone(site.boundary || site.redline || null),
    accessPoints: asArray(site.entrances || site.accessPoints),
    poiContext: asObject(site.surroundings || site.poiContext),
    analysisRadiusM: site.analysisRadiusM || site.radius || null,
    siteLimits: insights.siteLimits,
    siteOpportunities: insights.siteOpportunities,
    swot: insights.swot,
    climateNotes: asArray(site.climateNotes),
    designImpactHints: insights.designImpactHints
  };
};

const inferSiteStatus = (site = {}) => {
  const location = site.location || site.siteLocation;
  const redline = site.boundary || site.redline;
  if (location && redline?.geometry?.length >= 3) {
    return redline.status === "已确认" || redline.status === "confirmed"
      ? "confirmed"
      : "ready";
  }
  if (location || redline) return "partial";
  return "empty";
};

const legacyAdapters = Object.freeze({
  boundaryAnchorPackage(legacy = {}, context = {}) {
    const brief = legacy.projectData || legacy.brief || legacy;
    const validation = buildBoundaryValidation(brief);
    const skipped = asArray(brief.validationSkippedDetails);
    return {
      completionStatus: inferBoundaryStatus(brief),
      confidenceLevel:
        skipped.length || validation.missingItems.length ? "medium" : "high",
      blockingItems: [
        ...validation.blockingItems,
        ...validation.conflicts.filter((item) => item.severity === "blocking"),
        ...asArray(context.blockingItems)
      ],
      assumptions: skipped.map((item) => ({
        key: item.key || item.field,
        value: item.state || "待确认",
        reason: item.impact || "",
        source: "userInput"
      })),
      sourceTrace: makeSourceTrace(
        context.source === "import" ? "importedBrief" : "userInput",
        [
          "projectIdentity",
          "hardControls",
          "areaProgram",
          "functionRequirements",
          "normConstraints",
          "missingItems",
          "conflicts",
          "designConstraintTable"
        ]
      ),
      downstreamHints: {
        validationSkipped: asObject(brief.validationSkipped)
      },
      data: buildBoundaryData(brief)
    };
  },

  siteAnalysisPackage(legacy = {}) {
    const site =
      legacy.siteIntelligencePackage ||
      legacy.siteAnalysisPackage ||
      legacy.sitePackage ||
      legacy;
    return {
      completionStatus: inferSiteStatus(site),
      confidenceLevel:
        site?.boundary?.geometry?.length >= 3 ? "high" : "medium",
      sourceTrace: makeSourceTrace("mapAPI", [
        "siteLocation",
        "redline",
        "accessPoints",
        "poiContext",
        "siteLimits",
        "siteOpportunities",
        "swot",
        "designImpactHints"
      ]),
      data: adaptSitePackage(site)
    };
  },

  functionConstructPackage(legacy = {}) {
    const project = legacy.projectData || legacy;
    const spatial = legacy.spatialIntentAnalysis || legacy.spatialIntent || {};
    const answers = asObject(legacy.followUpAnswers || legacy.answers);
    const structuredAllocation = asObject(legacy.areaAllocation);
    const functionData = {
      functionTree: asArray(legacy.functionTree),
      areaAllocation:
        Object.keys(structuredAllocation).length > 0
          ? structuredAllocation
          : hasValue(project.areaProgram)
            ? { legacyText: project.areaProgram }
            : {},
      functionAttributes: asObject(legacy.functionAttributes),
      relationshipGraph: asObject(legacy.relationshipGraph),
      bubbleGraph: asObject(legacy.bubbleGraph),
      circulationSystem: asObject(legacy.circulationSystem),
      conflicts: asArray(legacy.conflicts),
      organizationPrinciples: asArray(legacy.organizationPrinciples),
      legacySpatialIntent: clone(spatial),
      legacyAnswers: answers
    };
    const hasContent =
      functionData.functionTree.length > 0 ||
      Object.keys(functionData.areaAllocation).length > 0 ||
      Object.keys(spatial).length > 0 ||
      Object.keys(answers).length > 0;
    const validation = validateFunctionConstructData(functionData);
    return {
      completionStatus: hasContent
        ? validation.blockingItems.length
          ? "partial"
          : "ready"
        : "empty",
      confidenceLevel: hasContent ? "medium" : "low",
      blockingItems: validation.blockingItems,
      sourceTrace: makeSourceTrace("legacyMigration", [
        "functionTree",
        "areaAllocation",
        "functionAttributes",
        "relationshipGraph",
        "bubbleGraph",
        "circulationSystem",
        "conflicts",
        "legacySpatialIntent",
        "legacyAnswers"
      ]),
      data: functionData
    };
  },

  conceptStrategyPackage(legacy = {}) {
    const problems =
      legacy.problemAnalysis || legacy.analyzedData || legacy.problemResult || {};
    const strategy =
      legacy.strategyMatchAnalysis || legacy.strategyPackage || {};
    const hasProblems =
      asArray(problems.problemCards || problems.issues).length > 0;
    const hasStrategy =
      asArray(strategy.strategyCards || strategy.strategies).length > 0;
    const structuredData = {
      coreProblems: asArray(problems.problemCards || problems.issues),
      problemEvidence: asArray(problems.problemEvidence),
      designStrategies: asArray(
        strategy.strategyCards || strategy.strategies
      ),
      conceptName: strategy.conceptName || "",
      conceptStatement:
        strategy.strategyDirection || strategy.conceptStatement || "",
      conceptNarrative: strategy.conceptNarrative || "",
      conceptCandidates: asArray(strategy.conceptCandidates),
      selectedConceptId: strategy.selectedConceptId || null,
      strategyBindings: asArray(strategy.strategyBindings),
      conceptDiagram: asObject(strategy.conceptDiagram),
      legacyProblemAnalysis: clone(problems),
      legacyStrategyAnalysis: clone(strategy)
    };
    const validation = validateConceptStrategyData(structuredData);
    return {
      completionStatus: hasStrategy
        ? validation.blockingItems.length
          ? "partial"
          : "ready"
        : hasProblems
          ? "partial"
          : "empty",
      confidenceLevel: hasStrategy ? "high" : hasProblems ? "medium" : "low",
      blockingItems: validation.blockingItems,
      sourceTrace: makeSourceTrace("legacyMigration", [
        "coreProblems",
        "designStrategies",
        "strategyBindings"
      ]),
      data: structuredData
    };
  },

  massingPlacementPackage(legacy = {}) {
    const concept =
      legacy.prototypeGenerationAnalysis ||
      legacy.conceptPlanPackage ||
      legacy.prototype ||
      legacy;
    const options = asArray(concept.prototypes || concept.massingOptions);
    return {
      completionStatus: options.length >= 2 ? "ready" : options.length ? "partial" : "empty",
      confidenceLevel: options.length >= 2 ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "massingOptions",
        "metricCheck",
        "programPlacement"
      ]),
      data: {
        entryLayout: asObject(concept.entryLayout),
        massingOptions: options,
        operationChain: asArray(concept.operationChain),
        metricCheck: asObject(concept.baseline || concept.metricCheck),
        sitePlanDraft: clone(concept.sitePlanDraft || concept.diagramData || null),
        programPlacement: asObject(concept.programPlacement),
        legacyConceptPlan: clone(concept)
      }
    };
  },

  finalConceptPackage(legacy = {}) {
    const finalData =
      legacy.finalConceptPackage ||
      legacy.explanationOutput ||
      legacy.outcome ||
      legacy;
    const selected = finalData.selectedOption || finalData.selectedPrototypeId;
    return {
      completionStatus: selected ? "confirmed" : "empty",
      confidenceLevel: selected ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "selectedOption",
        "validationRecords",
        "exportReport"
      ]),
      data: {
        optionScores: asArray(finalData.optionScores),
        hardCheckResults: asArray(finalData.hardCheckResults),
        selectedOption: clone(selected || null),
        validationRecords: asArray(finalData.validationRecords),
        riskFlags: asArray(finalData.riskFlags),
        exportReport: clone(finalData.exportReport || null),
        legacyOutcome: clone(finalData)
      }
    };
  }
});

const migrateLegacyProject = (legacy = {}, context = {}) => {
  const chain = createProjectDataChain({
    projectId: legacy.projectId,
    metadata: {
      migratedFromLegacy: true,
      migratedAt: now(),
      legacyInputSource: context.source || legacy.projectSource || "manual"
    }
  });

  PACKAGE_ORDER.forEach((packageName) => {
    const adapted = legacyAdapters[packageName](legacy, context);
    chain[packageName] = {
      ...chain[packageName],
      ...adapted,
      packageName,
      step: PACKAGE_STEPS[packageName],
      data: asObject(adapted.data)
    };
  });

  chain.updatedAt = now();
  return chain;
};

const createMemoryStorage = () => {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    }
  };
};

const resolveStorage = () => {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Browser privacy modes can deny storage access.
  }
  return createMemoryStorage();
};

class ProjectDataChainStore {
  constructor(options = {}) {
    this.storage = options.storage || resolveStorage();
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.listeners = new Set();
    this.state = this.load() || createProjectDataChain();
  }

  load() {
    try {
      const saved = this.storage.getItem(this.storageKey);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return createProjectDataChain(parsed);
    } catch (error) {
      console.warn("[ARCHICONCEPT data chain] Failed to load saved data.", error);
      return null;
    }
  }

  persist() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  emit(type, detail = {}) {
    const event = { type, detail, state: this.getState() };
    this.listeners.forEach((listener) => listener(event));
    if (typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(
        new CustomEvent("archiconcept:data-chain-change", { detail: event })
      );
    }
  }

  getState() {
    return clone(this.state);
  }

  getPackage(packageName) {
    this.assertPackage(packageName);
    return clone(this.state[packageName]);
  }

  assertPackage(packageName) {
    if (!PACKAGE_ORDER.includes(packageName)) {
      throw new Error(`Unknown ARCHICONCEPT package: ${packageName}`);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(seed = {}) {
    this.state = createProjectDataChain(seed);
    this.persist();
    this.emit("reset");
    return this.getState();
  }

  replace(nextState, options = {}) {
    this.state = createProjectDataChain(nextState);
    this.recordRevision("replace", options.reason || "Replace project data chain");
    this.persist();
    this.emit("replace", { reason: options.reason || "" });
    return this.getState();
  }

  setCurrentStep(step) {
    const normalized = Math.min(6, Math.max(1, Number(step) || 1));
    this.state.currentStep = normalized;
    this.state.updatedAt = now();
    this.persist();
    this.emit("step", { step: normalized });
  }

  recordRevision(type, reason, packageName = null, metadata = {}) {
    this.state.revision += 1;
    this.state.updatedAt = now();
    this.state.revisionHistory.push({
      revision: this.state.revision,
      type,
      packageName,
      reason,
      timestamp: this.state.updatedAt,
      ...asObject(metadata)
    });
    if (this.state.revisionHistory.length > 100) {
      this.state.revisionHistory = this.state.revisionHistory.slice(-100);
    }
  }

  markDownstreamStale(packageName, reason, options = {}) {
    this.assertPackage(packageName);
    const targets = STALE_DEPENDENCIES[packageName] || [];
    const timestamp = now();
    targets.forEach((targetName) => {
      const target = this.state[targetName];
      if (target.completionStatus === "empty" && !options.includeEmpty) return;
      target.stale = true;
      target.updatedAt = timestamp;
      target.staleReasons = [
        ...target.staleReasons.filter(
          (item) => item.sourcePackage !== packageName
        ),
        {
          sourcePackage: packageName,
          reason,
          timestamp
        }
      ];
    });
    return targets;
  }

  updatePackage(packageName, patch = {}, options = {}) {
    this.assertPackage(packageName);
    const current = this.state[packageName];
    const nextData = options.replaceData
      ? asObject(patch.data)
      : { ...asObject(current.data), ...asObject(patch.data) };
    const timestamp = now();
    const sourceTrace = mergeSourceTrace(
      current.sourceTrace,
      patch.sourceTrace ||
        makeSourceTrace(
          options.source || "systemInference",
          options.changedFields || Object.keys(asObject(patch.data)),
          options.sourceDetail
        )
    );

    const next = {
      ...current,
      ...asObject(patch),
      packageName,
      step: PACKAGE_STEPS[packageName],
      completionStatus: normalizeCompletionStatus(
        patch.completionStatus,
        nextData
      ),
      confidenceLevel: normalizeConfidence(
        patch.confidenceLevel || current.confidenceLevel
      ),
      blockingItems:
        patch.blockingItems === undefined
          ? current.blockingItems
          : asArray(patch.blockingItems),
      assumptions:
        patch.assumptions === undefined
          ? current.assumptions
          : asArray(patch.assumptions),
      downstreamHints:
        patch.downstreamHints === undefined
          ? current.downstreamHints
          : {
              ...asObject(current.downstreamHints),
              ...asObject(patch.downstreamHints)
            },
      sourceTrace,
      data: nextData,
      stale: false,
      staleReasons: [],
      revision: current.revision + 1,
      updatedAt: timestamp,
      confirmedAt:
        patch.completionStatus === "confirmed"
          ? timestamp
          : patch.confirmedAt === undefined
            ? current.confirmedAt
            : patch.confirmedAt
    };

    const meaningfulChange =
      JSON.stringify(current.data) !== JSON.stringify(next.data) ||
      current.completionStatus !== next.completionStatus ||
      JSON.stringify(current.assumptions) !== JSON.stringify(next.assumptions) ||
      JSON.stringify(current.blockingItems) !==
        JSON.stringify(next.blockingItems);

    this.state[packageName] = next;
    const reason =
      options.reason || `${packageName} updated from ${options.source || "system"}`;
    const staleTargets =
      meaningfulChange && options.invalidateDownstream !== false
        ? this.markDownstreamStale(packageName, reason)
        : [];
    this.recordRevision("package-update", reason, packageName, {
      staleTargets
    });
    this.persist();
    this.emit("package-update", { packageName, staleTargets, reason });
    return this.getPackage(packageName);
  }

  confirmPackage(packageName, options = {}) {
    const current = this.getPackage(packageName);
    return this.updatePackage(
      packageName,
      {
        completionStatus: "confirmed",
        confidenceLevel: options.confidenceLevel || current.confidenceLevel,
        blockingItems: options.blockingItems || current.blockingItems,
        data: current.data
      },
      {
        source: options.source || "userInput",
        reason: options.reason || `${packageName} confirmed`,
        invalidateDownstream: options.invalidateDownstream
      }
    );
  }

  migrateLegacy(legacy, context = {}) {
    const migrated = migrateLegacyProject(legacy, context);
    this.state = migrated;
    this.recordRevision(
      "legacy-migration",
      context.reason || "Migrate legacy project state"
    );
    this.persist();
    this.emit("legacy-migration");
    return this.getState();
  }

  syncLegacy(packageName, legacy, context = {}) {
    this.assertPackage(packageName);
    const adapted = legacyAdapters[packageName](legacy, context);
    return this.updatePackage(packageName, adapted, {
      replaceData: context.replaceData !== false,
      source: context.source || "legacyMigration",
      reason: context.reason || `Sync legacy data into ${packageName}`,
      invalidateDownstream: context.invalidateDownstream
    });
  }
}

const store = new ProjectDataChainStore();

let pendingProjectSync = null;

const bridge = {
  scheduleProjectBrief(projectData, source = "manual") {
    globalThis.clearTimeout?.(pendingProjectSync);
    pendingProjectSync = globalThis.setTimeout?.(
      () => this.syncProjectBrief(projectData, source),
      160
    );
  },

  syncProjectBrief(projectData, source = "manual") {
    store.syncLegacy(
      "boundaryAnchorPackage",
      { projectData },
      {
        source: source === "import" ? "importedBrief" : "userInput",
        reason: "Project brief changed",
        replaceData: false
      }
    );
    if (projectData?.siteIntelligencePackage) {
      store.syncLegacy(
        "siteAnalysisPackage",
        projectData.siteIntelligencePackage,
        {
          source: "mapAPI",
          reason: "Site editor data changed"
        }
      );
    }
    return store.getState();
  },

  syncProblemAnalysis(problemAnalysis, answers = {}) {
    store.syncLegacy(
      "conceptStrategyPackage",
      { problemAnalysis },
      {
        source: "systemInference",
        reason: "Legacy problem analysis changed"
      }
    );
    if (Object.keys(asObject(answers)).length) {
      store.syncLegacy(
        "functionConstructPackage",
        { followUpAnswers: answers },
        {
          source: "userInput",
          reason: "Legacy problem answers changed"
        }
      );
    }
  },

  syncSpatialIntent(spatialIntentAnalysis, answers = {}) {
    store.syncLegacy(
      "functionConstructPackage",
      { spatialIntentAnalysis, followUpAnswers: answers },
      {
        source: "systemInference",
        reason: "Legacy spatial intent changed"
      }
    );
  },

  syncStrategy(strategyMatchAnalysis) {
    store.syncLegacy(
      "conceptStrategyPackage",
      { strategyMatchAnalysis },
      {
        source: "systemInference",
        reason: "Legacy strategy package changed"
      }
    );
  },

  syncMassing(prototypeGenerationAnalysis) {
    store.syncLegacy(
      "massingPlacementPackage",
      { prototypeGenerationAnalysis },
      {
        source: "systemInference",
        reason: "Legacy concept prototype changed"
      }
    );
  },

  syncFinal(finalConceptPackage) {
    store.syncLegacy(
      "finalConceptPackage",
      { finalConceptPackage },
      {
        source: "manualEdit",
        reason: "Final concept selection changed"
      }
    );
  }
};

export {
  DATA_CHAIN_SCHEMA_VERSION,
  PACKAGE_ORDER,
  PACKAGE_STEPS,
  STALE_DEPENDENCIES,
  ProjectDataChainStore,
  bridge,
  createPackage,
  createProjectDataChain,
  legacyAdapters,
  makeSourceTrace,
  migrateLegacyProject,
  recommendNormConstraints,
  buildNormRequirementDefinitions,
  resolveNormDesignConstraints,
  estimateNormDesignConstraint,
  deriveNormDownstreamEffects,
  buildBoundaryValidation,
  buildDesignConstraintTable,
  deriveSiteInsights,
  splitRequirementItems,
  parseAreaProgram,
  serializeAreaProgram,
  calculateAreaProgramItems,
  buildAreaProgramModel,
  createInitialFunctionConstructData,
  buildBubbleGraph,
  detectFunctionConflicts,
  validateFunctionConstructData,
  createInitialConceptStrategyData,
  validateConceptStrategyData,
  isGenericConcept,
  store
};

globalThis.ARCHICONCEPT_DATA_CHAIN = Object.freeze({
  schemaVersion: DATA_CHAIN_SCHEMA_VERSION,
  packageOrder: PACKAGE_ORDER,
  packageSteps: PACKAGE_STEPS,
  staleDependencies: STALE_DEPENDENCIES,
  store,
  bridge,
  createProjectDataChain,
  migrateLegacyProject,
  legacyAdapters
});
