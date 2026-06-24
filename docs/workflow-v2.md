# ARCHICONCEPT 新六步骨架

阶段 2 在阶段 1 数据链之上建立统一的流程外壳。当前版本保留旧页面作为兼容工作区，不重写已有地图、表单和分析逻辑。

## 六个阶段

| Step | 中文名称 | English | 数据包 |
| --- | --- | --- | --- |
| 1 | 设计边界 | Boundary Anchor | `boundaryAnchorPackage` |
| 2 | 场地解析 | Site Analysis | `siteAnalysisPackage` |
| 3 | 功能建构 | Program Logic | `functionConstructPackage` |
| 4 | 概念生成 | Concept Strategy | `conceptStrategyPackage` |
| 5 | 形态落位 | Massing Placement | `massingPlacementPackage` |
| 6 | 比选定型 | Option Validation | `finalConceptPackage` |

## 公共骨架

每个流程页由以下公共区域组成：

1. 六步流程导航与阶段状态；
2. 当前阶段标题、说明和工作模块；
3. 右侧阶段摘要，包括可信度、阻断项、系统估算和数据版本；
4. 底部固定操作栏，包括返回、保存、重算和继续。

## 导航规则

- 未达到设计边界最小条件时，禁止进入后续阶段；
- 场地数据缺失或过期时，进入功能建构及后续阶段前给出警告；
- 功能数据不足时，禁止进入概念生成；
- 核心问题或策略不足时，禁止进入形态落位；
- 少于两个体量方案时，禁止进入比选定型；
- 上游数据变化后，下游阶段显示“需复核”状态。

## 兼容策略

- 新骨架通过 `archiconcept:workflow-v2-route` 事件调用旧编译应用的现有页面；
- 旧六步名称在加载时映射为新名称；
- 现有输入条件、场地编辑器、问题识别和后续页面逻辑继续运行；
- 阶段 3 以后可逐步用新业务页面替换兼容工作区，无需再次更改数据包和导航协议。

## 验证

```bash
npm run test:data-chain
npm run test:workflow
npm run build
```
