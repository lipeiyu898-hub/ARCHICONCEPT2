# AGENTS.md — ARCHICONCEPT Codex Rules

## Product identity

ARCHICONCEPT 是一个建筑前期概念设计辅助 SaaS，不是静态官网，也不是普通地图工具。

核心流程必须保持为：

1. 输入条件 / Input Brief
2. 问题识别 / Problem ID
3. 空间意图 / Spatial Intent
4. 策略匹配 / Strategy Match
5. 概念方案 / Concept Proposal
6. 解释输出 / Outcome Explain

不要未经确认重构六步流程、首页、导航、项目画像、地图编辑器或全局样式。

## Think before coding

- 不确定时先问，不要自行猜测。
- 如果有多种理解，先列出选项，让用户选择。
- 发现更简单方案时要说明，不要直接做复杂实现。
- 遇到矛盾需求时暂停并确认。

## Simplicity first

- 只做用户本次明确要求的最小改动。
- 不要增加用户没有要求的功能。
- 不要为了“扩展性”创建复杂抽象。
- 不要把 50 行能完成的事情写成 200 行。
- 不要把单页小改变成全局重构。

## Surgical changes

- 只修改与当前任务直接相关的文件。
- 不要顺手优化无关代码。
- 不要删除不理解的旧代码。
- 不要修改无关注释、格式、命名。
- 修改前先列出计划修改的文件。
- 大范围修改前必须等待用户确认。

## Goal-driven execution

每次任务开始前先说明：

1. 本次目标
2. 修改范围
3. 不会改动的内容
4. 验收标准

每次任务完成后说明：

1. 修改文件
2. 完成内容
3. 验证方式
4. npm run build 结果
5. 未完成或有风险的内容

## ARCHICONCEPT safety rules

- 不要上传 .env。
- 不要输出完整 API Key、Token、密钥。
- AMAP_WEB_SERVICE_KEY 只能用于后端。
- VITE_AMAP_JS_KEY 和 VITE_AMAP_SECURITY_JS_CODE 用于前端高德地图。
- 不要把 Web 服务 Key 暴露到浏览器 Network。
- 不要使用假数据冒充真实高德 API 结果。
- API 失败时必须显示真实失败状态。

## UI rules

- 保持 ARCHICONCEPT 当前黑白灰、克制、建筑系 SaaS 风格。
- 不要随意增加大面积彩色。
- 不要把界面做成静态官网。
- 不要让地图编辑器覆盖六步流程主结构。
- 场地编辑器只作为输入条件中的功能模块存在。
- 当任务涉及 UI、视觉层级、页面布局、字体系统、按钮层级、卡片设计、SaaS 成熟度评审时，必须先使用 taste-skill 做审查。未经用户确认，不得直接修改代码。
- 使用 taste-skill 后，必须先输出：
  1. UI 问题
  2. 修改范围
  3. 计划修改文件
  4. 不会修改的内容
  5. 验收标准
- 只有用户确认后，才能开始修改。

## Git rules

- 修改前先检查 git status。
- 不要提交 .env、node_modules、dist、日志文件。
- 每次较大修改前建议先 commit 当前稳定版本。
- commit message 要简洁说明本次改动。
