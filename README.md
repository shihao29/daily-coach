# 朝夕 Daily Coach

“朝夕”是一款偏个人使用的轻量习惯教练：添加每日项目、打卡、回看日历，并用一份克制的 AI 周报发现最近一周容易忽略的规律。

## 当前功能

- 打卡：自定义项目、目标、单位、时间和头像，支持编辑、归档与本地提醒。
- 日历：按月查看每日完成率和当天明细，历史归档项目仍保留记录。
- 周报：分析最近一个完整的周六至周五周期，以及此前四周的汇总趋势。
- 我的：本地统计、JSON 数据导出、导入与清空。
- Android：完整页面内置在 Capacitor APK 中，断网也能启动、打卡和查看日历。

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

当前 AI 周报为可选联网功能，用户在自己的设备上填写硅基流动 API Key。核心打卡功能不依赖它。数据备份会主动排除 API Key。

不要把访问令牌写入源代码、Git、网页、下载页或 APK 构建产物。

## 发布与 Android

正式下载页和应用主体完全分离：

- 下载地址：`https://shihao29.github.io/daily-coach-download/`
- 下载页仓库：`https://github.com/shihao29/daily-coach-download`
- `download-site/`：下载页源文件。
- `public/daily-coach.apk`：当前正式 APK。

离线 APK 使用固定应用编号 `com.shihao29.zhaoxi`。首次迁移时它会以“朝夕·离线版”显示，可与旧版并存。构建前需要保留当前 Windows 用户目录下的签名文件和加密凭据：

- `%USERPROFILE%\.android\zhaoxi-release.jks`
- `%USERPROFILE%\.android\zhaoxi-release-credential.xml`

不要把这两个文件提交到 Git。完整构建使用：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-offline-apk.ps1
```

脚本会构建静态页面、同步 Android、生成正式签名 APK，并刷新：

- `public/daily-coach.apk`
- `download-site/zhaoxi-offline-2.0.1.apk`
- `release/daily-coach-download-site.zip`

未来更新必须保持应用编号和签名不变，并提高 `android/app/build.gradle` 中的 `versionCode`。
