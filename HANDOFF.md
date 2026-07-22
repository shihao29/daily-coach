# 朝夕离线版交接说明

更新时间：2026-07-22（Asia/Shanghai）

本文记录当前已经完成的离线 APK、下载页、数据迁移方式、签名位置和剩余真机验收。本文不包含任何 API Key、访问令牌或签名密码。

## 1. 当前交付结果

- 正式下载页：https://shihao29.github.io/daily-coach-download/
- 下载页仓库：https://github.com/shihao29/daily-coach-download
- 主源码仓库：https://github.com/shihao29/daily-coach
- 本地源码：`C:\Users\han\Documents\New project`
- APK：`C:\Users\han\Documents\New project\public\daily-coach.apk`
- EdgeOne 手动上传包：`C:\Users\han\Documents\New project\release\daily-coach-download-site.zip`

下载页打开后会自动请求当前唯一版本文件 `zhaoxi-offline-2.0.1.apk`，同时保留手动下载按钮。同名旧文件容易被安卓下载器或用户误选，因此后续每次发布都应继续使用带版本号的新文件名。

## 2. APK 信息

- 应用显示名：`朝夕·离线版`
- 应用编号：`com.shihao29.zhaoxi`
- `versionName`：`2.0.1`
- `versionCode`：`2`
- SHA-256：`B5CCFF636BA72F2F86CFEDB9FA66FBD0C5E82DE2A96E8C23495B8D03BE09F964`
- 最低 Android：API 24
- 目标 Android：API 36

这一版故意显示为“朝夕·离线版”，目的是让它与旧的“朝夕”明显区分并同时安装，完成首次数据迁移。确认旧数据导入成功并删除旧版后，后续覆盖升级可以只修改显示名，不得修改应用编号。

APK 已验证：

- 内置完整 Next.js 静态页面，共 46 个本地网页资源。
- `assets/capacitor.config.json` 不包含 `server.url`。
- 不包含旧 GitHub Pages 地址。
- 不包含“获取安卓版”、APK 下载入口或安装步骤。
- 不包含旧应用编号 `com.dailycoach.app`。
- 不包含此前聊天中出现过的测试 API Key。
- APK 内没有再次嵌套 APK 文件。
- 使用固定正式签名，而不是旧版的 Android Debug 签名。

## 3. 第一次迁移数据

旧联网版和新离线版使用不同应用编号，因此可以同时安装。不要先卸载旧版。

迁移步骤：

1. 打开旧版“朝夕”。
2. 进入“我的”，点击“导出我的数据”。
3. 将 JSON 文件保存到手机文件、微信文件传输助手或其他安全位置。
4. 打开下载页，认准文件 `zhaoxi-offline-2.0.1.apk`，安装“朝夕·离线版”。
5. 进入“我的”，点击“导入备份数据”。
6. 核对累计项目、历史打卡、日历明细和历史周报。
7. 确认无误后再卸载旧版。

旧版导出的历史 JSON 可能包含用户自行填写的 API Key，必须私下保管并在迁移完成后删除。新离线版的导入逻辑会丢弃备份中的 API Key；新离线版再次导出的备份也会主动排除 API Key。

## 4. 以后更新为什么不会丢数据

以后所有版本必须遵守：

- `applicationId` 始终保持 `com.shihao29.zhaoxi`。
- 始终使用同一份签名文件。
- 每次发布提高 `versionCode`。
- 用户直接覆盖安装，不先卸载旧版。
- IndexedDB 名称继续保持 `daily-coach-v2`。
- 修改数据结构时保留向后兼容迁移。

满足这些条件时，Android 会把新 APK 识别为同一个应用的更新，应用沙箱和 IndexedDB 会继续保留。JSON 导出是额外兜底，不应替代正确的签名和版本管理。

## 5. 签名文件

签名文件不在 Git 仓库中：

- `C:\Users\han\.android\zhaoxi-release.jks`
- `C:\Users\han\.android\zhaoxi-release-credential.xml`

第二个文件使用当前 Windows 用户的 DPAPI 加密，不能直接在另一台电脑或另一个 Windows 账户下解密。交接到其他电脑前，需要由当前用户安全导出签名密码并通过私密渠道传递。绝不能把签名文件、凭据文件或密码提交到 Git、Issue、聊天群或下载页。

如果签名文件丢失，现有用户将无法覆盖更新，只能重新安装并导入 JSON 备份。

## 6. 构建方式

要求：Node.js 22、JDK 21、Android SDK。

完整构建：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-offline-apk.ps1
```

脚本会自动完成：

1. 使用 `NEXT_PUBLIC_APP_TARGET=android` 构建 Next.js 静态页面。
2. 临时移开网站下载用 APK，避免把 APK 再次打进 APK。
3. 运行 Capacitor Android 同步。
4. 使用固定签名生成 Release APK。
5. 更新 `public/daily-coach.apk`。
6. 使用带版本号的新文件名更新 `download-site/` 中的 APK，并更新页面链接和 `release.json`。
7. 生成 `release/daily-coach-download-site.zip`。

常规检查：

```powershell
npm ci
npm run lint
npm test
```

## 7. 下载页发布

当前下载页采用独立 GitHub Pages 仓库，避免覆盖旧版应用仍在使用的 GitHub Pages 页面。

下载页源文件：

- `download-site/index.html`
- 构建生成的 `download-site/zhaoxi-offline-2.0.1.apk`
- 构建生成的 `download-site/release.json`

下载仓库当前直接从 `main` 分支根目录发布。每次重建 APK 后，需要把上述三个文件同步到 `shihao29/daily-coach-download` 并推送。

EdgeOne 控制台不能通过当前 Codex 浏览器安全策略操作，因此本次没有覆盖已有 EdgeOne 项目。可在以后登录 EdgeOne Makers 后，直接上传：

`C:\Users\han\Documents\New project\release\daily-coach-download-site.zip`

EdgeOne 上传成功并验证后，可以把它作为中国大陆优先下载地址；GitHub Pages 可继续作为备用地址。

## 8. 数据与 AI

- 项目、日志、头像、周报和设置存储在当前设备 IndexedDB。
- 无账号、无云同步；换机前必须导出 JSON。
- 打卡、日历、历史记录和本地提醒不依赖网络。
- 当前 AI 周报仍为用户自带 API Key、客户端直连硅基流动的可选功能。
- AI 请求失败不能影响应用启动和核心打卡。
- API Key 不进入源码、APK 固定资源或新版备份文件。

如果后续恢复服务端 AI，必须使用中国大陆可访问的后端保存固定 Key，不能把固定 Key 写入网页或 APK。

## 9. 已完成验证

- `npm run lint`：通过。
- `npm test`：通过，包含静态构建和 2 项集成测试。
- Capacitor 同步：通过，包含 Filesystem、Share、Local Notifications 三个插件。
- Gradle `assembleRelease`：通过。
- APK 签名验证：通过。
- APK 包名、版本、显示名验证：通过。
- APK 内嵌配置与敏感字符串扫描：通过。
- GitHub Pages 构建：通过。
- 下载页 HTTP 状态：`200`。
- APK MIME：`application/vnd.android.package-archive`。
- 浏览器自动下载事件：已触发。
- 公网 APK 哈希与本地 APK 哈希：一致。

## 10. 尚需用户真机完成

当前电脑没有连接安卓手机，也没有安装 Android 模拟器，因此以下验收必须在用户手机上完成：

1. 下载 `zhaoxi-offline-2.0.1.apk`，确认安装后的名称是“朝夕·离线版”。
2. 开启飞行模式，确认应用仍能启动并切换四个底部导航。
3. 新增项目、打卡、关闭再打开，确认数据仍在。
4. 导出备份，确认系统分享面板可以保存 JSON。
5. 导入旧版 JSON，核对项目、日历和周报。
6. 开启通知权限，确认提醒可以保存。

在真机验证旧数据导入成功前，不要卸载旧版。

## 11. 安全红线

- 不提交 API Key、GitHub Token、云平台 Token、签名文件或签名密码。
- 不提交用户真实导出数据、头像或周报样本。
- 不修改已发布应用编号。
- 不用新的签名替换当前签名。
- 不把远程 `server.url` 重新写回正式 APK。
- 不把 ChatGPT Sites 作为正式生产下载地址。
