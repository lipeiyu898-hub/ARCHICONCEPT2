const sourceLink = document.getElementById("archiconcept-app-source");

if (!sourceLink) {
  throw new Error("ARCHICONCEPT app source link is missing.");
}

const PREFLIGHT_FIELD_META = {
  name: ["项目名称", "当前为空", "无法建立项目身份与问题归属。", "id-section-a"],
  type: ["建筑类型", "未选择", "无法匹配对应建筑类型的规范与典型问题。", "id-section-a"],
  location: ["项目地点", "未填写且场地定位未确认", "无法判断场地背景与外部约束。", "id-section-a"],
  area: ["用地面积", "未填写或无有效红线面积", "无法进行容量、密度与体量判断。", "id-section-a"],
  programAndSite: ["功能需求与场地问题", "均未填写", "无法识别核心任务、场地矛盾和设计风险。", "id-section-c"],
  far: ["容积率", "未填写", "可能影响开发强度与容量判断。", "id-section-b"],
  gfa: ["总建筑面积", "未填写", "可能影响容量判断、功能分配和体量推导。", "id-section-b"],
  height: ["建筑高度", "未填写", "可能影响高度控制、层级组织和城市界面判断。", "id-section-b"],
  floors: ["层数范围", "未填写", "可能影响垂直功能组织和交通核判断。", "id-section-b"],
  redLineArea: ["红线面积", "未确认", "可能影响边界退让、容量和可建设范围判断。", "id-section-b"],
  siteEntrance: ["场地入口", "未标注", "可能影响人车分流、后勤组织和主要到达面判断。", "id-section-c"],
  contextAnalysis: ["周边分析", "未完成", "可能遗漏交通、公共服务、敏感点与环境关系。", "id-section-c"],
  planningRestrictions: ["规划限制条件", "未填写", "可能遗漏退界、日照、消防或城市设计控制。", "id-section-c"],
  parking: ["停车条件", "未说明", "可能影响车行入口、地下空间和落客组织。", "id-section-c"],
  pedestrianFlow: ["人流条件", "未说明", "可能影响公共入口、流线分级与空间开放度。", "id-section-c"],
  accessConditions: ["出入口条件", "未说明", "可能影响主次入口、后勤和消防组织。", "id-section-c"],
  setback: ["退界条件", "未说明", "可能影响可建范围、沿街界面和消防间距。", "id-section-c"]
};

const AREA_UNIT_PATTERN = "ha|公顷|㎡|m²|m2|平方米";

const parseAreaValue = (value) => {
  const original = String(value ?? "").trim();
  if (!original) {
    return { empty: true, valid: false, values: [], value: null, max: null };
  }

  const text = original
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/平方公尺/gi, "㎡");
  const match = text.match(
    new RegExp(
      `^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))(${AREA_UNIT_PATTERN})?(?:[–—~至到-]([+-]?(?:\\d+\\.?\\d*|\\.\\d+))(${AREA_UNIT_PATTERN})?)?$`,
      "i"
    )
  );

  if (!match) {
    return { empty: false, valid: false, values: [], value: null, max: null };
  }

  const sharedUnit = match[4] || match[2] || "㎡";
  const convert = (number, unit) => {
    const normalizedUnit = String(unit || sharedUnit).toLowerCase();
    const multiplier =
      normalizedUnit === "ha" || normalizedUnit === "公顷" ? 10000 : 1;
    return Number(number) * multiplier;
  };
  const values = [convert(match[1], match[2])];
  if (match[3] !== undefined) values.push(convert(match[3], match[4]));

  if (values.some((number) => !Number.isFinite(number))) {
    return { empty: false, valid: false, values: [], value: null, max: null };
  }

  return {
    empty: false,
    valid: true,
    values,
    value: Math.min(...values),
    max: Math.max(...values)
  };
};

const formatCompactNumber = (value, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits,
    useGrouping: true
  }).format(value);

const serializeAreaM2 = (value) => {
  const parsed = parseAreaValue(value);
  if (!parsed.valid) return String(value ?? "").trim();
  return parsed.values
    .map((number) =>
      Number.isInteger(number)
        ? String(number)
        : String(Number(number.toFixed(4)))
    )
    .join("–");
};

const formatAreaM2 = (value, fallback = "") => {
  const parsed = parseAreaValue(value);
  if (!parsed.valid) return fallback || String(value ?? "").trim();

  const squareMetres = parsed.values
    .map((number) => formatCompactNumber(number))
    .join("–");
  const shouldShowHectares = parsed.values.every(
    (number) => Math.abs(number) >= 10000
  );

  if (!shouldShowHectares) return `${squareMetres}㎡`;

  const hectares = parsed.values
    .map((number) => formatCompactNumber(number / 10000, 4))
    .join("–");
  return `${hectares} 公顷 / ${squareMetres}㎡`;
};

window.__ARCHICONCEPT_PARSE_AREA__ = parseAreaValue;
window.__ARCHICONCEPT_SERIALIZE_AREA__ = serializeAreaM2;
window.__ARCHICONCEPT_FORMAT_AREA__ = formatAreaM2;

const makePreflightItem = (key, overrides = {}) => {
  const [field, state, impact, section] = PREFLIGHT_FIELD_META[key] || [
    key,
    "需要核验",
    "可能影响后续问题识别。",
    "id-section-a"
  ];
  return { key, field, state, impact, section, ...overrides };
};

const parseStrictNumber = (value) => {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return { empty: true, valid: false, value: null };
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return { empty: false, valid: false, value: null };
  }
  return { empty: false, valid: true, value: Number(text) };
};

const parseFloorNumbers = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return { empty: true, valid: false, values: [] };
  const normalized = text.replace(/(\d)\s*[-–—~至到]\s*(\d)/g, "$1,$2");
  const matches = normalized.match(/[+-]?\d+(?:\.\d+)?/g) || [];
  return {
    empty: false,
    valid: matches.length > 0,
    values: matches.map(Number).filter(Number.isFinite)
  };
};

window.__ARCHICONCEPT_BUILD_INPUT_PREFLIGHT__ = ({
  brief = {},
  sitePackage = null,
  locationConfirmed = false,
  boundaryStatus = "未绘制",
  entranceCount = 0,
  contextStatus = "未开始"
}) => {
  const blocking = [];
  const warning = [];
  const invalid = [];
  const boundaryArea = Number(sitePackage?.boundary?.areaM2 || 0);
  const hasValidBoundary =
    boundaryStatus === "已确认" &&
    Number.isFinite(boundaryArea) &&
    boundaryArea > 0;

  if (!String(brief.name || "").trim()) blocking.push(makePreflightItem("name"));
  if (!String(brief.type || "").trim()) blocking.push(makePreflightItem("type"));
  if (!String(brief.location || "").trim() && !locationConfirmed) {
    blocking.push(makePreflightItem("location"));
  }
  if (
    !String(brief.needs || "").trim() &&
    !String(brief.siteCondition || "").trim()
  ) {
    blocking.push(makePreflightItem("programAndSite"));
  }

  const numericFields = [
    ["area", "用地面积", "㎡", "id-section-a"],
    ["gfa", "总建筑面积", "㎡", "id-section-b"],
    ["buildableArea", "红线面积", "㎡", "id-section-b"],
    ["far", "容积率", "", "id-section-b"],
    ["height", "建筑高度", "m", "id-section-b"],
    ["density", "建筑密度", "%", "id-section-b"],
    ["greenery", "绿化率", "%", "id-section-b"]
  ];
  const parsed = {};

  numericFields.forEach(([key, field, unit, section]) => {
    const result = ["area", "gfa", "buildableArea"].includes(key)
      ? parseAreaValue(brief[key])
      : parseStrictNumber(brief[key]);
    parsed[key] = result;
    if (!result.empty && !result.valid) {
      invalid.push({
        key,
        field,
        state: `当前值无法识别为数字${unit ? `（${unit}）` : ""}`,
        impact: "系统无法可靠计算相关指标，请修正后继续。",
        section,
        severity: "blocking"
      });
    }
  });

  const floorResult = parseFloorNumbers(brief.floors);
  if (!floorResult.empty && !floorResult.valid) {
    invalid.push({
      key: "floors",
      field: "层数范围",
      state: "当前值未包含可识别的层数",
      impact: "系统无法判断垂直规模和交通组织，请修正后继续。",
      section: "id-section-b",
      severity: "blocking"
    });
  }

  if (!hasValidBoundary) {
    if (parsed.area.empty) {
      blocking.push(makePreflightItem("area"));
    } else if (parsed.area.valid && parsed.area.value <= 0) {
      invalid.push({
        key: "area",
        field: "用地面积",
        state: `当前值为 ${parsed.area.value}㎡`,
        impact: "用地面积必须大于 0，无法据此进行容量判断。",
        section: "id-section-a",
        severity: "blocking"
      });
    }
  } else if (parsed.area.valid && parsed.area.value <= 0) {
    invalid.push({
      key: "area",
      field: "用地面积",
      state: `当前值为 ${parsed.area.value}㎡`,
      impact: "已填写的用地面积无效，请删除错误值或填写正确面积。",
      section: "id-section-a",
      severity: "blocking"
    });
  }

  const addBlockingRange = (key, field, value, unit, impact, section = "id-section-b") => {
    invalid.push({
      key,
      field,
      state: `当前值为 ${value}${unit}`,
      impact,
      section,
      severity: "blocking"
    });
  };
  const addWarningRange = (key, field, value, unit, impact, section = "id-section-b") => {
    invalid.push({
      key,
      field,
      state: `当前值为 ${value}${unit}`,
      impact,
      section,
      severity: "warning"
    });
  };

  if (parsed.area.valid && parsed.area.value > 0 && parsed.area.value < 10) {
    addWarningRange("area", "用地面积", parsed.area.value, "㎡", "面积非常小，请确认单位或数值是否正确。", "id-section-a");
  }
  if (parsed.area.valid && parsed.area.max > 10000000) {
    addWarningRange("area", "用地面积", parsed.area.max, "㎡", "面积非常大，请确认是否误用了平方米以外的单位。", "id-section-a");
  }
  if (parsed.gfa.valid && parsed.gfa.value < 0) {
    addBlockingRange("gfa", "总建筑面积", parsed.gfa.value, "㎡", "总建筑面积不能小于 0。");
  }
  if (parsed.buildableArea.valid && parsed.buildableArea.value < 0) {
    addBlockingRange("buildableArea", "红线面积", parsed.buildableArea.value, "㎡", "红线面积不能小于 0。");
  }
  if (parsed.far.valid && parsed.far.value < 0) {
    addBlockingRange("far", "容积率", parsed.far.value, "", "容积率不能小于 0。");
  } else if (parsed.far.valid && parsed.far.value > 20) {
    addWarningRange("far", "容积率", parsed.far.value, "", "容积率非常高，可能影响体量、消防和城市空间判断。");
  }
  if (parsed.height.valid && parsed.height.value < 0) {
    addBlockingRange("height", "建筑高度", parsed.height.value, "m", "建筑高度不能小于 0。");
  } else if (parsed.height.valid && parsed.height.value > 1000) {
    addWarningRange("height", "建筑高度", parsed.height.value, "m", "高度非常规，请确认单位或项目类型。");
  }
  if (floorResult.valid) {
    const minFloor = Math.min(...floorResult.values);
    const maxFloor = Math.max(...floorResult.values);
    if (minFloor < 0) {
      addBlockingRange("floors", "层数范围", minFloor, "层", "层数不能小于 0。");
    } else if (maxFloor > 300) {
      addWarningRange("floors", "层数范围", maxFloor, "层", "层数非常规，请确认是否输入正确。");
    }
  }
  [
    ["density", "建筑密度"],
    ["greenery", "绿化率"]
  ].forEach(([key, field]) => {
    if (parsed[key].valid && (parsed[key].value < 0 || parsed[key].value > 100)) {
      addBlockingRange(key, field, parsed[key].value, "%", `${field}必须在 0% 到 100% 之间。`);
    }
  });

  if (parsed.far.empty) warning.push(makePreflightItem("far"));
  if (parsed.gfa.empty) warning.push(makePreflightItem("gfa"));
  if (parsed.height.empty) warning.push(makePreflightItem("height"));
  if (floorResult.empty) warning.push(makePreflightItem("floors"));
  if (!hasValidBoundary) warning.push(makePreflightItem("redLineArea"));
  if (entranceCount <= 0) warning.push(makePreflightItem("siteEntrance"));
  if (contextStatus !== "已完成") warning.push(makePreflightItem("contextAnalysis"));
  if (!String(brief.siteCondition || "").trim()) {
    warning.push(makePreflightItem("planningRestrictions"));
  }

  const conditionText = [
    brief.siteCondition,
    brief.needs,
    brief.areaProgram
  ].filter(Boolean).join(" ");
  [
    ["parking", /停车|车位|车库|泊位|落客/],
    ["pedestrianFlow", /人流|客流|步行|访客|使用人群/],
    ["accessConditions", /出入口|入口|出口|后勤|消防通道/],
    ["setback", /退界|退让|退距|建筑间距|红线距离/]
  ].forEach(([key, pattern]) => {
    if (!pattern.test(conditionText)) warning.push(makePreflightItem(key));
  });

  const hasBlocking =
    blocking.length > 0 ||
    invalid.some((item) => item.severity === "blocking");
  const skippableItems = [
    ...warning,
    ...invalid.filter((item) => item.severity !== "blocking")
  ];
  const validationSkipped = Object.fromEntries(
    skippableItems.map((item) => [item.key, true])
  );

  return {
    blocking,
    warning,
    invalid,
    hasBlocking,
    validationSkipped,
    validationSkippedDetails: skippableItems.map(
      ({ key, field, state, impact }) => ({ key, field, state, impact })
    )
  };
};

const INPUT_PREFLIGHT_FIELD_TARGETS = {
  name: { name: "name", section: "id-section-a" },
  type: { name: "type", section: "id-section-a" },
  location: { name: "location", section: "id-section-a" },
  area: { name: "area", section: "id-section-a" },
  far: { name: "far", section: "id-section-b" },
  gfa: { name: "gfa", section: "id-section-b" },
  height: { name: "height", section: "id-section-b" },
  floors: { name: "floors", section: "id-section-b" },
  density: { name: "density", section: "id-section-b" },
  greenery: { name: "greenery", section: "id-section-b" },
  buildableArea: { name: "buildableArea", section: "id-section-b" },
  programAndSite: { name: "needs", fallbackName: "siteCondition", section: "id-section-c" },
  planningRestrictions: { name: "siteCondition", section: "id-section-c" },
  parking: { name: "siteCondition", section: "id-section-c" },
  pedestrianFlow: { name: "siteCondition", section: "id-section-c" },
  accessConditions: { name: "siteCondition", section: "id-section-c" },
  setback: { name: "siteCondition", section: "id-section-c" },
  redLineArea: { section: "id-section-site-location" },
  siteEntrance: { section: "id-section-site-location" },
  contextAnalysis: { section: "id-section-site-location" }
};

const locateInputPreflightTarget = (item) => {
  const config = INPUT_PREFLIGHT_FIELD_TARGETS[item.key] || {};
  const field =
    (config.name && document.querySelector(`[name="${config.name}"]`)) ||
    (config.fallbackName &&
      document.querySelector(`[name="${config.fallbackName}"]`)) ||
    (config.selector && document.querySelector(config.selector));
  const section =
    document.getElementById(config.section || item.section || "") ||
    document.getElementById(item.section || "");
  return { field, section };
};

const highlightInputPreflightTarget = (item) => {
  const { field, section } = locateInputPreflightTarget(item);
  const target = field || section;
  if (!target) return;

  const highlightTarget = field
    ? field.closest(".input-preflight-field-target") ||
      field.parentElement?.parentElement ||
      field.parentElement ||
      field
    : section;

  document
    .querySelectorAll(".input-preflight-target-highlight")
    .forEach((element) =>
      element.classList.remove("input-preflight-target-highlight")
    );

  window.requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const targetTop =
      window.scrollY +
      rect.top -
      Math.max(88, (window.innerHeight - rect.height) / 2);
    highlightTarget.classList.add("input-preflight-target-highlight");
    if (
      field &&
      /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(field.tagName) &&
      !field.disabled
    ) {
      field.focus({ preventScroll: true });
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(0, targetTop),
        left: 0,
        behavior: "instant"
      });
    });
    window.setTimeout(
      () => highlightTarget.classList.remove("input-preflight-target-highlight"),
      1800
    );
  });
};

window.__ARCHICONCEPT_SHOW_INPUT_PREFLIGHT__ = ({
  result,
  onReturn,
  onContinue
}) => {
  document.getElementById("archiconcept-input-preflight")?.remove();
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "archiconcept-input-preflight";
  overlay.className = "input-preflight-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "input-preflight-title");

  const panel = document.createElement("div");
  panel.className = "input-preflight-panel";
  overlay.appendChild(panel);

  const header = document.createElement("header");
  header.className = "input-preflight-header";
  const eyebrow = document.createElement("div");
  eyebrow.className = "input-preflight-eyebrow";
  eyebrow.textContent = "INPUT VALIDATION / 数据预检";
  const title = document.createElement("h2");
  title.id = "input-preflight-title";
  title.textContent = "开始问题识别前，请确认输入条件";
  const description = document.createElement("p");
  description.textContent = result.hasBlocking
    ? "以下关键信息缺失或存在严重异常，系统无法进行可靠的问题识别，请先补充。"
    : "以下信息暂未填写或可能异常，可能影响后续问题识别的准确性。你可以返回补充，也可以继续跳过。";
  header.append(eyebrow, title, description);
  panel.appendChild(header);

  const content = document.createElement("div");
  content.className = "input-preflight-content";
  panel.appendChild(content);

  const sections = [
    ["必须补充", "blocking", result.blocking],
    ["建议补充", "warning", result.warning],
    ["数据可能异常", "invalid", result.invalid]
  ];

  sections.forEach(([label, tone, items]) => {
    const section = document.createElement("section");
    section.className = `input-preflight-section is-${tone}`;
    const heading = document.createElement("div");
    heading.className = "input-preflight-section-heading";
    const headingText = document.createElement("h3");
    headingText.textContent = label;
    const count = document.createElement("span");
    count.textContent = String(items.length);
    heading.append(headingText, count);
    section.appendChild(heading);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "input-preflight-empty";
      empty.textContent = "当前无此类问题";
      section.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "input-preflight-list";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = `input-preflight-row ${
          item.severity === "blocking" ? "is-blocking" : ""
        }`;
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute(
          "aria-label",
          `前往补充${item.field}，当前状态：${item.state}`
        );
        row.dataset.preflightKey = item.key;
        const marker = document.createElement("span");
        marker.className = "input-preflight-marker";
        const copy = document.createElement("div");
        const itemTitle = document.createElement("div");
        itemTitle.className = "input-preflight-item-title";
        itemTitle.textContent = `${item.field}：${item.state}`;
        const impact = document.createElement("p");
        impact.textContent = item.impact;
        copy.append(itemTitle, impact);
        row.append(marker, copy);
        const goToTarget = () => {
          document.body.style.overflow = previousOverflow;
          overlay.remove();
          highlightInputPreflightTarget(item);
        };
        row.addEventListener("click", goToTarget);
        row.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          goToTarget();
        });
        list.appendChild(row);
      });
      section.appendChild(list);
    }
    content.appendChild(section);
  });

  const footer = document.createElement("footer");
  footer.className = "input-preflight-footer";
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = result.hasBlocking
    ? "input-preflight-button is-primary"
    : "input-preflight-button is-secondary";
  returnButton.textContent = "返回补充";
  footer.appendChild(returnButton);

  if (!result.hasBlocking) {
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "input-preflight-button is-primary";
    continueButton.textContent = "继续跳过并开始识别";
    continueButton.addEventListener("click", () => {
      document.body.style.overflow = previousOverflow;
      overlay.remove();
      onContinue?.();
    });
    footer.appendChild(continueButton);
  }

  returnButton.addEventListener("click", () => {
    document.body.style.overflow = previousOverflow;
    overlay.remove();
    onReturn?.();
  });
  panel.addEventListener("click", (event) => event.stopPropagation());
  panel.appendChild(footer);
  document.body.appendChild(overlay);
  returnButton.focus();
};

const collectAssistantHintText = (bubble) => {
  const parts = [];
  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (
      text &&
      !parent?.closest("svg") &&
      !/^ARCHICONCEPT ASSISTANT$/i.test(text)
    ) {
      parts.push(text);
    }
    node = walker.nextNode();
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
};

const mergeAssistantHints = () => {
  document
    .querySelectorAll(
      'img[src*="ip-input-guide2.png"]:not(.assistant-ip-character)'
    )
    .forEach((image) => {
      const assistantSection = image.parentElement?.parentElement;
      if (!assistantSection) return;

      const bubble =
        assistantSection.querySelector("#ip-bubble") ||
        [...assistantSection.children].find(
          (child) => child !== image.parentElement && child.textContent?.trim()
        );
      const mainCard = assistantSection.previousElementSibling;
      const hintText = bubble ? collectAssistantHintText(bubble) : "";

      if (!bubble || !mainCard || !hintText) return;

      assistantSection.classList.add("assistant-bubble-merged-source");
      mainCard.classList.add("assistant-hint-host");

      const characterHost = mainCard.parentElement;
      if (
        characterHost &&
        !characterHost.querySelector(":scope > .assistant-ip-character")
      ) {
        characterHost.classList.add("assistant-ip-host");
        const character = document.createElement("img");
        character.className = "assistant-ip-character";
        character.src = "/images/ip-input-guide2.png";
        character.alt = "ARCHICONCEPT Assistant";
        character.setAttribute("aria-hidden", "true");
        characterHost.appendChild(character);
      }

      let hint = mainCard.querySelector(":scope > .assistant-hint");
      if (!hint) {
        hint = document.createElement("div");
        hint.className = "assistant-hint";

        const label = document.createElement("div");
        label.className = "assistant-hint-label";
        label.textContent = "ARCHICONCEPT ASSISTANT";

        const copy = document.createElement("p");
        copy.className = "assistant-hint-copy";

        hint.append(label, copy);
        mainCard.appendChild(hint);
      }

      const copy = hint.querySelector(".assistant-hint-copy");
      if (copy && copy.textContent !== hintText) copy.textContent = hintText;
    });
};

const enhanceInputTypography = () => {
  const page = document.querySelector("main:has(#id-section-a)");
  if (!page) return;

  page
    .querySelectorAll(
      "#grid-container label, #id-section-b .font-mono, #id-section-c .font-mono"
    )
    .forEach((element) => {
      if (element.querySelector(":scope > .type-en")) return;
      const textNode = [...element.childNodes].find(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          /\s\/\s*[A-Z][A-Z\s&-]*/.test(node.textContent || "")
      );
      if (!textNode) return;

      const text = textNode.textContent || "";
      const match = text.match(/^(.*?)(\s*\/\s*[A-Z][A-Z\s&-]*)(\s*)$/);
      if (!match) return;

      const english = document.createElement("span");
      english.className = "type-en";
      english.textContent = match[2];
      textNode.replaceWith(
        document.createTextNode(match[1]),
        english,
        document.createTextNode(match[3])
      );
    });
};

let assistantHintFrame = 0;
const scheduleAssistantHintMerge = () => {
  cancelAnimationFrame(assistantHintFrame);
  assistantHintFrame = requestAnimationFrame(() => {
    mergeAssistantHints();
    enhanceInputTypography();
  });
};

const assistantHintObserver = new MutationObserver(scheduleAssistantHintMerge);
assistantHintObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});
scheduleAssistantHintMerge();

const getProblemPriority = (card) => {
  if (card.classList.contains("problem-card-p0")) return "P0";
  if (card.classList.contains("problem-card-p2")) return "P2";
  return "P1";
};

const highlightProblemQuestion = (target) => {
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("problem-question-highlight");
  requestAnimationFrame(() => {
    target.classList.add("problem-question-highlight");
    window.setTimeout(
      () => target.classList.remove("problem-question-highlight"),
      1800
    );
  });
};

const locateRequiredProblemQuestion = () => {
  const questions = [
    ...document.querySelectorAll(
      '#module-c-questions [id^="question-wrapper-"]'
    )
  ];
  const unanswered =
    questions.find(
      (question) =>
        !question.querySelector(
          'button[class*="bg-[#111]"], button[class*="bg-zinc-800"]'
        )
    ) || questions[0];
  highlightProblemQuestion(unanswered);
};

const enhanceProblemCard = (card) => {
  if (card.dataset.problemEnhanced === "true") return;
  card.dataset.problemEnhanced = "true";

  const summary = card.querySelector("h4 + p");
  const details = card.lastElementChild;
  const category =
    card.querySelector(":scope > div:first-child span")?.textContent?.trim() ||
    "设计问题";
  const title = card.querySelector("h4")?.textContent?.trim() || "当前问题";
  summary?.classList.add("problem-card-summary");
  if (details && details !== card.firstElementChild) {
    details.classList.add("problem-card-details");

    const detailText = details.textContent || "";
    if (!/触发依据|依据：/.test(detailText)) {
      const basis = document.createElement("div");
      basis.className = "problem-card-detail-row";
      basis.innerHTML =
        "<span>触发依据</span><p>依据当前用户输入、已有场地信息与系统规则推断。</p>";
      details.appendChild(basis);
    }
    if (!/影响范围/.test(detailText)) {
      const impact = document.createElement("div");
      impact.className = "problem-card-detail-row";
      const impactLabel = document.createElement("span");
      impactLabel.textContent = "影响范围";
      const impactCopy = document.createElement("p");
      impactCopy.textContent = `${category}、空间意图与策略匹配`;
      impact.append(impactLabel, impactCopy);
      details.appendChild(impact);
    }
    if (!/确认：|需要确认/.test(detailText)) {
      const confirmation = document.createElement("div");
      confirmation.className = "problem-card-detail-row";
      const confirmationLabel = document.createElement("span");
      confirmationLabel.textContent = "需要确认";
      const confirmationCopy = document.createElement("p");
      confirmationCopy.textContent = `${title}是否应作为后续方案的明确约束。`;
      confirmation.append(confirmationLabel, confirmationCopy);
      details.appendChild(confirmation);
    }
  }

  const actions = document.createElement("div");
  actions.className = "problem-card-actions";

  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "problem-card-expand";
  expandButton.textContent = "展开依据";
  expandButton.addEventListener("click", () => {
    const expanded = card.classList.toggle("is-expanded");
    expandButton.textContent = expanded ? "收起依据" : "展开依据";
  });

  const answerButton = document.createElement("button");
  answerButton.type = "button";
  answerButton.className = "problem-card-answer";
  answerButton.textContent =
    getProblemPriority(card) === "P0" ? "回答关联问题" : "查看追问";
  answerButton.addEventListener("click", () => {
    const questions = [
      ...document.querySelectorAll(
        '#module-c-questions [id^="question-wrapper-"]'
      )
    ];
    const index = Number(card.dataset.problemIndex || 0);
    highlightProblemQuestion(
      questions[Math.min(index, Math.max(questions.length - 1, 0))] ||
        questions[0]
    );
  });

  actions.append(expandButton, answerButton);
  card.appendChild(actions);
};

const rebuildProblemGroups = (list) => {
  const cards = [...list.children].filter((element) =>
    element.classList.contains("problem-card")
  );
  const signature = cards
    .map(
      (card) =>
        `${getProblemPriority(card)}:${card.querySelector("h4")?.textContent || ""}`
    )
    .join("|");
  if (
    list.dataset.problemGroupSignature === signature &&
    list.querySelector(":scope > .problem-priority-group")
  ) {
    cards.forEach(enhanceProblemCard);
    return;
  }
  list.dataset.problemGroupSignature = signature;
  list
    .querySelectorAll(":scope > .problem-priority-group")
    .forEach((element) => element.remove());

  const groupCopy = {
    P0: ["P0 必须确认", "直接影响后续空间意图与策略判断"],
    P1: ["P1 建议确认", "补充后可提高问题识别可信度"],
    P2: ["P2 参考问题", "用于完善方案边界，可按需查看"]
  };
  const inserted = new Set();

  cards.forEach((card) => {
    card.dataset.problemIndex = String(cards.indexOf(card));
    const priority = getProblemPriority(card);
    if (!inserted.has(priority)) {
      const group = document.createElement("div");
      group.className = `problem-priority-group is-${priority.toLowerCase()}`;
      const title = document.createElement("strong");
      const note = document.createElement("span");
      title.textContent = groupCopy[priority][0];
      note.textContent = groupCopy[priority][1];
      group.append(title, note);
      list.insertBefore(group, card);
      inserted.add(priority);
    }
    enhanceProblemCard(card);
  });
};

const enhanceProblemTrust = () => {
  const module = document.querySelector("#module-b-problems");
  const header = document.querySelector("#problems-header");
  if (!module || !header) return;

  let strip = module.querySelector(":scope > .problem-trust-strip");
  if (!strip) {
    strip = document.createElement("div");
    strip.className = "problem-trust-strip";
    header.insertAdjacentElement("afterend", strip);
  }

  const review = document.querySelector("#module-a-review");
  const reviewText = review?.textContent || "";
  const missingFields = [
    ...new Set(
      [...(review?.querySelectorAll("span") || [])]
        .map((element) => element.textContent?.trim())
        .filter(
          (text) =>
            text &&
            text !== "缺失项:" &&
            (text.includes("待确认") || text.includes("未指定"))
        )
    )
  ];
  const hasSiteEvidence =
    !/项目地点\s*\/\s*LOCATION\s*未指定/.test(reviewText) ||
    /实测|红线|入口|周边/.test(reviewText);
  const sources = ["用户输入"];
  if (hasSiteEvidence) sources.push("场地分析");
  sources.push("系统推断");
  const confidence =
    missingFields.length >= 3 ? "低" : missingFields.length > 0 ? "中" : "高";
  const signature = `${sources.join(" / ")}|${confidence}|${missingFields.join(
    "、"
  )}`;
  if (strip.dataset.signature === signature) return;
  strip.dataset.signature = signature;
  strip.replaceChildren();

  const source = document.createElement("div");
  source.innerHTML = `<span>依据来源</span><strong>${sources.join(
    " / "
  )}</strong>`;
  const confidenceNode = document.createElement("div");
  confidenceNode.innerHTML = `<span>置信度</span><strong class="is-confidence-${confidence}">${confidence}</strong>`;
  const missing = document.createElement("div");
  missing.className = "problem-trust-missing";
  missing.innerHTML = `<span>缺失字段</span><strong>${
    missingFields.length ? missingFields.join("、") : "无关键缺失"
  }</strong>`;
  strip.append(source, confidenceNode, missing);
};

const parseProblemSummary = () => {
  const summary = document.querySelector("#summary-meta-list");
  const questions = document.querySelector("#module-c-questions");
  const text = summary?.textContent || "";
  const questionText = questions?.textContent || "";
  const total = Number(text.match(/识别设计卡点数\s*(\d+)/)?.[1] || 0);
  const progress = text.match(/已答\s*(\d+)\s*\/\s*(\d+)/);
  const answered = Number(progress?.[1] || 0);
  const required = Number(progress?.[2] || 0);
  const optional = Number(
    questionText.match(/(?:展开|收起)\s*\((\d+)\)/)?.[1] || 0
  );
  const level = text.match(/数据完成等级\s*([高中低])/)?.[1] || "低";
  return {
    total,
    answered,
    required,
    optional,
    level,
    blocking: Math.max(required - answered, 0)
  };
};

const enhanceProblemSummary = () => {
  const panel = document.querySelector("#summary-panel");
  const original = document.querySelector("#summary-meta-list");
  if (!panel || !original) return;

  original.classList.add("problem-summary-original");
  let actionable = panel.querySelector(":scope > .problem-summary-actionable");
  if (!actionable) {
    actionable = document.createElement("div");
    actionable.className = "problem-summary-actionable";
    original.insertAdjacentElement("afterend", actionable);
  }

  const data = parseProblemSummary();
  const status = data.blocking === 0 ? "可进入下一步" : "待确认";
  const next =
    data.blocking === 0
      ? "关键问题已确认，可进入空间意图。"
      : `回答剩余 ${data.blocking} 个必答问题后可进入空间意图。`;
  const signature = JSON.stringify({ ...data, status, next });
  if (actionable.dataset.signature === signature) return;
  actionable.dataset.signature = signature;
  actionable.innerHTML = `
    <div class="problem-summary-row">
      <span>识别结果状态</span><strong>${status}</strong>
    </div>
    <div class="problem-summary-row">
      <span>数据可信度</span><strong>${data.level}</strong>
    </div>
    <div class="problem-summary-row">
      <span>必须回答</span><strong>${data.answered} / ${data.required}</strong>
    </div>
    <div class="problem-summary-row">
      <span>建议补充</span><strong>${data.optional} 项</strong>
    </div>
    <div class="problem-summary-row is-blocking">
      <span>阻断项</span><strong>${data.blocking} 项</strong>
    </div>
    <div class="problem-summary-next">
      <span>下一步</span>
      <p>${next}</p>
    </div>
    <button type="button" class="problem-summary-locate">定位到必答问题</button>
  `;
  actionable
    .querySelector(".problem-summary-locate")
    ?.addEventListener("click", locateRequiredProblemQuestion);
};

const enhanceProblemQuestions = () => {
  const wrappers = [
    ...document.querySelectorAll(
      '#module-c-questions [id^="question-wrapper-"]'
    )
  ];
  const problemTitles = [
    ...document.querySelectorAll("#problems-list .problem-card h4")
  ].map((title) => title.textContent?.trim());

  wrappers.forEach((wrapper, index) => {
    wrapper.classList.add("problem-question-card");
    const label = wrapper.querySelector("label");
    if (!label) return;
    const titleText = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join("");
    if (titleText) return;
    label.append(
      document.createTextNode(
        problemTitles[index] || "请确认该设计条件是否作为后续方案的明确约束。"
      )
    );
  });
};

const updateProblemExpandControl = () => {
  const module = document.querySelector("#module-b-problems");
  if (!module) return;
  const button = [...module.querySelectorAll("button")].find((element) =>
    /展开更多问题|收起次要问题|展开一般与参考问题|收起一般与参考问题/.test(
      element.textContent || ""
    )
  );
  if (!button) return;
  const label = button.querySelector("span");
  const expanded = /收起/.test(button.textContent || "");
  if (label) {
    const nextLabel = expanded
      ? "收起一般与参考问题"
      : "展开一般与参考问题";
    if (label.textContent !== nextLabel) label.textContent = nextLabel;
  }
};

const ensureSystemEstimateMarker = () => {
  const saved = sessionStorage.getItem("archiconcept:system-estimate");
  const isProblemPage = Boolean(document.querySelector("#main-container-step2"));
  if (!saved || isProblemPage) return;
  const header =
    document.querySelector("#header-section") ||
    document.querySelector("main h1")?.parentElement;
  if (!header || header.querySelector(".system-estimate-marker")) return;
  const marker = document.createElement("div");
  marker.className = "system-estimate-marker";
  marker.textContent = "部分判断由系统估算生成，建议复核";
  header.appendChild(marker);
};

const enhanceProblemIdentificationPage = () => {
  const page = document.querySelector("#main-container-step2");
  if (!page) {
    ensureSystemEstimateMarker();
    return;
  }

  page.classList.add("problem-identification-enhanced");
  const list = document.querySelector("#problems-list");
  if (list) rebuildProblemGroups(list);
  enhanceProblemTrust();
  enhanceProblemSummary();
  enhanceProblemQuestions();
  updateProblemExpandControl();
};

const showSystemEstimateDialog = (sourceButton) => {
  if (document.querySelector(".system-estimate-overlay")) return;
  const previousOverflow = document.body.style.overflow;
  const unanswered = [
    ...document.querySelectorAll(
      '#module-c-questions [id^="question-wrapper-"]'
    )
  ]
    .filter(
      (question) =>
        !question.querySelector(
          'button[class*="bg-[#111]"], button[class*="bg-zinc-800"]'
        )
    )
    .map((question) =>
      (question.querySelector("label")?.textContent || "")
        .replace(/^必答/, "")
        .trim()
    )
    .filter(Boolean);
  const items = unanswered.length
    ? unanswered
    : ["未确认的设计条件与空间组织偏好"];

  const overlay = document.createElement("div");
  overlay.className = "system-estimate-overlay";
  const dialog = document.createElement("section");
  dialog.className = "system-estimate-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "system-estimate-title");

  const eyebrow = document.createElement("div");
  eyebrow.className = "system-estimate-eyebrow";
  eyebrow.textContent = "SYSTEM ESTIMATE / 系统估算";
  const title = document.createElement("h2");
  title.id = "system-estimate-title";
  title.textContent = "确认使用系统估算";
  const description = document.createElement("p");
  description.className = "system-estimate-description";
  description.textContent =
    "系统将对以下未确认项采用常规默认判断。这些估算会影响后续空间意图和策略匹配，你可以后续返回修改。";
  const list = document.createElement("ol");
  list.className = "system-estimate-list";
  items.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item;
    list.appendChild(row);
  });
  const note = document.createElement("p");
  note.className = "system-estimate-note";
  note.textContent = "进入后续步骤后，相关判断将标记为“系统估算，建议复核”。";
  const footer = document.createElement("footer");
  footer.className = "system-estimate-footer";
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "system-estimate-return";
  returnButton.textContent = "返回补充";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "system-estimate-confirm";
  confirmButton.textContent = "确认使用系统估算";
  footer.append(returnButton, confirmButton);
  dialog.append(eyebrow, title, description, list, note, footer);
  overlay.appendChild(dialog);

  const close = () => {
    document.body.style.overflow = previousOverflow;
    overlay.remove();
  };
  returnButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    sessionStorage.setItem(
      "archiconcept:system-estimate",
      JSON.stringify({ items, confirmedAt: new Date().toISOString() })
    );
    close();
    sourceButton.dataset.estimateConfirmed = "true";
    sourceButton.click();
  });
  dialog.addEventListener("click", (event) => event.stopPropagation());
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  returnButton.focus();
};

document.addEventListener(
  "click",
  (event) => {
    const skipButton = event.target.closest("#action-skip");
    if (skipButton) {
      if (skipButton.dataset.estimateConfirmed === "true") {
        delete skipButton.dataset.estimateConfirmed;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      showSystemEstimateDialog(skipButton);
      return;
    }

    if (event.target.closest("#action-next")) {
      sessionStorage.removeItem("archiconcept:system-estimate");
    }
  },
  true
);

let problemEnhancementFrame = 0;
const scheduleProblemEnhancement = () => {
  cancelAnimationFrame(problemEnhancementFrame);
  problemEnhancementFrame = requestAnimationFrame(
    enhanceProblemIdentificationPage
  );
};
const problemEnhancementObserver = new MutationObserver(
  scheduleProblemEnhancement
);
problemEnhancementObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});
scheduleProblemEnhancement();

const MAP_DISPLAY_DEFAULTS = {
  1: {
    mode: "standard",
    showOutline: true,
    showNames: true
  },
  2: {
    mode: "standard",
    showOutline: true,
    showNames: true
  },
  3: {
    mode: "standard",
    showOutline: true,
    showNames: true
  },
  4: {
    mode: "standard",
    showOutline: true,
    showNames: true
  }
};

let mapDisplayStep = 1;
let mapDisplayManual = false;
let mapDisplaySettings = { ...MAP_DISPLAY_DEFAULTS[1] };
let mapDisplayMap = null;

const getMapDisplayDefaults = (step = mapDisplayStep) => ({
  ...(MAP_DISPLAY_DEFAULTS[step] || MAP_DISPLAY_DEFAULTS[1])
});

const setMapDisplayHostState = () => {
  const host = document.querySelector(".site-map-display-host");
  if (!host) return;

  host.dataset.mapDisplayMode = mapDisplaySettings.mode;
  host.dataset.mapDisplayStep = String(mapDisplayStep);
  host.classList.toggle("map-show-outline", mapDisplaySettings.showOutline);
  host.classList.toggle("map-show-names", mapDisplaySettings.showNames);
};

const applyMapDisplaySettings = () => {
  setMapDisplayHostState();

  const map = mapDisplayMap || window.__ARCHICONCEPT_MAP__;
  if (!map) return;

  const style = {
    focus: "amap://styles/whitesmoke",
    detail: "amap://styles/grey",
    standard: "amap://styles/normal"
  }[mapDisplaySettings.mode] || "amap://styles/normal";
  try {
    map.setMapStyle?.(style);
  } catch (error) {
    console.warn("Unable to change AMap style", error);
  }

  const features = ["bg"];
  if (mapDisplaySettings.showOutline) features.push("road", "building");
  if (mapDisplaySettings.showNames) features.push("point");

  try {
    map.setFeatures?.([...new Set(features)]);
  } catch (error) {
    console.warn("Unable to change AMap features", error);
  }

  try {
    map.setStatus?.({
      showLabel: mapDisplaySettings.showNames
    });
  } catch (error) {
    console.warn("Unable to change AMap labels", error);
  }
};

const updateMapDisplaySettings = (patch, manual = true) => {
  mapDisplaySettings = { ...mapDisplaySettings, ...patch };
  if (manual) mapDisplayManual = true;
  window.__ARCHICONCEPT_MAP_DISPLAY_SETTINGS__ = { ...mapDisplaySettings };
  applyMapDisplaySettings();
  syncMapDisplayControls();
};

const resetMapDisplaySettings = () => {
  mapDisplayManual = false;
  mapDisplaySettings = getMapDisplayDefaults();
  window.__ARCHICONCEPT_MAP_DISPLAY_SETTINGS__ = { ...mapDisplaySettings };
  applyMapDisplaySettings();
  syncMapDisplayControls();
};

const makeMapDisplaySwitch = (key, label) => {
  const row = document.createElement("label");
  row.className = "map-display-switch-row";

  const copy = document.createElement("span");
  copy.textContent = label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.mapDisplayKey = key;
  input.addEventListener("change", () => {
    updateMapDisplaySettings({ [key]: input.checked });
  });

  const control = document.createElement("span");
  control.className = "map-display-switch";

  row.append(copy, input, control);
  return row;
};

const closeMapDisplayPanel = () => {
  document
    .querySelector(".map-display-control")
    ?.classList.remove("is-open");
};

const syncMapDisplayControls = () => {
  const control = document.querySelector(".map-display-control");
  if (!control) return;

  control.querySelectorAll("[data-map-mode]").forEach((button) => {
    const active = button.dataset.mapMode === mapDisplaySettings.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  control.querySelectorAll("[data-map-display-key]").forEach((input) => {
    input.checked = Boolean(mapDisplaySettings[input.dataset.mapDisplayKey]);
  });
};

const createMapDisplayControl = (host) => {
  if (host.querySelector(":scope > .map-display-control")) return;

  const control = document.createElement("div");
  control.className = "map-display-control";
  control.addEventListener("click", (event) => event.stopPropagation());
  control.addEventListener("mousedown", (event) => event.stopPropagation());

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "map-display-trigger";
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `
    <span class="map-display-layer-icon" aria-hidden="true"></span>
    <span>地图显示</span>
  `;

  const panel = document.createElement("div");
  panel.className = "map-display-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "地图显示设置");
  panel.innerHTML = `
    <div class="map-display-panel-head">
      <div>
        <strong>地图显示</strong>
        <span>MAP DISPLAY</span>
      </div>
      <button type="button" class="map-display-close" aria-label="关闭地图显示面板">×</button>
    </div>
    <section class="map-display-section">
      <div class="map-display-section-title">底图模式</div>
      <div class="map-display-modes">
        <button type="button" data-map-mode="standard">标准</button>
        <button type="button" data-map-mode="focus">灰度</button>
        <button type="button" data-map-mode="detail">对比</button>
      </div>
      <p class="map-display-mode-help"></p>
    </section>
    <section class="map-display-section map-display-switches">
      <div class="map-display-section-title">显示内容</div>
    </section>
    <div class="map-display-degrade-note">
      名称由底图统一控制，红线、入口和分析点位始终保留。
    </div>
    <button type="button" class="map-display-reset">恢复当前步骤默认</button>
  `;

  const switches = panel.querySelector(".map-display-switches");
  [
    ["showOutline", "显示轮廓"],
    ["showNames", "显示名称"]
  ].forEach(([key, label]) => {
    switches.appendChild(makeMapDisplaySwitch(key, label));
  });

  const modeHelp = panel.querySelector(".map-display-mode-help");
  const modeCopy = {
    standard: "使用标准彩色底图，保留普通浏览信息。",
    focus: "使用灰度底图，降低色彩干扰并突出编辑内容。",
    detail: "提高底图结构对比，强化建筑与道路轮廓。"
  };

  panel.querySelectorAll("[data-map-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      updateMapDisplaySettings({ mode: button.dataset.mapMode });
      modeHelp.textContent = modeCopy[button.dataset.mapMode];
    });
  });

  trigger.addEventListener("click", () => {
    const open = control.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      modeHelp.textContent = modeCopy[mapDisplaySettings.mode];
      syncMapDisplayControls();
    }
  });
  panel
    .querySelector(".map-display-close")
    .addEventListener("click", closeMapDisplayPanel);
  panel
    .querySelector(".map-display-reset")
    .addEventListener("click", resetMapDisplaySettings);

  control.append(trigger, panel);
  host.appendChild(control);
  syncMapDisplayControls();
  applyMapDisplaySettings();
};

const findSiteMapDisplayHost = () => {
  const mapContainer = document.querySelector(
    ".amap-container, .amap-maps"
  );
  if (!mapContainer) return null;

  const host = mapContainer.closest(
    "div.w-\\[70\\%\\].relative, div[class*='w-[70%]'][class*='relative']"
  );
  return host || mapContainer.parentElement;
};

const ensureMapDisplayControl = () => {
  const host = findSiteMapDisplayHost();
  if (!host) return;
  host.classList.add("site-map-display-host");
  createMapDisplayControl(host);
  setMapDisplayHostState();
};

window.addEventListener("archiconcept:map-ready", (event) => {
  mapDisplayMap = event.detail?.map || window.__ARCHICONCEPT_MAP__ || null;
  mapDisplayManual = false;
  mapDisplaySettings = getMapDisplayDefaults();
  window.__ARCHICONCEPT_MAP_DISPLAY_SETTINGS__ = { ...mapDisplaySettings };
  ensureMapDisplayControl();
  applyMapDisplaySettings();
  syncMapDisplayControls();
});

window.addEventListener("archiconcept:site-editor-state", (event) => {
  const nextStep = Number(event.detail?.step || 1);
  if (nextStep !== mapDisplayStep) {
    mapDisplayStep = nextStep;
    if (!mapDisplayManual) {
      mapDisplaySettings = getMapDisplayDefaults(nextStep);
    }
  }
  window.__ARCHICONCEPT_MAP_DISPLAY_SETTINGS__ = { ...mapDisplaySettings };
  ensureMapDisplayControl();
  applyMapDisplaySettings();
  syncMapDisplayControls();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".map-display-control")) closeMapDisplayPanel();
});

const mapDisplayObserver = new MutationObserver(ensureMapDisplayControl);
mapDisplayObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

const response = await fetch(sourceLink.href);
if (!response.ok) {
  throw new Error(`Unable to load ARCHICONCEPT app source: HTTP ${response.status}`);
}

let source = await response.text();

const replaceOnce = (needle, replacement, label) => {
  if (!source.includes(needle)) {
    throw new Error(`ARCHICONCEPT redline patch failed: ${label}`);
  }
  source = source.replace(needle, replacement);
};

replaceOnce(
  'source:"manual_draw",status:Ce',
  'source:window.__ARCHICONCEPT_REDLINE_SOURCE__||"manual_draw",status:Ce',
  "boundary source"
);

replaceOnce(
  'id:"site-loc-label"\n,children:"A+"',
  'id:"site-loc-label"\n,children:"B"',
  "site context section label"
);

replaceOnce(
  'n.jsx("div",{className:"w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white shrink-0",children:n.jsx(kE,{size:16})}),',
  "",
  "site editor header icon"
);

replaceOnce(
  'children:"数据来源：高德地图"',
  'children:"数据来源：地图服务"',
  "site location data source"
);
source = source.replaceAll("高德", "地图服务");

replaceOnce(
  'children:"B"}),n.jsxs("div",{children:[n.jsx("h3",{className:"text-[17px] font-semibold text-[#1A1A1A] leading-normal",children:"这个项目受到哪些规划与规模条件约束？"})',
  'children:"C"}),n.jsxs("div",{children:[n.jsx("h3",{className:"text-[17px] font-semibold text-[#1A1A1A] leading-normal",children:"这个项目受到哪些规划与规模条件约束？"})',
  "planning section label"
);

replaceOnce(
  'children:"C"}),n.jsxs("div",{children:[n.jsx("h3",{className:"text-[17px] font-semibold text-[#1A1A1A] leading-normal",children:"这个场地需要解决什么问题？"})',
  'children:"D"}),n.jsxs("div",{children:[n.jsx("h3",{className:"text-[17px] font-semibold text-[#1A1A1A] leading-normal",children:"这个场地需要解决什么问题？"})',
  "site issues section label"
);

source = source.replaceAll(
  'onFocus:()=>E("B")',
  'onFocus:()=>E("__ARCHICONCEPT_SECTION_C__")'
);
source = source.replaceAll('onFocus:()=>E("C")', 'onFocus:()=>E("D")');
source = source.replaceAll(
  'onFocus:()=>E("__ARCHICONCEPT_SECTION_C__")',
  'onFocus:()=>E("C")'
);

replaceOnce(
  'S==="B"?"这里填写规划控制和规模边界。":S==="C"?"这里填写场地、功能、人群和面积组成。"',
  'S==="C"?"这里填写规划控制和规模边界。":S==="D"?"这里填写场地、功能、人群和面积组成。"',
  "section assistant focus mapping"
);

replaceOnce(
  'children:"B"}),n.jsx("span",{children:"规划与规模条件"})',
  'children:"C"}),n.jsx("span",{children:"规划与规模条件"})',
  "import preview planning label"
);

replaceOnce(
  'children:"C"}),n.jsx("span",{children:"场地需要解决什么问题？"})',
  'children:"D"}),n.jsx("span",{children:"场地需要解决什么问题？"})',
  "import preview site issues label"
);

replaceOnce(
  'name:a,value:o,onChange:u,onFocus:f,placeholder:l,className:',
  'name:a,value:o,onChange:u,onFocus:f,onBlur:v=>{if(["area","gfa","buildableArea"].includes(a)){const T=window.__ARCHICONCEPT_SERIALIZE_AREA__(v.target.value);T!==v.target.value&&u({target:{name:a,value:T}})}},placeholder:l,className:',
  "area input normalization"
);

replaceOnce(
  'label:"用地面积 / AREA",name:"area",placeholder:"例如：40000",unit:"㎡"',
  'label:"用地面积 / AREA",name:"area",placeholder:"例如：2446、2.5ha 或 2.5公顷"',
  "site area input units"
);

replaceOnce(
  'label:"总建筑面积 / GFA",name:"gfa",placeholder:"例如：45000",unit:"㎡"',
  'label:"总建筑面积 / GFA",name:"gfa",placeholder:"例如：45000、4.5ha 或 4.5公顷"',
  "gfa input units"
);

replaceOnce(
  'label:"红线面积 / BUILDABLE BOUNDARY AREA",name:"buildableArea",placeholder:"例如：40000",unit:"㎡"',
  'label:"红线面积 / BUILDABLE BOUNDARY AREA",name:"buildableArea",placeholder:"例如：40000、4ha 或 4公顷"',
  "boundary area input units"
);

replaceOnce(
  'mn=v=>{const{name:T,value:V}=v.target;Vn(q=>{const I={...q,[T]:V};',
  'mn=v=>{const{name:T}=v.target,V=["area","gfa","buildableArea"].includes(T)&&/(ha|公顷|㎡|m²|m2|平方米)/i.test(v.target.value)?window.__ARCHICONCEPT_SERIALIZE_AREA__(v.target.value):v.target.value;Vn(q=>{const I={...q,[T]:V};',
  "area field storage normalization"
);

source = source.replaceAll(
  'je.area?`${je.area} ㎡`:"待补充"',
  'je.area?window.__ARCHICONCEPT_FORMAT_AREA__(je.area):"待补充"'
);
source = source.replaceAll(
  'je.gfa?`${je.gfa} ㎡`:"待补充"',
  'je.gfa?window.__ARCHICONCEPT_FORMAT_AREA__(je.gfa):"待补充"'
);
source = source.replaceAll(
  'je.buildableArea?`${je.buildableArea} ㎡`:"待补充"',
  'je.buildableArea?window.__ARCHICONCEPT_FORMAT_AREA__(je.buildableArea):"待补充"'
);
source = source.replaceAll(
  'ye.area?`${ye.area} ㎡`:""',
  'ye.area?window.__ARCHICONCEPT_FORMAT_AREA__(ye.area):""'
);
source = source.replaceAll(
  'ye.gfa?`${ye.gfa} ㎡`:""',
  'ye.gfa?window.__ARCHICONCEPT_FORMAT_AREA__(ye.gfa):""'
);
source = source.replaceAll(
  'ye.buildableArea?`${ye.buildableArea} ㎡`:""',
  'ye.buildableArea?window.__ARCHICONCEPT_FORMAT_AREA__(ye.buildableArea):""'
);
source = source.replaceAll(
  'value:z?`${z} ㎡`:"未指定"',
  'value:z?window.__ARCHICONCEPT_FORMAT_AREA__(z):"未指定"'
);
source = source.replaceAll(
  'value:pe?`${pe} ㎡`:"未指定"',
  'value:pe?window.__ARCHICONCEPT_FORMAT_AREA__(pe):"未指定"'
);
source = source.replaceAll(
  'value:r.gfa?`${r.gfa} ㎡`:"未指定"',
  'value:r.gfa?window.__ARCHICONCEPT_FORMAT_AREA__(r.gfa):"未指定"'
);
source = source.replaceAll(
  're=r!=null&&r.area?`${r.area} ㎡`:"待补充"',
  're=r!=null&&r.area?window.__ARCHICONCEPT_FORMAT_AREA__(r.area):"待补充"'
);
source = source.replaceAll(
  'Q=r!=null&&r.gfa?`${r.gfa} ㎡`:"待补充"',
  'Q=r!=null&&r.gfa?window.__ARCHICONCEPT_FORMAT_AREA__(r.gfa):"待补充"'
);
source = source.replaceAll(
  'be=r!=null&&r.buildableArea?`${r.buildableArea} ㎡`:"待补充"',
  'be=r!=null&&r.buildableArea?window.__ARCHICONCEPT_FORMAT_AREA__(r.buildableArea):"待补充"'
);

replaceOnce(
  'children:[Ws>0?Math.round(Ws):je.area||"未填写",Ws>0||je.area?"㎡":""]',
  'children:Ws>0?window.__ARCHICONCEPT_FORMAT_AREA__(Ws):je.area?window.__ARCHICONCEPT_FORMAT_AREA__(je.area):"未填写"',
  "site context area display"
);

replaceOnce(
  'value:we?`${Math.round(we)} ㎡`:"未指定"',
  'value:we?window.__ARCHICONCEPT_FORMAT_AREA__(we):"未指定"',
  "measured site area display"
);

replaceOnce(
  `[xs,eo]=k.useState(null)
,[Tt,Xr]=k.useState`,
  `[xs,eo]=k.useState(null),radiusPreviewRef=k.useRef(null)
,[Tt,Xr]=k.useState`,
  "radius preview reference"
);

replaceOnce(
  'ss.current=null,Kr.current=null',
  'ss.current=null,Kr.current=null,window.__ARCHICONCEPT_MAP__=null',
  "map instance cleanup bridge"
);

replaceOnce(
  'ss.current=q;try{q.addControl',
  'ss.current=q,window.__ARCHICONCEPT_MAP__=q,window.dispatchEvent(new CustomEvent("archiconcept:map-ready",{detail:{map:q}}));try{q.addControl',
  "map instance ready bridge"
);

replaceOnce(
  'mapNoiseEffect=k.useEffect(()=>{fe&&ss.current&&ss.current.setMapStyle&&ss.current.setMapStyle("amap://styles/whitesmoke")},[fe]),',
  'mapNoiseEffect=k.useEffect(()=>{},[fe]),',
  "remove forced whitesmoke basemap"
);

replaceOnce(
  'onClick:()=>setVisiblePoiLayers(T=>({...T,[v.id]:!T[v.id]}))',
  'onClick:()=>setVisiblePoiLayers({[v.id]:!0})',
  "single active context POI category"
);

replaceOnce(
  `},[xs,visiblePoiLayers,qn,Tt]),
activePoiLayerEffect=`,
  `},[xs,visiblePoiLayers,qn,Tt]),
radiusPreviewEffect=k.useEffect(()=>{const v=ss.current,T=window.AMap;if(radiusPreviewRef.current&&v){try{v.remove(radiusPreviewRef.current)}catch{}radiusPreviewRef.current=null}if(!ie||!fe||!v||!T||!me||Ce!=="\\u5df2\\u786e\\u8ba4"||!xs||Tt==="\\u5df2\\u5b8c\\u6210")return;const V=Ps(),q=Number(V.lng),I=Number(V.lat);if(!Number.isFinite(q)||!Number.isFinite(I))return;const X=new T.Circle({center:new T.LngLat(q,I),radius:xs,fillColor:"#6B7280",fillOpacity:.055,strokeColor:"#374151",strokeOpacity:.82,strokeWeight:2,strokeStyle:"dashed",zIndex:7,map:v});radiusPreviewRef.current=X;return()=>{if(radiusPreviewRef.current){try{v.remove(radiusPreviewRef.current)}catch{}radiusPreviewRef.current=null}}},[ie,fe,me,Ce,xs,Tt]),
activePoiLayerEffect=`,
  "radius selection preview"
);

replaceOnce(
  'redoRedline=()=>{We.length!==0&&window.confirm("\\u786e\\u8ba4\\u91cd\\u505a\\u5f53\\u524d\\u7528\\u5730\\u7ea2\\u7ebf\\uff1f\\u5f53\\u524d\\u7ea2\\u7ebf\\u5c06\\u88ab\\u6e05\\u9664\\u5e76\\u91cd\\u65b0\\u7ed8\\u5236\\u3002")&&(redlineUndo.current=[],redlineRedo.current=[],Ot([]),vn("\\u7f16\\u8f91\\u4e2d"),setRedlineMode("node"),setRedlineHistoryTick(T=>T+1))}',
  'redoRedline=()=>{const v=redlineRedo.current.pop();v&&(redlineUndo.current.push({points:cloneRedline(We),status:Ce}),Ot(cloneRedline(v.points)),vn(v.status),setRedlineHistoryTick(T=>T+1))}',
  "redo behavior"
);

replaceOnce(
  'children:"\\u91cd\\u505a\\u7ea2\\u7ebf"',
  'children:"\\u91cd\\u505a"',
  "redo label"
);

replaceOnce(
  'Ui=()=>{if(We.length<3)return;const v=[];',
  'Ui=()=>{if(We.length<3)return;const T=window.__ARCHICONCEPT_VALIDATE_REDLINE__?.(We,Ws,window.__ARCHICONCEPT_REDLINE_SOURCE__||"manual_draw");if(T){cn(T);return}const v=[];',
  "confirmation validation"
);

replaceOnce(
  '},[We]);const[Gr,hr]=k.useState',
  '},[We]);k.useEffect(()=>{const v={points:We.map(T=>({lng:T.lng,lat:T.lat})),areaM2:Ws,perimeterM:_i,status:Ce,source:window.__ARCHICONCEPT_REDLINE_SOURCE__||"manual_draw"};window.__ARCHICONCEPT_REDLINE_STATE__=v;window.dispatchEvent(new CustomEvent("archiconcept:redline-state",{detail:v}))},[We,Ws,_i,Ce]);k.useEffect(()=>{const v=!me?1:Ce!=="\\u5df2\\u786e\\u8ba4"?2:Pt!=="\\u5df2\\u5b8c\\u6210"?3:4,T={step:v,locationConfirmed:!!me,boundaryStatus:Ce,entranceStatus:Pt,contextStatus:Tt,visiblePoiLayers:{...visiblePoiLayers}};window.__ARCHICONCEPT_SITE_EDITOR_STATE__=T;window.dispatchEvent(new CustomEvent("archiconcept:site-editor-state",{detail:T}))},[ie,fe,me,Ce,Pt,Tt,visiblePoiLayers]);const[Gr,hr]=k.useState',
  "redline and site editor state bridges"
);

replaceOnce(
  '[redlineHistoryTick,setRedlineHistoryTick]=k.useState(0),redlineUndo=k.useRef([])',
  '[redlineHistoryTick,setRedlineHistoryTick]=k.useState(0),siteEditorSnapshot=k.useRef(null),redlineUndo=k.useRef([])',
  "site editor draft snapshot"
);

replaceOnce(
  'saveSiteDraft=()=>{const v=In();Mn.current&&Mn.current({...je,siteIntelligencePackage:v}),cn("\\u8349\\u7a3f\\u5df2\\u4fdd\\u5b58\\u3002")},closeWithoutSaving=()=>{setClosePrompt(!1),se(!1)},saveAndCloseEditor=()=>{saveSiteDraft(),setClosePrompt(!1),se(!1)};',
  'captureSiteEditorSnapshot=()=>({brief:{...je},sitePackage:In(),confirmedLocation:me?{...me}:null,candidateLocation:j?{...j}:null,points:We.map(v=>({...v})),boundaryStatus:Ce,areaM2:Ws,perimeterM:_i,entrances:Ut.map(v=>({...v})),entranceStatus:Pt,radius:xs,contextStatus:Tt,surroundings:{...qn},analysisItems:[...Kn],skipEntrance:no,visiblePoiLayers:{...visiblePoiLayers}}),resetSiteSelection=()=>{Te(null),U(null),Vn(v=>({...v,location:""})),Ot([]),vn("\\u672a\\u7ed8\\u5236"),Di(0),_a(0),Wn([]),It("\\u672a\\u5f00\\u59cb"),eo(null),Xr("\\u672a\\u5f00\\u59cb"),Zr({}),An([]),Hs(!1),setVisiblePoiLayers({}),redlineUndo.current=[],redlineRedo.current=[],Kr.current&&ss.current&&ss.current.remove(Kr.current),Kr.current=null,window.dispatchEvent(new CustomEvent("archiconcept:site-location-reset")),window.__ARCHICONCEPT_REDLINE_SOURCE__="manual_draw"},saveSiteDraft=()=>{const v=In();Mn.current&&Mn.current({...je,siteIntelligencePackage:v}),siteEditorSnapshot.current=captureSiteEditorSnapshot(),cn("\\u8349\\u7a3f\\u5df2\\u4fdd\\u5b58\\u3002")},closeWithoutSaving=()=>{const v=siteEditorSnapshot.current;v&&(Vn(v.brief),Te(v.confirmedLocation),U(v.candidateLocation),Ot(v.points),vn(v.boundaryStatus),Di(v.areaM2),_a(v.perimeterM),Wn(v.entrances),It(v.entranceStatus),eo(v.radius),Xr(v.contextStatus),Zr(v.surroundings),An(v.analysisItems),Hs(v.skipEntrance),setVisiblePoiLayers(v.visiblePoiLayers),redlineUndo.current=[],redlineRedo.current=[],Mn.current&&Mn.current({...v.brief,siteIntelligencePackage:v.sitePackage})),window.dispatchEvent(new CustomEvent("archiconcept:site-location-reset")),siteEditorSnapshot.current=null,setClosePrompt(!1),se(!1)},saveAndCloseEditor=()=>{saveSiteDraft(),siteEditorSnapshot.current=null,setClosePrompt(!1),se(!1)},siteEditorSnapshotEffect=k.useEffect(()=>{ie&&!siteEditorSnapshot.current&&(siteEditorSnapshot.current=captureSiteEditorSnapshot())},[ie]);',
  "discard unsaved site editor changes"
);

replaceOnce(
  'onClick:()=>{U(null)},className:"px-2.5 py-1.5',
  'onClick:resetSiteSelection,className:"px-2.5 py-1.5',
  "reset downstream site selections"
);

replaceOnce(
  'onClick:()=>{Te(null),U(null),F(""),re([])},className:"text-emerald-700',
  'onClick:resetSiteSelection,className:"text-emerald-700',
  "reset confirmed site selection"
);

replaceOnce(
  'const La=(v,T)=>{',
  'const La=(v,T,keepViewport=!1)=>{',
  "location marker viewport option"
);

replaceOnce(
  'Kr.current=J,q.setZoomAndCenter(15,X,!1)',
  'Kr.current=J,keepViewport||q.setZoomAndCenter(15,X,!1)',
  "preserve map click zoom"
);

replaceOnce(
  'const v=setTimeout(()=>La(j.location,j.name),60);',
  'const v=setTimeout(()=>La(j.location,j.name,j.source==="map_click"),60);',
  "map click marker update"
);

replaceOnce(
  '})(),()=>{v=!0}},[ie]);const gs=',
  '})(),()=>{v=!0}},[ie]);const mapLocationPickEffect=k.useEffect(()=>{const v=ss.current,T=window.AMap;if(!ie||!fe||!v||!T||Ce!=="\\u672a\\u7ed8\\u5236"||Pt!=="\\u672a\\u5f00\\u59cb")return;const V=q=>{if(!q||!q.lnglat)return;const I=q.lnglat.getLng(),X=q.lnglat.getLat(),J=Ne=>{const Ee=Ne?.regeocode||{},Ae=Ee.addressComponent||{},Ke=Ee.pois?.[0],Nt=Ee.formattedAddress||`${I.toFixed(6)}, ${X.toFixed(6)}`,hn=(Ke?.name||Ae.township||Ae.district||"\\u5730\\u56fe\\u70b9\\u9009\\u4f4d\\u7f6e").trim(),jn={id:"map_pick",name:hn,address:Nt,province:Ae.province||"",city:Array.isArray(Ae.city)?Ae.city.join(""):Ae.city||"",district:Ae.district||"",adcode:Ae.adcode||"",location:{lng:I,lat:X},type:"\\u5730\\u56fe\\u70b9\\u9009",source:"map_click"};Te(null),U(jn),Kr.current&&v.remove(Kr.current),Kr.current=new T.Marker({position:new T.LngLat(I,X),map:v,title:hn}),cn("\\u5df2\\u66f4\\u65b0\\u5730\\u56fe\\u70b9\\u9009\\u5730\\u5740\\uff0c\\u8bf7\\u786e\\u8ba4\\u9879\\u76ee\\u4f4d\\u7f6e\\u3002")},Ne=()=>J({regeocode:{formattedAddress:`\\u5730\\u56fe\\u70b9\\u9009\\u5750\\u6807 ${I.toFixed(6)}, ${X.toFixed(6)}`,addressComponent:{}}}),Ee=()=>{try{new T.Geocoder({radius:500,extensions:"all"}).getAddress([I,X],(Ae,Ke)=>Ae==="complete"&&Ke?.regeocode?J(Ke):Ne())}catch{Ne()}};T.Geocoder?Ee():T.plugin(["AMap.Geocoder"],Ee)};return v.on("click",V),()=>v.off("click",V)},[ie,fe,Ce,Pt]);const gs=',
  "map click location selection"
);

replaceOnce(
  'Ki=()=>{var v,T,V;if(!pn.canProceed){N(!0),pn.missingRequired.length>0?(v=document.getElementById("id-section-a"))==null||v.scrollIntoView({behavior:"smooth",block:"center"}):pn.scaleFieldsCount<2?(T=document.getElementById("id-section-b"))==null||T.scrollIntoView({behavior:"smooth",block:"center"}):pn.taskFieldsCount<1&&((V=document.getElementById("id-section-c"))==null||V.scrollIntoView({behavior:"smooth",block:"center"}));return}let q="manual";R==="demo"?q="example":R==="imported"&&(q="import");const I=In(),X={...je,siteIntelligencePackage:I};a&&a(X,q)},Sn=',
  'runProblemPreflight=()=>{let v="manual";R==="demo"?v="example":R==="imported"&&(v="import");const T=In(),V=window.__ARCHICONCEPT_BUILD_INPUT_PREFLIGHT__({brief:je,sitePackage:T,locationConfirmed:!!me,boundaryStatus:Ce,entranceCount:Ut.length,contextStatus:Tt}),q=I=>{const X={...je,area:window.__ARCHICONCEPT_SERIALIZE_AREA__(je.area),gfa:window.__ARCHICONCEPT_SERIALIZE_AREA__(je.gfa),buildableArea:window.__ARCHICONCEPT_SERIALIZE_AREA__(je.buildableArea),siteIntelligencePackage:T,validationSkipped:I?V.validationSkipped:{},validationSkippedDetails:I?V.validationSkippedDetails:[]};a&&a(X,v)};if(!V.hasBlocking&&V.warning.length===0&&V.invalid.length===0){q(!1);return}window.__ARCHICONCEPT_SHOW_INPUT_PREFLIGHT__({result:V,onReturn:()=>{N(V.hasBlocking);const I=[...V.blocking,...V.invalid.filter(X=>X.severity==="blocking"),...V.warning][0],X=I&&document.getElementById(I.section||"id-section-a");X&&X.scrollIntoView({behavior:"smooth",block:"center"})},onContinue:()=>q(!0)})},Ki=runProblemPreflight,problemPreflightNavigationEffect=k.useEffect(()=>{const v=()=>runProblemPreflight();return window.addEventListener("archiconcept:request-problem-identification",v),()=>window.removeEventListener("archiconcept:request-problem-identification",v)},[je,me,Ce,Ut.length,Tt,R]),Sn=',
  "problem identification preflight"
);

replaceOnce(
  'className:"relative z-10 flex flex-col items-center group cursor-pointer",children:',
  'onClick:()=>{r===1&&u===2&&window.dispatchEvent(new CustomEvent("archiconcept:request-problem-identification"))},className:"relative z-10 flex flex-col items-center group cursor-pointer",children:',
  "step two navigation preflight"
);

replaceOnce(
  'missingTags:[]},problemCards:$e,followUpQuestions:',
  'missingTags:(r.validationSkippedDetails||[]).map(Ye=>`${Ye.field}\\uff1a\\u5f85\\u786e\\u8ba4`)},problemCards:[...$e,...((r.validationSkippedDetails||[]).length?[{id:"validation_skipped",category:"\\u8f93\\u5165\\u5b8c\\u6574\\u6027",title:"\\u9884\\u68c0\\u9636\\u6bb5\\u8df3\\u8fc7\\u7684\\u4fe1\\u606f\\u9700\\u8981\\u8865\\u5145\\u786e\\u8ba4",impact:`\\u7528\\u6237\\u4e3b\\u52a8\\u8df3\\u8fc7\\u4e86\\uff1a${(r.validationSkippedDetails||[]).map(Ye=>Ye.field).join("\\u3001")}\\u3002\\u76f8\\u5173\\u7ed3\\u8bba\\u5c06\\u4fdd\\u6301\\u4e3a\\u5f85\\u786e\\u8ba4\\u72b6\\u6001\\u3002`,basis:"\\u4f9d\\u636e\\u8f93\\u5165\\u6761\\u4ef6\\u9884\\u68c0\\u4e2d\\u7684\\u7528\\u6237\\u8df3\\u8fc7\\u8bb0\\u5f55\\u3002",needToConfirm:`\\u9700\\u8981\\u8ffd\\u95ee\\uff1a${(r.validationSkippedDetails||[]).map(Ye=>`${Ye.field}\\uff08${Ye.state}\\uff09`).join("\\uff1b")}\\u3002`,status:"\\u5f85\\u786e\\u8ba4",priority:"high",affectsNextStep:["\\u5bb9\\u91cf\\u5224\\u65ad","\\u6d41\\u7ebf\\u7ec4\\u7ec7","\\u573a\\u5730\\u5206\\u6790"]}]:[])],followUpQuestions:',
  "site-data skipped validation linkage"
);

replaceOnce(
  'missingTags:ve},problemCards:me,followUpQuestions:',
  'missingTags:[...ve,...(r.validationSkippedDetails||[]).map(H=>`${H.field}\\uff1a\\u5f85\\u786e\\u8ba4`)]},problemCards:[...me,...((r.validationSkippedDetails||[]).length?[{id:"validation_skipped",category:"\\u8f93\\u5165\\u5b8c\\u6574\\u6027",title:"\\u9884\\u68c0\\u9636\\u6bb5\\u8df3\\u8fc7\\u7684\\u4fe1\\u606f\\u9700\\u8981\\u8865\\u5145\\u786e\\u8ba4",impact:`\\u7528\\u6237\\u4e3b\\u52a8\\u8df3\\u8fc7\\u4e86\\uff1a${(r.validationSkippedDetails||[]).map(H=>H.field).join("\\u3001")}\\u3002\\u76f8\\u5173\\u7ed3\\u8bba\\u5c06\\u4fdd\\u6301\\u4e3a\\u5f85\\u786e\\u8ba4\\u72b6\\u6001\\u3002`,basis:"\\u4f9d\\u636e\\u8f93\\u5165\\u6761\\u4ef6\\u9884\\u68c0\\u4e2d\\u7684\\u7528\\u6237\\u8df3\\u8fc7\\u8bb0\\u5f55\\u3002",needToConfirm:`\\u9700\\u8981\\u8ffd\\u95ee\\uff1a${(r.validationSkippedDetails||[]).map(H=>`${H.field}\\uff08${H.state}\\uff09`).join("\\uff1b")}\\u3002`,status:"\\u5f85\\u786e\\u8ba4",priority:"high",affectsNextStep:["\\u5bb9\\u91cf\\u5224\\u65ad","\\u6d41\\u7ebf\\u7ec4\\u7ec7","\\u573a\\u5730\\u5206\\u6790"]}]:[])],followUpQuestions:',
  "manual-data skipped validation linkage"
);

replaceOnce(
  'function ak({onBack:r,onNext:a,onReAnalyze:l,onAnswersChange:o,projectData:u={},projectSource:p="manual",analyzedData:m,initialAnswers:f,isStale:x}){var g,b,w,N,S;const[E,R]=k.useState(()=>m||null),',
  'function ak({onBack:r,onNext:a,onReAnalyze:l,onAnswersChange:o,projectData:u={},projectSource:p="manual",analyzedData:m,initialAnswers:f,isStale:x}){var g,b,w,N,S;const augmentValidationSkipped=O=>{const te=u.validationSkippedDetails||[];if(!O||te.length===0)return O;const ye={id:"validation_skipped",category:"\\u8f93\\u5165\\u5b8c\\u6574\\u6027",title:"\\u9884\\u68c0\\u9636\\u6bb5\\u8df3\\u8fc7\\u7684\\u4fe1\\u606f\\u9700\\u8981\\u8865\\u5145\\u786e\\u8ba4",description:`\\u7528\\u6237\\u4e3b\\u52a8\\u8df3\\u8fc7\\u4e86\\uff1a${te.map(xe=>xe.field).join("\\u3001")}\\u3002\\u76f8\\u5173\\u5224\\u65ad\\u5e94\\u4fdd\\u6301\\u4e3a\\u5f85\\u786e\\u8ba4\\u72b6\\u6001\\u3002`,impact:"\\u7f3a\\u5931\\u9879\\u53ef\\u80fd\\u5f71\\u54cd\\u5bb9\\u91cf\\u3001\\u6d41\\u7ebf\\u3001\\u8fb9\\u754c\\u548c\\u5468\\u8fb9\\u5173\\u7cfb\\u5224\\u65ad\\u3002",basis:"\\u4f9d\\u636e\\u8f93\\u5165\\u6761\\u4ef6\\u9884\\u68c0\\u4e2d\\u7684\\u7528\\u6237\\u8df3\\u8fc7\\u8bb0\\u5f55\\u3002",needToConfirm:`\\u9700\\u8981\\u8ffd\\u95ee\\uff1a${te.map(xe=>`${xe.field}\\uff08${xe.state}\\uff09`).join("\\uff1b")}\\u3002`,status:"\\u5f85\\u786e\\u8ba4",priority:"high",affectsNextStep:["\\u5bb9\\u91cf\\u5224\\u65ad","\\u6d41\\u7ebf\\u7ec4\\u7ec7","\\u573a\\u5730\\u5206\\u6790"]};return{...O,projectSummary:{...(O.projectSummary||{}),missingTags:[...((O.projectSummary&&O.projectSummary.missingTags)||[]),...te.map(xe=>`${xe.field}\\uff1a\\u5f85\\u786e\\u8ba4`)]},problemCards:[...(O.problemCards||[]).filter(xe=>xe.id!=="validation_skipped"),ye]}},[E,R]=k.useState(()=>augmentValidationSkipped(m)||null),',
  "online analysis skipped validation helper"
);

replaceOnce(
  'const O=Up(u);R(O),K("review")',
  'const O=Up(u);R(augmentValidationSkipped(O)),K("review")',
  "fallback analysis skipped validation"
);

replaceOnce(
  'if(m){R(m);const te=',
  'if(m){R(augmentValidationSkipped(m));const te=',
  "online analysis skipped validation"
);

replaceOnce(
  're=E!=null&&E.requiredQuestions&&E.requiredQuestions.length>0?E.requiredQuestions:((g=E?.followUpQuestions)==null?void 0:g.primary)||[],ge=re.length,we=re.filter(O=>z[O.id]&&z[O.id]!=="").length,j=E!=null&&E.optionalQuestions&&E.optionalQuestions.length>0?E.optionalQuestions:((b=E?.followUpQuestions)==null?void 0:b.secondary)||[];j.length;const U=',
  'normalizeQuestion=(O,te,ye)=>{const Ve=typeof O==="string"?{question:O}:O||{},xe=(typeof O==="string"?(E?.problemCards||[])[te]:null)||(E?.problemCards||[]).find(Re=>Re.id===(Ve.linkedIssueId||Ve.issueId||Ve.problemId)),nt=Ve.question||Ve.q||Ve.prompt||Ve.title||Ve.label||(xe?.needToConfirm||"").replace(/^\\u9700\\u8981\\u786e\\u8ba4\\uff1a/,"")||`${xe?.title||"\\u8be5\\u8bbe\\u8ba1\\u6761\\u4ef6"}\\u662f\\u5426\\u5e94\\u4f5c\\u4e3a\\u540e\\u7eed\\u65b9\\u6848\\u7684\\u660e\\u786e\\u7ea6\\u675f\\uff1f`,Fe=Ve.options||Ve.choices||Ve.answers||["\\u9700\\u8981\\u4f5c\\u4e3a\\u786c\\u6027\\u6761\\u4ef6","\\u53ef\\u4f5c\\u4e3a\\u5efa\\u8bae\\u6761\\u4ef6","\\u6682\\u4e0d\\u786e\\u5b9a\\uff0c\\u7531\\u7cfb\\u7edf\\u4f30\\u7b97"],Z=Ve.reason||Ve.whyRequired||Ve.basis||xe?.basis||xe?.description||"\\u8be5\\u5224\\u65ad\\u4f1a\\u76f4\\u63a5\\u6539\\u53d8\\u540e\\u7eed\\u7a7a\\u95f4\\u7ec4\\u7ec7\\u4e0e\\u6280\\u672f\\u7b56\\u7565\\u3002",Le=Ve.impact||Ve.affects||Ve.affectsNextStep||xe?.affectsNextStep||xe?.impact||xe?.tags||"\\u5f71\\u54cd\\u540e\\u7eed\\u7a7a\\u95f4\\u610f\\u56fe\\u4e0e\\u7b56\\u7565\\u5339\\u914d\\u3002";return{...Ve,id:Ve.id||`${ye?"required":"optional"}_${te+1}`,question:nt,options:Array.isArray(Fe)&&Fe.length?Fe:["\\u9700\\u8981","\\u4e0d\\u9700\\u8981","\\u6682\\u4e0d\\u786e\\u5b9a\\uff0c\\u7531\\u7cfb\\u7edf\\u4f30\\u7b97"],reason:Z,impact:Le,required:ye}},re=(E!=null&&E.requiredQuestions&&E.requiredQuestions.length>0?E.requiredQuestions:((g=E?.followUpQuestions)==null?void 0:g.primary)||[]).map((O,te)=>normalizeQuestion(O,te,!0)),ge=re.length,we=re.filter(O=>z[O.id]&&z[O.id]!=="").length,j=(E!=null&&E.optionalQuestions&&E.optionalQuestions.length>0?E.optionalQuestions:((b=E?.followUpQuestions)==null?void 0:b.secondary)||[]).map((O,te)=>normalizeQuestion(O,te,!1));j.length;const U=',
  "problem question normalization"
);

replaceOnce(
  'de=E?.projectSummary||{projectName:u.name||"未指定",buildingType:u.type||"未指定",location:u.location||"未指定",keyMetrics:[{label:"用地面积",value:u.area?`${u.area} ㎡`:"未指定"},{label:"总建筑面积",value:u.gfa?`${u.gfa} ㎡`:"未指定"},{label:"建筑密度",value:u.density?`${u.density} %`:"未指定"},{label:"绿化率",value:u.greenery?`${u.greenery} %`:"未指定"},{label:"建筑限高",value:u.height?`${u.height} m`:"未指定"},{label:"层数范围",value:u.floors||"未指定"}],missingTags:[]},be=',
  'de={...(E?.projectSummary||{}),projectName:E?.projectSummary?.projectName||u.name||u.projectName||"未指定",buildingType:E?.projectSummary?.buildingType||u.type||u.buildingType||"未指定",location:E?.projectSummary?.location||u.location||"未指定",keyMetrics:E?.projectSummary?.keyMetrics?.length?E.projectSummary.keyMetrics:[{label:"用地面积",value:u.area?`${u.area} ㎡`:"未指定"},{label:"总建筑面积",value:u.gfa?`${u.gfa} ㎡`:"未指定"},{label:"建筑密度",value:u.density?`${u.density} %`:"未指定"},{label:"绿化率",value:u.greenery?`${u.greenery} %`:"未指定"},{label:"建筑限高",value:u.height?`${u.height} m`:"未指定"},{label:"层数范围",value:u.floors||"未指定"}],missingTags:E?.projectSummary?.missingTags||[]},be=',
  "problem project summary merge"
);

replaceOnce(
  'be=E?.problemCards||[],ke=E?.hiddenProblemCards||[],le=be.length>0?ke.length>0?be:be.slice(0,5):[],H=ke.length>0?ke:be.length>5?be.slice(5):[],Ie=se?[...le,...H]:le,_e=le.length+H.length,',
  'be=E?.problemCards||[],ke=E?.hiddenProblemCards||[],problemRank=O=>O.priority==="high"||O.pri==="high"||O.severity==="high"?0:O.priority==="low"||O.pri==="low"||O.severity==="low"?2:1,allProblems=[...be,...ke].filter((O,te,ye)=>ye.findIndex(xe=>(xe.id||xe.title)===(O.id||O.title))===te).sort((O,te)=>problemRank(O)-problemRank(te)),le=allProblems.slice(0,3),H=allProblems.slice(3),Ie=se?allProblems:le,_e=allProblems.length,',
  "problem priority sorting"
);

replaceOnce(
  'const ye=O.priority==="high"||O.pri==="high",xe=O.priority==="low"||O.pri==="low",Re=ye?',
  'const ye=O.priority==="high"||O.pri==="high"||O.severity==="high",xe=O.priority==="low"||O.pri==="low"||O.severity==="low",priorityCode=ye?"P0":xe?"P2":"P1",Re=ye?',
  "problem priority code"
);

replaceOnce(
  'className:`p-5 border ${Re} rounded-xl space-y-4',
  'className:`problem-card problem-card-${priorityCode.toLowerCase()} p-5 border ${Re} rounded-xl space-y-4',
  "problem card priority class"
);

replaceOnce(
  'children:nt})]}),n.jsx("h4"',
  'children:priorityCode})]}),n.jsx("h4"',
  "problem priority badge"
);

replaceOnce(
  'O.question||O.q]}),n.jsx("div",{className:"flex flex-wrap gap-2.5"',
  'O.question||O.q]}),O.reason&&n.jsxs("p",{className:"problem-question-reason",children:[n.jsx("span",{children:"\\u5fc5\\u987b\\u56de\\u7b54\\u7684\\u539f\\u56e0\\uff1a"}),O.reason]}),O.impact&&n.jsxs("p",{className:"problem-question-impact",children:[n.jsx("span",{children:"\\u5bf9\\u540e\\u7eed\\u5f71\\u54cd\\uff1a"}),Array.isArray(O.impact)?O.impact.join("\\u3001"):O.impact]}),n.jsx("div",{className:"flex flex-wrap gap-2.5"',
  "required question context"
);

replaceOnce(
  'u.inputReview.problemSummaries.map((H,Ie)=>({title:`${Ie+1}. ${H.title}`,desc:H.description}))',
  'u.inputReview.problemSummaries.map((H,Ie)=>({title:`${Ie+1}. ${typeof H==="string"?H:H.title||H.name||"\\u5f85\\u786e\\u8ba4\\u95ee\\u9898"}`,desc:typeof H==="string"?"\\u7531\\u95ee\\u9898\\u8bc6\\u522b\\u7ed3\\u679c\\u8f6c\\u5165\\u7a7a\\u95f4\\u610f\\u56fe\\u5224\\u65ad\\u3002":H.description||H.desc||""}))',
  "spatial intent problem summary normalization"
);

replaceOnce(
  'mapNoiseEffect=k.useEffect',
  'redlineKeyboardMoveEffect=k.useEffect(()=>{if(Ce!=="\\u7f16\\u8f91\\u4e2d"||redlineMode!=="move"||We.length<3)return;const v=T=>{const V=T.target;if(V&&(V.matches?.("input,textarea,select")||V.isContentEditable)||T.ctrlKey||T.metaKey)return;const q={ArrowUp:[0,1],Numpad8:[0,1],ArrowDown:[0,-1],Numpad2:[0,-1],ArrowLeft:[-1,0],Numpad4:[-1,0],ArrowRight:[1,0],Numpad6:[1,0]}[T.code]||{ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[T.key];if(!q)return;T.preventDefault();const I=T.altKey?0.1:T.shiftKey?1:0.25,X=We.reduce((Ae,Ke)=>Ae+Ke.lat,0)/We.length,J=Math.max(.2,Math.cos(X*Math.PI/180)),Ne=q[0]*I/(111320*J),Ee=q[1]*I/111320;redlineUndo.current.push({points:cloneRedline(We),status:Ce}),redlineRedo.current=[],Ot(Ae=>Ae.map(Ke=>({lng:Ke.lng+Ne,lat:Ke.lat+Ee}))),setRedlineHistoryTick(Ae=>Ae+1)};return window.addEventListener("keydown",v),()=>window.removeEventListener("keydown",v)},[Ce,redlineMode,We]),redlineExternalTransformEffect=k.useEffect(()=>{const v=T=>{const V=T.detail||{},q=Array.isArray(V.points)?V.points.map(I=>({lng:Number(I.lng),lat:Number(I.lat)})).filter(I=>Number.isFinite(I.lng)&&Number.isFinite(I.lat)):null;if(V.phase==="start"){redlineMoveStart.current={points:cloneRedline(We),status:Ce};return}q&&q.length>=3&&Ot(q),V.phase==="end"&&redlineMoveStart.current&&(redlineUndo.current.push(redlineMoveStart.current),redlineRedo.current=[],redlineMoveStart.current=null,setRedlineHistoryTick(I=>I+1))},T=I=>{const X=I.detail?.mode;X&&setRedlineMode(X)};return window.addEventListener("archiconcept:redline-transform",v),window.addEventListener("archiconcept:redline-mode",T),()=>{window.removeEventListener("archiconcept:redline-transform",v),window.removeEventListener("archiconcept:redline-mode",T)}},[We,Ce]),mapNoiseEffect=k.useEffect',
  "redline keyboard movement"
);

replaceOnce(
  'const Ne=cloneRedline(We),Ee=J.lnglat.getLng(),Ae=J.lnglat.getLat(),Ke=Nt=>{const hn=Nt.lnglat.getLng()-Ee,jn=Nt.lnglat.getLat()-Ae;Ot(Ne.map(Bt=>({lng:Bt.lng+hn,lat:Bt.lat+jn})))}',
  'const Ne=cloneRedline(We),Ee=J.lnglat.getLng(),Ae=J.lnglat.getLat(),Ke=Nt=>{const hn=(Nt.lnglat.getLng()-Ee)*.35,jn=(Nt.lnglat.getLat()-Ae)*.35;Ot(Ne.map(Bt=>({lng:Bt.lng+hn,lat:Bt.lat+jn})))}',
  "whole redline drag sensitivity"
);

source = source.replaceAll(
  'redlineMode!=="move"&&redlineMode!=="delete"&&commitRedline',
  'redlineMode!=="move"&&redlineMode!=="delete"&&redlineMode!=="freeTransform"&&commitRedline'
);

replaceOnce(
  '},undoRedline=()=>{const v=redlineUndo.current.pop();',
  '},imageImportEffect=k.useEffect(()=>{const v=T=>{const V=T.detail||{};let q=[];if(Array.isArray(V.geoPoints))q=V.geoPoints.map(I=>({lng:Number(I.lng),lat:Number(I.lat)})).filter(I=>Number.isFinite(I.lng)&&Number.isFinite(I.lat));else if(Array.isArray(V.points)){const I=Math.max(.2,Number(V.aspect)||1),X=Gr.width*.62,J=Gr.height*.62;let Ne=Math.min(X,J*I),Ee=Ne/I;Ee>J&&(Ee=J,Ne=Ee*I);const Ae=(Gr.width-Ne)/2,Ke=(Gr.height-Ee)/2;q=V.points.map(Nt=>{const hn=Ae+Number(Nt.x)*Ne,jn=Ke+Number(Nt.y)*Ee;if(fe&&ss.current&&window.AMap&&ss.current.containerToLngLat){const Bt=ss.current.containerToLngLat(new window.AMap.Pixel(hn,jn));return{lng:Bt.getLng(),lat:Bt.getLat()}}return ao(hn,jn)})}if(q.length<3){cn("\\u8f6e\\u5ed3\\u5bfc\\u5165\\u5730\\u56fe\\u5931\\u8d25\\u3002");return}window.__ARCHICONCEPT_REDLINE_SOURCE__="image_import";commitRedline(q,"\\u7f16\\u8f91\\u4e2d")};return window.addEventListener("archiconcept:redline-import",v),()=>window.removeEventListener("archiconcept:redline-import",v)},[Gr,fe,me]),undoRedline=()=>{const v=redlineUndo.current.pop();',
  "image import bridge"
);

const blobUrl = URL.createObjectURL(
  new Blob([source, "\n//# sourceURL=archiconcept-runtime.js"], {
    type: "text/javascript"
  })
);

try {
  await import(blobUrl);
} finally {
  URL.revokeObjectURL(blobUrl);
}
