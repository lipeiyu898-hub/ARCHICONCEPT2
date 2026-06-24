# Step 1 设计边界与 Step 2 场地解析

## Step 1 设计边界

Step 1 复用原输入条件页的任务书导入和表单能力，并移除场地编辑模块。页面现在形成以下输出：

1. 项目身份与基础条件；
2. 强控指标与规模边界；
3. 功能需求与特殊要求；
4. 根据建筑类型生成的规范前置匹配；
5. 设计约束总表；
6. 缺失、异常、冲突和系统假设。

结果写入 `boundaryAnchorPackage`。只有项目名称、建筑类型、有效用地面积以及功能需求或场地问题达到最小条件，且没有阻断项时，才能确认并进入 Step 2。

规范匹配是建筑前期提示，不作为法定审图或最终合规结论。

## Step 2 场地解析

Step 2 不再进入旧问题识别页面，而是在输入工作区中独立显示场地解析内容。现有地图编辑器完整复用，包括：

- 地点搜索与地图点选；
- 用地红线手绘和图片识别导入；
- 红线编辑与确认；
- 多类型入口标注；
- 500m、1000m、1500m 周边分析；
- 地图显示控制。

地图结果写入 `siteAnalysisPackage`，并自动整理：

- `siteLocation`
- `redline`
- `accessPoints`
- `poiContext`
- `siteLimits`
- `siteOpportunities`
- `swot`
- `designImpactHints`

场地定位或红线暂缺时仍可进入 Step 3，但会显示可信度警告。确认状态本身不会误触发下游数据失效；只有实际数据变化才会传播 stale 状态。

## 验证命令

```bash
npm run test:data-chain
npm run test:workflow
npm run test:step12
npm run build
```
