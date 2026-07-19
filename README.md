# 朝夕 Daily Coach

“朝夕”是一款偏个人使用的轻量习惯教练：添加每日项目、打卡、回看日历，并用一份克制的 AI 周报发现最近一周容易忽略的规律。

## 当前功能

- 打卡：自定义项目、目标、单位、时间和头像，支持编辑、归档与本地提醒。
- 日历：按月查看每日完成率和当天明细，历史归档项目仍保留记录。
- 周报：分析最近一个完整的周六至周五周期，以及此前四周的汇总趋势。
- 我的：本地统计、JSON 数据导出、导入与清空。
- Android：Capacitor 外壳加载正式网站，原生版本隐藏网页里的 APK 下载说明。

所有项目和打卡数据默认只保存在当前设备的 IndexedDB 中。调用 AI 时只发送生成周报需要的紧凑统计，不发送完整本地数据库。

产品决策、AI 边界和验收标准见 [PROJECT_SPEC.md](./PROJECT_SPEC.md)。

## 本地开发

要求 Node.js 22。

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run lint
npm test
npm run build
```

## AI 配置

服务端环境变量：

- `SILICONFLOW_API_KEY`：硅基流动访问令牌，只能配置在托管平台服务端。
- `SILICONFLOW_MODEL`：默认 `deepseek-ai/DeepSeek-V4-Pro`。

不要把访问令牌写入源代码、Git、网页或 APK。

## 发布与 Android

网页部署到 Cloudflare Pages 免费方案。在 Cloudflare Pages 控制台连接 GitHub 仓库，配置如下：

- 构建命令：`npm run build`
- 输出目录：`out`
- 环境变量：按需添加 `SILICONFLOW_API_KEY` 等

每次推送到 `main` 分支会自动触发部署。部署成功后拿到 `https://<project>.pages.dev` 正式网址，更新 `capacitor.config.ts` 的 `server.url`，再运行：

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

生成的测试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。正式对外下载文件为 `public/daily-coach.apk`。
