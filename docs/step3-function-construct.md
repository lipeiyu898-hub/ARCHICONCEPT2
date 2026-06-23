# Step 3 功能建构

Step 3 将 `boundaryAnchorPackage` 中的建筑类型、总建筑面积和功能需求转换为可编辑的功能结构。

## 页面能力

1. 生成功能一级结构，并允许调整为一级、二级或三级功能；
2. 标注强制功能、弹性功能和配套功能；
3. 编辑功能面积并实时计算面积占比、已分配面积和剩余面积；
4. 标注公共性、私密性、采光、层高、噪声、荷载和洁净属性；
5. 编辑紧邻、相邻、隔离和无关关系；
6. 根据面积和关系生成实时功能气泡图；
7. 确认公众、内部、后勤和洁污流线组织；
8. 检测面积超限、人货交叉、洁污冲突和高噪声邻接问题。

## 数据输出

结果写入 `functionConstructPackage.data`：

- `functionTree`
- `areaAllocation`
- `functionAttributes`
- `relationshipGraph`
- `bubbleGraph`
- `circulationSystem`
- `conflicts`
- `organizationPrinciples`

## 通过条件

进入 Step 4 前必须满足：

1. 至少存在一个有效一级功能分区；
2. 用户已确认核心动线判断；
3. 不存在面积超限或洁污直接冲突等阻断项。

## 验证

```bash
npm run test:step3
npm run test:data-chain
npm run test:workflow
npm run build
```
