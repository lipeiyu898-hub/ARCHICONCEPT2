import test from "node:test";
import assert from "node:assert/strict";

import { createProjectDataChain } from "../assets/archiconcept-data-chain.js";
import {
  WORKFLOW_V2_STEPS,
  deriveStepState,
  guardStepNavigation
} from "../assets/archiconcept-workflow-v2.js";

const makeReadyBoundary = (chain) => {
  chain.boundaryAnchorPackage.completionStatus = "ready";
  chain.boundaryAnchorPackage.confidenceLevel = "high";
  chain.boundaryAnchorPackage.data = {
    projectIdentity: {
      projectName: "测试项目",
      buildingType: "公共建筑"
    },
    hardControls: { siteAreaM2: 20000 },
    functionRequirements: { program: "公共活动与配套空间" }
  };
  return chain;
};

test("defines the new six-step workflow once", () => {
  assert.deepEqual(
    WORKFLOW_V2_STEPS.map((step) => step.title),
    ["边界锚定", "场地解析", "功能建构", "概念生成", "形态落位", "比选定型"]
  );
  assert.deepEqual(
    WORKFLOW_V2_STEPS.map((step) => step.packageName),
    [
      "boundaryAnchorPackage",
      "siteAnalysisPackage",
      "functionConstructPackage",
      "conceptStrategyPackage",
      "massingPlacementPackage",
      "finalConceptPackage"
    ]
  );
});

test("blocks later stages when boundary anchor is incomplete", () => {
  const result = guardStepNavigation(createProjectDataChain(), 2, 1);
  assert.equal(result.allowed, false);
  assert.equal(result.redirectStep, 1);
  assert.equal(result.severity, "blocking");
});

test("allows site analysis after minimum boundary data", () => {
  const result = guardStepNavigation(makeReadyBoundary(createProjectDataChain()), 2, 1);
  assert.equal(result.allowed, true);
  assert.equal(result.severity, "none");
});

test("warns when entering program logic without site analysis", () => {
  const result = guardStepNavigation(makeReadyBoundary(createProjectDataChain()), 3, 1);
  assert.equal(result.allowed, true);
  assert.equal(result.severity, "warning");
  assert.match(result.message, /场地定位与红线/);
});

test("blocks concept generation without minimum function data", () => {
  const result = guardStepNavigation(makeReadyBoundary(createProjectDataChain()), 4, 1);
  assert.equal(result.allowed, false);
  assert.equal(result.redirectStep, 3);
});

test("blocks option validation until two massing options exist", () => {
  const chain = makeReadyBoundary(createProjectDataChain());
  chain.functionConstructPackage.data = {
    functionTree: [{ id: "public", name: "公共功能", level: 1 }],
    circulationSystem: { coreDecisionConfirmed: true }
  };
  chain.conceptStrategyPackage.data = {
    coreProblems: [
      {
        id: "problem-1",
        title: "公共与后勤流线需要分离",
        confirmed: true,
        evidence: [{ source: "functionConstruct", detail: "核心动线判断" }]
      }
    ],
    designStrategies: [
      {
        id: "strategy-1",
        title: "双系统组织",
        confirmed: true,
        problemIds: ["problem-1"]
      }
    ],
    strategyBindings: [
      {
        id: "binding-1",
        problemId: "problem-1",
        strategyId: "strategy-1"
      }
    ],
    conceptName: "双脉协同",
    conceptStatement: "分离公共与后勤流线并连接主要公共空间。"
  };
  chain.massingPlacementPackage.data = {
    massingOptions: [{ id: "option-a" }]
  };

  const result = guardStepNavigation(chain, 6, 5);
  assert.equal(result.allowed, false);
  assert.equal(result.redirectStep, 5);
});

test("shows stale state independently from completion state", () => {
  const chain = makeReadyBoundary(createProjectDataChain());
  chain.conceptStrategyPackage.completionStatus = "ready";
  chain.conceptStrategyPackage.stale = true;

  const state = deriveStepState(chain, 4);
  assert.equal(state.label, "需复核");
  assert.equal(state.tone, "stale");
});
