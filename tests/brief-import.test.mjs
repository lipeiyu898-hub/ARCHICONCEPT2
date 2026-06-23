import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAreaProgram,
  mergeBriefExtraction,
  normalizeAreaProgramValue
} from "../server/fallbacks.js";
import { parseAreaProgram } from "../assets/archiconcept-data-chain.js";

const TASK_BRIEF_AREA_SCHEDULE = `
2.面积组成分配如下：
（1）社区商业：550㎡，包括
菜市场及食品店铺：300㎡
小超市：200㎡
商品库房50㎡（给超市用）
（2）文化休闲活动：650㎡，包括
书吧：100㎡
休闲饮品：200㎡（包括咖啡、果茶、轻餐）
培训体验：100㎡
健身：150㎡
棋牌室：100㎡
（3）管理用房30㎡，包括
办公室2间，每间15㎡
（4）设备用房70㎡，包括
消防控制室20㎡
高低压配电房50㎡
（5）按要求每层设置公共卫生间等。
`;

test("extracts a multiline hierarchical area schedule from a task brief", () => {
  const extracted = extractAreaProgram(TASK_BRIEF_AREA_SCHEDULE);
  assert.equal(
    extracted,
    [
      "1级｜社区商业｜1×550㎡",
      "2级｜菜市场及食品店铺｜1×300㎡",
      "2级｜小超市｜1×200㎡",
      "2级｜商品库房｜1×50㎡",
      "1级｜文化休闲活动｜1×650㎡",
      "2级｜书吧｜1×100㎡",
      "2级｜休闲饮品｜1×200㎡",
      "2级｜培训体验｜1×100㎡",
      "2级｜健身｜1×150㎡",
      "2级｜棋牌室｜1×100㎡",
      "1级｜管理用房｜1×30㎡",
      "2级｜办公室｜2×15㎡",
      "1级｜设备用房｜1×70㎡",
      "2级｜消防控制室｜1×20㎡",
      "2级｜高低压配电房｜1×50㎡"
    ].join("\n")
  );

  const editorRows = parseAreaProgram(extracted, 2200);
  assert.equal(editorRows.length, 15);
  assert.equal(editorRows[0].name, "社区商业");
  assert.equal(editorRows[0].level, 1);
  assert.equal(editorRows[1].name, "菜市场及食品店铺");
  assert.equal(editorRows[1].level, 2);
  assert.equal(editorRows[1].parentId, editorRows[0].id);
  assert.equal(editorRows[11].quantity, 2);
  assert.equal(editorRows[11].unitAreaM2, 15);
});

test("keeps fallback area rows when the AI returns an empty area program", () => {
  const fallback = {
    projectName: "测试项目",
    areaProgram: "1级｜社区商业｜1×550㎡"
  };
  const merged = mergeBriefExtraction(fallback, {
    projectName: "识别项目",
    areaProgram: ""
  });

  assert.equal(merged.projectName, "识别项目");
  assert.equal(merged.areaProgram, fallback.areaProgram);
});

test("prefers the task brief hierarchy over a flat AI area list", () => {
  const fallback = {
    areaProgram:
      "1级｜社区商业｜1×550㎡\n2级｜菜市场及食品店铺｜1×300㎡\n2级｜小超市｜1×200㎡\n2级｜商品库房｜1×50㎡"
  };
  const merged = mergeBriefExtraction(fallback, {
    areaProgram: [
      { name: "社区商业", level: 1, areaM2: 550 },
      { name: "菜市场及食品店铺", level: 1, areaM2: 300 },
      { name: "小超市", level: 1, areaM2: 200 },
      { name: "商品库房", level: 1, areaM2: 50 }
    ]
  });

  assert.equal(merged.areaProgram, fallback.areaProgram);
});

test("normalizes structured AI area rows into the editor import format", () => {
  assert.equal(
    normalizeAreaProgramValue({
      items: [
        {
          name: "社区商业",
          areaM2: 550,
          children: [
            {
              functionName: "菜市场及食品店铺",
              quantity: 2,
              totalAreaM2: 300
            }
          ]
        }
      ]
    }),
    "1级｜社区商业｜1×550㎡\n2级｜菜市场及食品店铺｜2×150㎡"
  );
});
