import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAreaProgramModel,
  buildBoundaryValidation,
  buildDesignConstraintTable,
  calculateAreaProgramItems,
  deriveSiteInsights,
  deriveNormDownstreamEffects,
  estimateNormDesignConstraint,
  legacyAdapters,
  parseAreaProgram,
  recommendNormConstraints,
  resolveNormDesignConstraints
} from "../assets/archiconcept-data-chain.js";
import { deriveBoundaryReview } from "../assets/archiconcept-step12.js";

test("Step 1 blocks incomplete boundary data", () => {
  const result = buildBoundaryValidation({
    name: "",
    type: "",
    area: "0",
    needs: ""
  });
  assert.equal(result.blockingItems.length, 4);
});

test("empty boundary input does not generate norm matches", () => {
  assert.deepEqual(recommendNormConstraints("", {}), []);
  assert.deepEqual(resolveNormDesignConstraints({}), []);
  const review = deriveBoundaryReview({ data: {} });
  assert.equal(review.norms.length, 0);
  assert.equal(review.normDesignConstraints.length, 0);
});

test("Step 1 produces norms and a design constraint table", () => {
  const adapted = legacyAdapters.boundaryAnchorPackage({
    projectData: {
      name: "测试项目",
      type: "教育建筑 / Education",
      area: "25000",
      needs: "教学、公共活动与后勤管理",
      far: "1.2",
      height: "24"
    }
  });
  const review = deriveBoundaryReview(adapted);
  assert.ok(review.norms.length >= 4);
  assert.ok(review.constraints.length >= 12);
  assert.ok(review.pendingConstraints.length);
  assert.equal(adapted.completionStatus, "ready");
});

test("Step 1 detects invalid percentage values", () => {
  const result = buildBoundaryValidation({
    name: "测试项目",
    type: "公共建筑",
    area: "25000",
    needs: "公共活动",
    density: "120"
  });
  assert.ok(
    result.conflicts.some(
      (item) => item.field === "density" && item.severity === "blocking"
    )
  );
});

test("Step 2 derives limits, opportunities, SWOT and design hints", () => {
  const result = deriveSiteInsights({
    surroundings: {
      traffic: {
        judgement: "公交站点步行可达。",
        designImpact: "主入口宜面向公共交通到达方向。"
      },
      eco: {
        judgement: "滨水开放空间是主要景观资源。",
        designImpact: "公共空间宜保持滨水视线联系。"
      },
      sensitive: {
        judgement: "儿童活动空间对设备噪声敏感。",
        designImpact: "设备区应远离儿童活动界面。"
      },
      disturbance: {
        judgement: "东侧道路存在交通噪声。"
      }
    }
  });
  assert.equal(result.siteLimits.length, 2);
  assert.equal(result.siteOpportunities.length, 2);
  assert.equal(result.designImpactHints.length, 3);
  assert.ok(result.swot.strengths.length);
  assert.ok(result.swot.threats.length);
});

test("industrial projects receive a specialized norm reminder", () => {
  const norms = recommendNormConstraints("工业与基础设施建筑", {
    needs: "地下数据中心、冷却机房、公共展示",
    users: "运维人员、市民游客"
  });
  const industrial = norms.find((item) => item.id === "industrial");
  const fire = norms.find((item) => item.id === "gb55037");
  assert.ok(industrial);
  assert.equal(industrial.matchStatus, "系统匹配");
  assert.ok(industrial.verificationItems.length >= 3);
  assert.match(industrial.downstreamImpact, /功能建构/);
  assert.equal(fire.priority, "重点关注");
  assert.match(fire.triggerReason, /地下|机房/);
});

test("public functions strengthen accessibility attention", () => {
  const norms = recommendNormConstraints("文化建筑", {
    needs: "展览展示、公共活动",
    users: "市民、游客"
  });
  const accessibility = norms.find((item) => item.id === "gb55019");
  assert.equal(accessibility.priority, "重点关注");
  assert.match(accessibility.triggerReason, /公众|公共/);
  assert.match(accessibility.downstreamImpact, /入口组织/);
});

test("parses a detailed brief area schedule into a hierarchy", () => {
  const items = parseAreaProgram(`
（1）社区商业：550㎡，包括
  菜市场及食品店铺：300㎡
  小超市：200㎡
  商品库房：50㎡
（2）文化休闲活动：650㎡，包括
  书吧：100㎡
  休闲饮品：200㎡
  培训体验：100㎡
  健身：150㎡
  棋牌室：100㎡
`);
  assert.equal(items.length, 10);
  assert.equal(items[0].level, 1);
  assert.equal(items[1].parentId, items[0].id);
  assert.equal(items[0].areaM2, 550);
  assert.equal(items[4].areaM2, 650);
});

test("parent function keeps its declared area and validates child totals", () => {
  const items = calculateAreaProgramItems([
    {
      id: "parent",
      name: "社区商业",
      level: 1,
      areaM2: 999
    },
    {
      id: "child-a",
      parentId: "parent",
      name: "菜市场",
      level: 2,
      quantity: 1,
      unitAreaM2: 300
    },
    {
      id: "child-b",
      parentId: "parent",
      name: "小超市",
      level: 2,
      quantity: 2,
      unitAreaM2: 100
    }
  ]);
  const parent = items.find((item) => item.id === "parent");
  assert.equal(parent.areaM2, 999);
  assert.equal(parent.childAreaM2, 500);
  assert.equal(parent.areaDifferenceM2, -499);
  assert.equal(buildAreaProgramModel({ items }).allocatedAreaM2, 999);
});

test("repairs flat imported area rows when child sums match parent areas", () => {
  const items = calculateAreaProgramItems([
    { id: "commercial", name: "社区商业", level: 1, areaM2: 550 },
    { id: "market", name: "菜市场及食品店铺", level: 1, areaM2: 300 },
    { id: "store", name: "小超市", level: 1, areaM2: 200 },
    { id: "warehouse", name: "商品库房", level: 1, areaM2: 50 },
    { id: "culture", name: "文化休闲活动", level: 1, areaM2: 650 },
    { id: "book", name: "书吧", level: 1, areaM2: 100 },
    { id: "drink", name: "休闲饮品", level: 1, areaM2: 200 },
    { id: "training", name: "培训体验", level: 1, areaM2: 100 },
    { id: "fitness", name: "健身", level: 1, areaM2: 150 },
    { id: "chess", name: "棋牌室", level: 1, areaM2: 100 },
    { id: "equipment", name: "设备用房", level: 1, areaM2: 70 },
    { id: "fire", name: "消防控制室", level: 1, areaM2: 20 },
    { id: "power", name: "高低压配电房", level: 1, areaM2: 50 }
  ]);
  const commercial = items.find((item) => item.id === "commercial");
  const market = items.find((item) => item.id === "market");
  const culture = items.find((item) => item.id === "culture");
  const book = items.find((item) => item.id === "book");
  const equipment = items.find((item) => item.id === "equipment");
  const fire = items.find((item) => item.id === "fire");

  assert.equal(commercial.level, 1);
  assert.equal(market.level, 2);
  assert.equal(market.parentId, commercial.id);
  assert.equal(culture.level, 1);
  assert.equal(book.level, 2);
  assert.equal(book.parentId, culture.id);
  assert.equal(equipment.level, 1);
  assert.equal(fire.level, 2);
  assert.equal(fire.parentId, equipment.id);
  assert.equal(buildAreaProgramModel({ items }).allocatedAreaM2, 1270);
});

test("serializes area hierarchy in parent-child order", async () => {
  const { serializeAreaProgram } = await import(
    "../assets/archiconcept-data-chain.js"
  );
  const value = serializeAreaProgram([
    {
      id: "commercial",
      name: "社区商业",
      level: 1,
      quantity: 1,
      unitAreaM2: 550
    },
    {
      id: "culture",
      name: "文化休闲活动",
      level: 1,
      quantity: 1,
      unitAreaM2: 650
    },
    {
      id: "market",
      parentId: "commercial",
      name: "菜市场及食品店铺",
      level: 2,
      quantity: 1,
      unitAreaM2: 300
    },
    {
      id: "coffee",
      parentId: "culture",
      name: "休闲饮品",
      level: 2,
      quantity: 1,
      unitAreaM2: 200
    }
  ]);

  assert.deepEqual(
    value.split("\n").map((row) => row.split("｜")[1]),
    ["社区商业", "菜市场及食品店铺", "文化休闲活动", "休闲饮品"]
  );
});

test("parses demo range schedules and their child functions", () => {
  const items = parseAreaProgram(
    "地下技术功能约 18000–35000㎡，其中算力核心区约 8000–15000㎡，技术支撑区约 7000–12000㎡；地上公共功能约 12000–20000㎡，其中展示科普空间约 2000–4000㎡，市民活动空间约 3000–5000㎡"
  );
  assert.equal(items.length, 6);
  assert.equal(items[0].level, 1);
  assert.equal(items[1].parentId, items[0].id);
  assert.equal(items[0].areaM2, 26500);
  assert.equal(items[0].childAreaM2, 21000);
  assert.equal(items[0].areaDifferenceM2, -5500);
  assert.equal(items[3].level, 1);
});

test("constraint baseline identifies missing fields and downstream impact", () => {
  const rows = buildDesignConstraintTable({
    projectIdentity: {
      buildingType: "公共建筑",
      location: "深圳前海"
    },
    hardControls: {
      siteAreaM2: 40000,
      grossFloorAreaM2: "",
      floorAreaRatio: 1.1
    },
    functionRequirements: {
      program: "展览、公共活动",
      targetUsers: ""
    },
    areaProgram: { items: [], allocatedAreaM2: 0 },
    conflicts: []
  });
  const gfa = rows.find((item) => item.key === "gfa");
  const users = rows.find((item) => item.key === "targetUsers");
  assert.equal(gfa.statusCode, "missing");
  assert.equal(gfa.targetField, "gfa");
  assert.match(gfa.impact, /功能建构/);
  assert.equal(users.statusCode, "missing");
});

test("constraint baseline detects GFA and FAR inconsistency", () => {
  const rows = buildDesignConstraintTable({
    projectIdentity: {
      buildingType: "公共建筑",
      location: "深圳前海"
    },
    hardControls: {
      siteAreaM2: 40000,
      grossFloorAreaM2: 45000,
      floorAreaRatio: 1.1
    },
    functionRequirements: {
      program: "公共活动",
      targetUsers: "市民"
    },
    areaProgram: {
      items: [{ id: "a", name: "公共活动", areaM2: 45000 }],
      allocatedAreaM2: 45000
    },
    conflicts: []
  });
  assert.equal(rows.find((item) => item.key === "gfa").statusCode, "conflict");
  assert.equal(rows.find((item) => item.key === "far").statusCode, "conflict");
  assert.match(rows.find((item) => item.key === "gfa").issue, /44,000/);
});

test("matched norms generate actionable design constraints", () => {
  const data = {
    projectIdentity: { buildingType: "工业与基础设施建筑" },
    hardControls: { siteAreaM2: 40000 },
    functionRequirements: {
      program: "地下数据中心、设备机房、公共展示",
      targetUsers: "运维人员、市民游客"
    }
  };
  const constraints = resolveNormDesignConstraints(data);
  assert.ok(constraints.some((item) => item.id === "fire-access"));
  assert.ok(constraints.some((item) => item.id === "industrial-service"));
  assert.ok(constraints.every((item) => item.status === "pending"));
  assert.ok(
    constraints.every(
      (item) => item.options.length && item.impactAreas.length
    )
  );
});

test("system estimates become downstream constraints and E baseline rows", () => {
  const base = {
    projectIdentity: { buildingType: "工业与基础设施建筑" },
    hardControls: { siteAreaM2: 40000 },
    functionRequirements: {
      program: "地下数据中心、设备机房、公共展示",
      targetUsers: "市民游客"
    }
  };
  const estimate = estimateNormDesignConstraint("fire-access", base);
  const data = {
    ...base,
    normConstraintDecisions: { "fire-access": estimate }
  };
  const effects = deriveNormDownstreamEffects(data);
  const rows = buildDesignConstraintTable(data);
  assert.equal(effects.site.length, 1);
  assert.equal(effects.site[0].status, "systemEstimated");
  assert.equal(
    rows.find((item) => item.key === "norm-fire-access").statusCode,
    "estimated"
  );
});

test("norm site constraints participate in site insight generation", () => {
  const result = deriveSiteInsights({
    normDerivedConstraints: [
      {
        label: "消防扑救条件",
        text: "消防扑救条件：预留可贯通消防车道及扑救面",
        impact: "场地道路和建筑退让"
      }
    ]
  });
  assert.ok(result.siteLimits.some((item) => /消防车道/.test(item)));
  assert.ok(result.designImpactHints.some((item) => /建筑退让/.test(item)));
});
