export function parseBriefFallback(text = "") {
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };

  const projectName = pick([/(?:项目名称|工程名称|项目名)[:：\s]*([^\n。；]+)/, /([^\n。；]{4,40}(?:建筑|中心|园区|综合体|地景))/]);
  const buildingType = pick([/(?:建筑类型|项目类型|类型)[:：\s]*([^\n。；]+)/]);
  const location = pick([/(?:项目地点|建设地点|基地位置|区位|地点)[:：\s]*([^\n。；]+)/]);
  const siteArea = pick([/(?:场地面积|用地面积|基地面积)[:：\s]*([\d,.]+)\s*(?:㎡|m2|平方米|平米)?/i]);
  const far = pick([/(?:容积率|FAR)[:：\s]*([\d.]+)/i]);
  const buildingDensity = pick([/(?:建筑密度)[:：\s]*([\d.]+%?)/]);
  const greenRatio = pick([/(?:绿地率|绿化率)[:：\s]*([\d.]+%?)/]);
  const heightLimit = pick([/(?:建筑限高|限高|高度)[:：\s]*([\d.]+\s*(?:m|米)?)/i]);
  const gfa = pick([/(?:总建筑面积|计容面积|建筑面积)[:：\s]*([\d,.]+)\s*(?:㎡|m2|平方米|平米)?/i]);
  const floors = pick([/(?:层数|层数范围)[:：\s]*([^\n。；]+)/]);

  return {
    projectName,
    buildingType,
    location,
    siteArea,
    far,
    buildingDensity,
    greenRatio,
    heightLimit,
    gfa,
    floors,
    buildableBoundaryArea: "",
    siteInfo: pick([/(?:场地条件|基地条件|现状条件)[:：\s]*([^\n]+)/]) || text.slice(0, 240),
    program: pick([/(?:核心功能需求|功能需求|建设内容)[:：\s]*([^\n]+)/]),
    targetUsers: pick([/(?:使用人群|目标人群|服务对象)[:：\s]*([^\n]+)/]),
    areaProgram: pick([/(?:面积组成|功能面积|面积配比)[:：\s]*([^\n]+)/]),
    keywords: Array.from(new Set((text.match(/[\u4e00-\u9fa5A-Za-z]{2,12}/g) || []).slice(0, 12))),
    missingFields: [],
    reviewItems: ["请核对规划指标、功能面积与场地边界条件。"],
    taskJudgement: "已按本地规则提取任务书信息，建议结合原始任务书复核。"
  };
}

export function problemFallback(input = {}) {
  const type = input.type || input.buildingType || "建筑项目";
  const cards = [
    {
      id: "P01",
      category: "规划约束",
      title: "指标与场地边界需要闭合",
      description: "当前信息涉及面积、容积率、限高、密度等约束，需要先形成可追溯的指标校验链。",
      severity: "high",
      tags: ["指标校验", "红线约束"]
    },
    {
      id: "P02",
      category: "功能组织",
      title: "复合功能之间存在流线分级需求",
      description: "公共、运营、后勤和设备流线需要分层组织，避免互相穿越影响。",
      severity: "medium",
      tags: ["流线", "分区"]
    },
    {
      id: "P03",
      category: "城市界面",
      title: "体量与公共界面需要协调",
      description: "建筑体量、开放界面与周边城市空间之间需要建立更清晰的空间过渡。",
      severity: "medium",
      tags: ["界面", "开放性"]
    }
  ];
  return {
    buildingType: type,
    issues: cards,
    hiddenIssues: [],
    problemCards: cards,
    summaryPanel: {
      identifiedCount: cards.length,
      constraintTags: ["规划指标", "场地边界", "功能流线"],
      suggestedFocusTags: ["空间组织", "公共界面", "技术约束"],
      informationLevel: "可进入前期推演",
      status: "ready",
      shortNote: "已识别主要设计矛盾，可进入空间意图判断。"
    },
    followUpQuestions: {
      primary: [
        {
          id: "priority",
          question: "本轮推演优先控制哪一类问题？",
          options: [
            { label: "功能与流线", value: "flow" },
            { label: "城市界面", value: "interface" },
            { label: "环境与韧性", value: "environment" }
          ]
        }
      ],
      secondary: []
    }
  };
}

export function spatialFallback() {
  return {
    intentCards: [
      {
        title: "安全清晰的核心组织",
        description: "以明确的核心空间承载主要功能，并将公共与服务流线分离。",
        priority: "高优先级",
        highlight: true,
        tags: ["核心", "分流"]
      },
      {
        title: "连续开放的城市界面",
        description: "通过退台、灰空间和公共路径建立与城市的连续关系。",
        priority: "中高优先级",
        tags: ["界面", "开放"]
      },
      {
        title: "环境响应型剖面组织",
        description: "用剖面高差、遮阴、通风与屋面绿化回应场地气候条件。",
        priority: "中优先级",
        tags: ["剖面", "生态"]
      }
    ],
    summaryPanel: {
      mainIntent: "核心分流与公共界面并置",
      secondaryIntent: "环境响应型立体组织",
      spatialDirection: "以清晰核心组织为底盘，叠加开放公共界面。"
    },
    inputReview: {
      problemSummaries: [
        { title: "指标控制", description: "保持面积与高度约束可追溯。" },
        { title: "功能组织", description: "优先处理公共、后勤与运营流线关系。" }
      ]
    }
  };
}

export function strategyFallback() {
  return {
    strategyCards: [
      {
        title: "分层复合组织策略",
        desc: "将公共访问、主要功能、后勤设备分层叠合，减少交叉干扰。",
        status: "主导策略",
        tags: ["分层", "复合"],
        elements: ["公共首层", "服务背廊", "核心功能舱"]
      },
      {
        title: "城市界面缓冲策略",
        desc: "用退台、檐下灰空间和开放平台削弱大体量对城市界面的压迫。",
        status: "辅助策略",
        tags: ["界面", "退台"],
        elements: ["灰空间", "城市看台", "开放界面"]
      },
      {
        title: "环境韧性剖面策略",
        desc: "通过屋面绿化、遮阴通风和雨水组织形成可解释的环境响应。",
        status: "辅助策略",
        tags: ["韧性", "剖面"],
        elements: ["绿化屋面", "通风廊道", "雨水花园"]
      }
    ],
    comparisonCriteria: [
      { name: "空间组织对位率", weight: "30%", description: "功能分区与任务书目标的吻合程度。" },
      { name: "流线隔离清晰度", weight: "25%", description: "公共、后勤、运营流线互不干扰的程度。" },
      { name: "城市界面友好度", weight: "25%", description: "建筑对公共空间开放与缓冲的质量。" },
      { name: "环境响应完整度", weight: "20%", description: "气候、雨洪、遮阴与绿化策略的系统性。" }
    ],
    selections: {
      priority: "系统平衡匹配",
      combo: "综合平衡型"
    },
    strategyDirection: "以分层复合为主线，结合城市界面缓冲与环境韧性剖面形成概念生成依据。",
    referenceCases: []
  };
}

export function conceptFallback(input = {}) {
  const focus = input.focusDirection || "along_street";
  return {
    baseline: {
      heightLimit: input?.inputBrief?.height || "按任务书限高控制",
      siteArea: input?.inputBrief?.area || "",
      far: input?.inputBrief?.far || ""
    },
    diagramData: {
      legend: [
        { type: "mainZones", label: "核心主功能区", color: "#F0F9FF" },
        { type: "supportZones", label: "支撑管理配套", color: "#F3F4F6" },
        { type: "publicZones", label: "公共展示与城市界面", color: "#FFEDD5" },
        { type: "serviceZones", label: "后勤设备与运维", color: "#FEE2E2" },
        { type: "openSpaceZones", label: "屋面及半室外开放空间", color: "#DCFCE7" }
      ]
    },
    prototypes: [
      {
        id: "Case 01",
        title: focus === "along_street" ? "沿街界面强化型" : "综合平衡型",
        description: "以连续公共界面和清晰核心分区组织概念方案。",
        tags: ["公共界面", "核心分区", "复合剖面"]
      }
    ],
    mainZones: [{ name: "核心主功能区", ratio: "40%" }],
    supportZones: [{ name: "管理与支撑空间", ratio: "18%" }],
    publicZones: [{ name: "展示与公共活动空间", ratio: "20%" }],
    serviceZones: [{ name: "后勤设备空间", ratio: "14%" }],
    openSpaceZones: [{ name: "屋面地景与半室外空间", ratio: "8%" }],
    narrative: "方案以可解释的功能分区、流线控制和公共界面组织形成概念原型。"
  };
}
