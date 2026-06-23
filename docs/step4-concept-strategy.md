# Step 4 概念生成

Step 4 从 `boundaryAnchorPackage`、`siteAnalysisPackage` 和 `functionConstructPackage` 提炼核心问题，并建立问题、依据、策略与概念之间的可追踪关系。

## 页面能力

1. 生成 3 至 5 个核心问题；
2. 设置 P0、P1、P2 优先级；
3. 显示每个问题的边界、场地、功能或系统推断依据；
4. 确认、编辑、删除或补充核心问题；
5. 为问题选择和编辑设计策略；
6. 标记策略影响范围；
7. 从多个概念方向中选择主概念；
8. 编辑概念名称、一句话说明和概念叙事；
9. 展示“问题 → 策略 → 概念”推导关系。

## 数据输出

结果写入 `conceptStrategyPackage.data`：

- `coreProblems`
- `problemEvidence`
- `designStrategies`
- `strategyBindings`
- `conceptCandidates`
- `selectedConceptId`
- `conceptName`
- `conceptStatement`
- `conceptNarrative`
- `conceptDiagram`

## 通过条件

进入 Step 5 前必须满足：

1. 至少确认一个核心问题；
2. 每个确认问题至少有一个依据；
3. 每个确认问题至少绑定一个启用策略；
4. 概念名称和说明具备项目针对性，不能只有空泛概念词。

## 验证

```bash
npm run test:step4
npm run test:step3
npm run test:workflow
npm run build
```
