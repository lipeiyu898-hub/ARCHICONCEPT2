# ARCHICONCEPT 数据链 V1

阶段 1 的目标是让现有应用在页面重构前先具备稳定的数据契约。当前 UI 仍使用旧六步名称，但所有关键数据可以同步写入新 PRD 定义的六个 package。

## 六个数据包

1. `boundaryAnchorPackage`
2. `siteAnalysisPackage`
3. `functionConstructPackage`
4. `conceptStrategyPackage`
5. `massingPlacementPackage`
6. `finalConceptPackage`

每个数据包统一包含：

```js
{
  packageName,
  step,
  completionStatus: "empty | partial | ready | confirmed",
  confidenceLevel: "high | medium | low",
  blockingItems: [],
  assumptions: [],
  sourceTrace: {},
  downstreamHints: {},
  stale: false,
  staleReasons: [],
  revision: 0,
  createdAt,
  updatedAt,
  confirmedAt,
  data: {}
}
```

## 失效传播

- `boundaryAnchorPackage` 更新：Step 2-6 已有结果失效。
- `siteAnalysisPackage` 更新：Step 4-6 已有结果失效。
- `functionConstructPackage` 更新：Step 4-6 已有结果失效。
- `conceptStrategyPackage` 更新：Step 5-6 已有结果失效。
- `massingPlacementPackage` 更新：Step 6 已有结果失效。

空数据包不会仅因为前序更新而被标记为 stale。

## 来源追踪

支持以下来源：

- `userInput`
- `importedBrief`
- `mapAPI`
- `systemInference`
- `manualEdit`
- `legacyMigration`

`sourceTrace` 以字段路径为键记录来源和更新时间。

## 旧数据迁移

现有页面通过 `ARCHICONCEPT_DATA_CHAIN.bridge` 写入新数据链：

- 输入条件 → `boundaryAnchorPackage`
- 场地编辑器 → `siteAnalysisPackage`
- 旧问题追问与空间意图 → `functionConstructPackage`
- 问题识别与策略匹配 → `conceptStrategyPackage`
- 原型生成 → `massingPlacementPackage`

最终方案选择接口已预留为 `bridge.syncFinal()`，将在 Step 6 重构时接入。

## 浏览器接口

```js
const { store, bridge } = window.ARCHICONCEPT_DATA_CHAIN;

store.getState();
store.getPackage("siteAnalysisPackage");
store.updatePackage("siteAnalysisPackage", patch, options);
store.confirmPackage("siteAnalysisPackage");
store.setCurrentStep(2);
store.subscribe(listener);
store.reset();
```

数据默认持久化到：

```text
localStorage["archiconcept:project-data-chain:v1"]
```

## 下一阶段约束

后续页面重构应直接读写数据链 package，不再新增平行的页面级数据结构。旧字段只作为迁移来源，不能继续成为新流程的主数据源。
