import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBubbleGraph,
  createInitialFunctionConstructData,
  detectFunctionConflicts,
  validateFunctionConstructData
} from "../assets/archiconcept-data-chain.js";
import { normalizeDraft } from "../assets/archiconcept-step3.js";

const boundary = {
  data: {
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
      program: "数据中心、市民活动、展示与后勤管理"
    }
  }
};

test("generates an initial function hierarchy from Step 1 data", () => {
  const data = createInitialFunctionConstructData(boundary);
  assert.equal(data.functionTree.length, 6);
  assert.equal(data.areaAllocation.targetGfaM2, 45000);
  assert.ok(data.functionTree.every((item) => item.level === 1));
  assert.ok(data.functionAttributes[data.functionTree[0].id]);
});

test("builds a bubble graph for primary functions", () => {
  const data = createInitialFunctionConstructData(boundary);
  const graph = buildBubbleGraph(data.functionTree);
  assert.equal(graph.nodes.length, data.functionTree.length);
  assert.ok(graph.nodes.every((node) => Number.isFinite(node.x)));
});

test("requires a confirmed circulation decision before Step 4", () => {
  const data = createInitialFunctionConstructData(boundary);
  let validation = validateFunctionConstructData(data);
  assert.ok(
    validation.blockingItems.some(
      (item) => item.field === "circulationSystem"
    )
  );
  data.circulationSystem.coreDecisionConfirmed = true;
  validation = validateFunctionConstructData(data);
  assert.equal(validation.blockingItems.length, 0);
});

test("detects area overflow as a blocking conflict", () => {
  const data = createInitialFunctionConstructData(boundary);
  data.functionTree[0].areaM2 = 60000;
  const conflicts = detectFunctionConflicts(data);
  assert.ok(
    conflicts.some(
      (item) => item.id === "area-overflow" && item.severity === "blocking"
    )
  );
});

test("normalizes allocated and remaining area", () => {
  const data = createInitialFunctionConstructData(boundary);
  const normalized = normalizeDraft(data);
  assert.equal(
    normalized.areaAllocation.allocatedM2,
    normalized.functionTree.reduce((sum, item) => sum + item.areaM2, 0)
  );
  assert.equal(
    normalized.areaAllocation.unallocatedM2,
    normalized.areaAllocation.targetGfaM2 -
      normalized.areaAllocation.allocatedM2
  );
});

test("reads the structured Step 1 area hierarchy without double counting parents", () => {
  const structuredBoundary = {
    data: {
      ...boundary.data,
      areaProgram: {
        items: [
          {
            id: "commercial",
            name: "社区商业",
            level: 1,
            parentId: null,
            areaM2: 500
          },
          {
            id: "market",
            name: "菜市场",
            level: 2,
            parentId: "commercial",
            quantity: 1,
            unitAreaM2: 300,
            areaM2: 300
          },
          {
            id: "store",
            name: "小超市",
            level: 2,
            parentId: "commercial",
            quantity: 1,
            unitAreaM2: 200,
            areaM2: 200
          }
        ]
      }
    }
  };
  const data = createInitialFunctionConstructData(structuredBoundary);
  const normalized = normalizeDraft(data);
  assert.equal(data.functionTree.length, 3);
  assert.equal(data.functionTree[0].areaM2, 500);
  assert.equal(normalized.areaAllocation.allocatedM2, 500);
});

test("reads confirmed norm conditions into function principles", () => {
  const normBoundary = {
    data: {
      ...boundary.data,
      normConstraintDecisions: {
        "fire-zoning": {
          value: "公众、后勤与设备空间独立分区",
          status: "userConfirmed",
          source: "userInput"
        },
        "industrial-service": {
          value: "设备运维、吊装与公众流线独立组织",
          status: "systemEstimated",
          source: "systemInference"
        }
      }
    }
  };
  const data = createInitialFunctionConstructData(normBoundary);
  assert.equal(data.normDerivedConstraints.length, 2);
  assert.ok(
    data.organizationPrinciples.some((item) => /独立分区/.test(item))
  );
  assert.ok(
    data.organizationPrinciples.some((item) => /吊装/.test(item))
  );
});
