import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialConceptStrategyData,
  createInitialFunctionConstructData,
  createProjectDataChain,
  isGenericConcept,
  validateConceptStrategyData
} from "../assets/archiconcept-data-chain.js";
import { rebuildDerived } from "../assets/archiconcept-step4.js";

const makeChain = () => {
  const chain = createProjectDataChain();
  chain.boundaryAnchorPackage.data = {
    projectIdentity: {
      projectName: "前海复合项目",
      buildingType: "工业与基础设施建筑"
    },
    hardControls: {
      siteAreaM2: 40000,
      grossFloorAreaM2: 45000,
      floorAreaRatio: 1.1
    },
    functionRequirements: {
      program: "地下数据中心、市民活动与展示",
      targetUsers: "市民、运维人员"
    },
    normConstraintDecisions: {
      "fire-zoning": {
        value: "公众、后勤与设备空间独立分区",
        status: "userConfirmed",
        source: "userInput"
      }
    },
    conflicts: []
  };
  chain.siteAnalysisPackage.data = {
    siteLimits: ["设备噪声需要远离滨水公共空间。"],
    siteOpportunities: ["滨水公园与公共交通形成连续开放界面。"]
  };
  chain.functionConstructPackage.data = createInitialFunctionConstructData(
    chain.boundaryAnchorPackage
  );
  chain.functionConstructPackage.data.circulationSystem.coreDecisionConfirmed =
    true;
  return chain;
};

test("generates project-specific problems with evidence", () => {
  const data = createInitialConceptStrategyData(makeChain());
  assert.ok(data.coreProblems.length >= 3);
  assert.ok(data.coreProblems.every((problem) => problem.evidence.length));
  assert.equal(data.designStrategies.length, data.coreProblems.length);
});

test("creates one strategy binding for every generated problem", () => {
  const data = createInitialConceptStrategyData(makeChain());
  const validation = validateConceptStrategyData(data);
  assert.equal(validation.blockingItems.length, 0);
  assert.ok(
    data.coreProblems.every((problem) =>
      data.strategyBindings.some(
        (binding) => binding.problemId === problem.id
      )
    )
  );
});

test("blocks a confirmed problem without strategy binding", () => {
  const data = createInitialConceptStrategyData(makeChain());
  data.designStrategies[0].problemIds = [];
  const rebuilt = rebuildDerived(data);
  const validation = validateConceptStrategyData(rebuilt);
  assert.ok(
    validation.blockingItems.some((item) =>
      item.field.startsWith("strategyBinding")
    )
  );
});

test("rejects empty or generic-only concept wording", () => {
  assert.equal(isGenericConcept("绿色", ""), true);
  assert.equal(
    isGenericConcept("双脉协同", "分离公共与后勤流线并连接滨水开放空间。"),
    false
  );
});

test("rebuilds evidence, bindings and concept diagram after edits", () => {
  const data = createInitialConceptStrategyData(makeChain());
  const rebuilt = rebuildDerived(data);
  assert.equal(
    rebuilt.problemEvidence.length,
    rebuilt.coreProblems.reduce(
      (count, problem) => count + problem.evidence.length,
      0
    )
  );
  assert.ok(rebuilt.conceptDiagram.links.length >= rebuilt.strategyBindings.length);
});

test("uses confirmed norm constraints as concept problem evidence", () => {
  const data = createInitialConceptStrategyData(makeChain());
  const normProblem = data.coreProblems.find(
    (item) => item.category === "规范约束"
  );
  assert.ok(normProblem);
  assert.match(normProblem.description, /独立分区/);
  assert.equal(normProblem.evidence[0].source, "normConstraint");
  assert.match(normProblem.evidence[0].label, /防火/);
});
