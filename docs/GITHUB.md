# GitHub 发布准备

建议仓库名：`openclaw-sports-multi-agent`。

本项目先在本机创建 Git 仓库。不要提交 `.local`、真实资料、OpenClaw 本机配置、数据库、API Key 或网关令牌。

```powershell
node scripts/scan.mjs
git status --short
git diff --cached
```

确认公开内容后，在自己的 GitHub 创建空仓库（不要额外初始化 README），再执行：

```powershell
git remote add origin https://github.com/YOUR_USERNAME/openclaw-sports-multi-agent.git
git push -u origin main
```

若本机尚未提交：

```powershell
git add .
git commit -m "feat: add sports multi-agent business prototype"
```

用户名和远程地址需要替换为你自己的账号。没有创建远程仓库或 push 成功记录时，不把“GitHub 已发布”写为完成。

MIT 是本项目源码许可证，不覆盖 OpenClaw 或模型服务本身。所有历史演示标注为模拟资料，不含企业真实案例。
