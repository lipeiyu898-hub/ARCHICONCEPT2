import express from "express";
import { config, mask } from "./config.js";
import { callDeepSeekJson, callDeepSeekText } from "./llm.js";
import {
  conceptFallback,
  mergeBriefExtraction,
  parseBriefFallback,
  problemFallback,
  spatialFallback,
  strategyFallback
} from "./fallbacks.js";
import { amapAnalyzeContext, amapGeocode, amapSuggest } from "./amap.js";

export const apiRouter = express.Router();

const assistantSystem = `你是 ARCHICONCEPT 的建筑前期设计助手，名字是 ArChi。
你可以解释当前页面、字段含义、建筑前期流程、场地分析、功能组织和概念策略。
你可以回答建筑知识问题，但不要替代专业审查。
涉及规范、消防、结构、机电和报批时，只能作为前期提示，并提醒用户交由专业人员复核。
你不能声称已经替用户修改数据，也不能要求用户提供 API Key、Token 或环境变量。
如果项目信息不足，直接说明缺少哪些条件。
回答要简洁、具体、可执行。默认使用中文。`;

const llmSystem = "你是 ARCHICONCEPT 的建筑前期策划与概念方案推演 API。你擅长将任务书、场地条件、问题识别、空间意图和策略包转成严格结构化 JSON。";

function sendError(res, error, fallback) {
  if (fallback) return res.json(fallback);
  const code = error.code || error.message || "API_ERROR";
  res.status(error.status || 500).json({ error: code, message: error.message || "请求失败" });
}

function textValue(value, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactAssistantContext(context = {}) {
  const project = context.projectSnapshot || {};
  return {
    url: textValue(context.url, 160),
    pageTitle: textValue(context.pageTitle, 80),
    workflowStep: Number(context.workflowStep) || null,
    visibleHeadings: Array.isArray(context.visibleHeadings)
      ? context.visibleHeadings.map((item) => textValue(item, 80)).filter(Boolean).slice(0, 8)
      : [],
    projectSnapshot: {
      projectName: textValue(project.projectName, 120),
      buildingType: textValue(project.buildingType, 120),
      location: textValue(project.location, 120),
      siteArea: textValue(project.siteArea, 80),
      gfa: textValue(project.gfa, 80),
      currentStepStatus: textValue(project.currentStepStatus, 120)
    }
  };
}

function normalizeAssistantHistory(history = []) {
  return Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.trim()
        )
        .slice(-8)
        .map((item) => ({
          role: item.role,
          content: item.content.trim().slice(0, 1800)
        }))
    : [];
}

apiRouter.get("/env-check", (_req, res) => {
  res.json({
    ok: true,
    provider: "deepseek",
    deepseek: {
      configured: Boolean(config.deepseekApiKey),
      key: mask(config.deepseekApiKey),
      baseUrl: config.deepseekBaseUrl,
      model: config.deepseekModel
    },
    amap: {
      webServiceConfigured: Boolean(config.amapWebServiceKey),
      webServiceKey: mask(config.amapWebServiceKey),
      restBaseUrl: config.amapRestBaseUrl,
      jsConfigured: Boolean(config.amapJsKey),
      jsKey: mask(config.amapJsKey),
      securityJsCodeConfigured: Boolean(config.amapSecurityJsCode),
      securityJsCode: mask(config.amapSecurityJsCode)
    },
    caseSearch: {
      tavilyConfigured: Boolean(config.tavilyApiKey),
      serpApiConfigured: Boolean(config.serpApiKey)
    }
  });
});

apiRouter.get("/amap/browser-config", (_req, res) => {
  res.json({
    ok: Boolean(config.amapJsKey),
    jsKey: config.amapJsKey,
    securityJsCode: config.amapSecurityJsCode
  });
});

apiRouter.post("/assistant-chat", async (req, res) => {
  const message = String(req.body?.message || "").trim().slice(0, 2000);
  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "EMPTY_MESSAGE",
      message: "请输入你想咨询的问题。"
    });
  }

  const pageContext = compactAssistantContext(req.body?.pageContext || {});
  const history = normalizeAssistantHistory(req.body?.history || []);
  const userPayload = [
    `当前页面上下文：${JSON.stringify(pageContext)}`,
    `用户问题：${message}`
  ].join("\n\n");

  try {
    const answer = await callDeepSeekText({
      system: assistantSystem,
      messages: [...history, { role: "user", content: userPayload }],
      temperature: 0.35
    });

    res.json({
      ok: true,
      answer: answer || "我暂时没有生成有效回复，请换一种问法再试。",
      suggestedPrompts: ["继续问当前页面", "解释建筑术语", "检查缺失条件"],
      source: "deepseek"
    });
  } catch (error) {
    const code = error.code || error.message || "ASSISTANT_CHAT_FAILED";
    res.status(error.status || 500).json({
      ok: false,
      error: code,
      message:
        code === "MISSING_DEEPSEEK_API_KEY"
          ? "AI 助手暂未配置模型服务。"
          : "AI 助手暂时无法连接模型服务，请稍后再试。"
    });
  }
});

apiRouter.post("/parse-brief", async (req, res) => {
  const text = String(req.body.extractedText || "");
  try {
    const data = await callDeepSeekJson({
      system: llmSystem,
      user: `从建筑项目任务书文本中抽取字段。必须返回以下 JSON 字段：projectName, buildingType, location, siteArea, far, buildingDensity, greenRatio, heightLimit, gfa, floors, buildableBoundaryArea, siteInfo, program, targetUsers, areaProgram, keywords(array), missingFields(array), reviewItems(array), taskJudgement。
areaProgram 必须提取完整的多行功能面积分表，不能只返回总建筑面积。优先返回字符串，每行格式为“1级｜功能名称｜数量×单项面积㎡”或“2级｜子功能名称｜数量×单项面积㎡”；父级功能为 1 级，明细功能为 2 级。若任务书包含“2间、每间15㎡”，应输出“2级｜办公室｜2×15㎡”。不要省略面积表中的任何有效行。
文件名：${req.body.fileName || ""}
文本：${text.slice(0, 30000)}`
    });
    res.json(mergeBriefExtraction(parseBriefFallback(text), data));
  } catch (error) {
    sendError(res, error, null);
  }
});

apiRouter.post("/analyze-problems", async (req, res) => {
  try {
    const fallback = problemFallback(req.body);
    const data = await callDeepSeekJson({
      system: llmSystem,
      user: `基于项目输入识别建筑前期关键问题。返回 JSON，字段必须包含：buildingType, issues(array), hiddenIssues(array), problemCards(array), summaryPanel(object), followUpQuestions({primary:array,secondary:array})。problemCards 每项包含 id, category, title, description, severity, tags。\n输入：${JSON.stringify(req.body).slice(0, 12000)}`
    });
    res.json({ ...fallback, ...data });
  } catch (error) {
    sendError(res, error, problemFallback(req.body));
  }
});

apiRouter.post("/generate-spatial-intent", async (req, res) => {
  try {
    const fallback = spatialFallback(req.body);
    const data = await callDeepSeekJson({
      system: llmSystem,
      user: `根据问题包和追问回答生成空间意图。返回 JSON，字段必须包含：intentCards(array), summaryPanel({mainIntent,secondaryIntent,spatialDirection}), inputReview({problemSummaries:array})。intentCards 每项包含 title, description, priority, highlight(boolean), tags。\n输入：${JSON.stringify(req.body).slice(0, 14000)}`
    });
    res.json({ ...fallback, ...data });
  } catch (error) {
    sendError(res, error, spatialFallback(req.body));
  }
});

apiRouter.post("/match-strategies", async (req, res) => {
  try {
    const fallback = strategyFallback(req.body);
    const data = await callDeepSeekJson({
      system: llmSystem,
      user: `根据空间意图匹配设计策略。返回 JSON，字段必须包含：strategyCards(array), comparisonCriteria(array), selections({priority,combo}), strategyDirection, referenceCases(array)。strategyCards 每项包含 title, desc, status, tags, elements。\n输入：${JSON.stringify(req.body).slice(0, 14000)}`
    });
    res.json({ ...fallback, ...data });
  } catch (error) {
    sendError(res, error, strategyFallback(req.body));
  }
});

apiRouter.post("/generate-concept-plan", async (req, res) => {
  try {
    const fallback = conceptFallback(req.body);
    const data = await callDeepSeekJson({
      system: llmSystem,
      user: `根据策略包生成概念方案原型。返回 JSON，字段必须包含：baseline, diagramData({legend:array}), prototypes(array), mainZones(array), supportZones(array), publicZones(array), serviceZones(array), openSpaceZones(array), narrative。\n输入：${JSON.stringify(req.body).slice(0, 16000)}`
    });
    res.json({ ...fallback, ...data });
  } catch (error) {
    sendError(res, error, conceptFallback(req.body));
  }
});

apiRouter.post("/search-cases", async (req, res) => {
  const query = [
    req.body?.projectBrief?.type,
    req.body?.spatialIntent?.selectedPrimaryIntent,
    req.body?.strategyPackage?.selectedCombination,
    "architecture case study"
  ].filter(Boolean).join(" ");

  if (!config.tavilyApiKey && !config.serpApiKey) {
    return res.json({
      status: "unconfigured",
      errorMessage: "案例联网检索尚未配置。可配置 TAVILY_API_KEY 或 SERPAPI_API_KEY。",
      cases: [],
      queryUsed: [query],
      stats: null
    });
  }

  try {
    if (config.tavilyApiKey) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: config.tavilyApiKey, query, max_results: 6, search_depth: "basic" })
      });
      const data = await response.json();
      const cases = (data.results || []).map((item, index) => ({
        id: `web-${index + 1}`,
        title: item.title,
        summary: item.content,
        sourceName: new URL(item.url).hostname,
        sourceUrl: item.url,
        tags: ["联网检索", "案例参考"],
        relevanceScore: Math.round((item.score || 0.8) * 100)
      }));
      return res.json({ status: cases.length ? "success" : "empty", cases, queryUsed: [query], stats: { rawResults: data.results?.length || 0 } });
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", config.serpApiKey);
    const data = await fetch(url).then((r) => r.json());
    const cases = (data.organic_results || []).slice(0, 6).map((item, index) => ({
      id: `web-${index + 1}`,
      title: item.title,
      summary: item.snippet,
      sourceName: item.source || new URL(item.link).hostname,
      sourceUrl: item.link,
      tags: ["联网检索", "案例参考"],
      relevanceScore: 88 - index
    }));
    res.json({ status: cases.length ? "success" : "empty", cases, queryUsed: [query], stats: { rawResults: data.organic_results?.length || 0 } });
  } catch (error) {
    res.status(502).json({ status: "error", errorMessage: error.message, cases: [], queryUsed: [query] });
  }
});

apiRouter.get("/amap/suggest", amapSuggest);
apiRouter.get("/amap/geocode", amapGeocode);
apiRouter.post("/amap/analyze-context", amapAnalyzeContext);
