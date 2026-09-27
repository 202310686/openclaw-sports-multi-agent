# 架构与设计决策

## 角色与状态隔离

| Agent ID | 职责 | 输入 | 输出 |
|---|---|---|---|
| sports-coordinator | 计划与综合审核 | 业务任务 / 专家结果 | plan / report |
| sports-admissions | 需求提取 | 模拟咨询 | 客户画像与缺失信息 |
| sports-course | 知识约束推荐 | 画像 + 模拟课程知识 | 课程 ID、依据、前置评估、未知项 |
| sports-coach | 客观反馈 | 模拟训练记录 | 观察、优势、待提升、训练重点、历史局限 |

每次调用使用随机新 session ID，避免不同模拟客户混入同一上下文。主管计划与汇总是两个独立调用，汇总时显式注入上游结果，不依赖隐式聊天记忆。

## 为什么不是四个普通 API 调用？

每个请求交给 OpenClaw 的具名 Agent，加载其独立工作区、角色提示词和权限配置。实际模型调用由 OpenClaw 完成，应用只负责业务数据传递和校验。运行证据包括 Agent ID、session ID、OpenClaw terminal receipt run ID、模型、耗时和退出码。

## 为什么不直接使用自主 Swarm？

本版业务链固定，确定性调度更容易解释、测试与控制费用。计划是主管的建议，不是动态可执行图。不得把实现宣传为“主管自主选择并调用专家”；自主委派是不同的架构，未来可用官方 sessions_spawn 替换适配层。

## 数据边界

模拟知识只定义基础班、提高班、战队班的特点；价格、年龄区间、名额、校区和排课未知。知识每次随任务注入，无需 Agent 文件读取工具。

结构校验允许 age 的无损表示转换（"8岁" → 8），不替用户补事实。不合规结果立即停止；课程 price / schedule 必须为 null。家长草稿出现具体金额则被阻止，但这只是有限规则，不是完整的事实校验器。

## 接口

- GET `/api/health`：原型服务状态，不代表模型 API 已验证。
- GET `/api/cases`：模拟输入。
- GET `/api/replay`：历史样例，客户端明确标注回放。
- POST `/api/runs`：必须确认模拟资料和 API 费用；并发忙时 409。
- GET `/api/runs/:id`：当前进程内任务状态和阶段事件。
- POST `/api/runs/:id/cancel`：终止本次 CLI 调用，已消耗 token 不可撤回。
- POST `/api/runs/:id/review`：仅完成任务可审核；保存编辑稿，sent 始终为 false。
- GET `/api/runs/:id/export`：下载已完成任务和已保存审核稿的 JSON 附件。
- GET `/api/replay/export?scenario=admissions|coach`：下载明确标识的历史演示。编辑草稿后须先审核保存再导出；历史样例不保存修改。

服务器重启后内存任务列表丢失；原始 report 与审核结果仍留在 `.local`，不提供持久化历史查询界面。

## 安全与运维局限

Loopback + Host/Origin 检查针对误暴露、跨站访问和 DNS 重绑定，不替代操作系统账户隔离。Agent 禁用业务工具，OpenClaw 的 Code Mode 执行壳仍可能出现在模型工具说明中；实际可用业务工具列表为空。本版不证明能抵御所有提示注入。

OpenClaw 全局配置、凭据和工作区在用户私有目录。项目初始化添加四项注册，保存安装前配置快照和局部变更记录；回滚在发现项目注册被后续修改时停止，避免覆盖其他人的改动。
