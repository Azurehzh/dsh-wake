# 尾波（dsh-wake）安装说明

三种装法，任选一种。装完都要**重启 DSH**。

## 方式一：GitHub（推荐）

1. 把本目录（`package.json` 在根）推到 GitHub 仓库；
2. 在 DSH 里打开 **设置 → 插件 → 安装**，填：
   ```
   github:<你的用户名>/<仓库名>
   ```
   或命令行：
   ```bash
   dsh plugin --profile desktop add github:<你的用户名>/<仓库名>
   ```
3. 重启 DSH。

## 方式二：离线压缩包（dsh-wake-0.7.1.zip）

1. 解压，把 `dsh-wake` 整个文件夹放到：
   ```
   %USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-wake
   ```
   （桌面版 profile 一般是 `desktop`）
2. 打开该 profile 的 `package.json`，在 `dsh.profile.bundles` 数组里加一行：
   ```json
   "dsh-wake"
   ```
3. 重启 DSH。

> `package.json` 必须存成 **UTF-8 无 BOM**。

## 方式三：npm 包（dsh-wake-0.7.1.tgz）

```bash
dsh plugin --profile web add file:D:\路径\dsh-wake-0.7.1.tgz
```

如果当前 CLI 不接受本地 tarball，就用方式二。

## 装好之后

- 进入 **设置 → 尾波**；
- 总开关默认关闭；先勾一个会话、把等待区间调小、概率调高，点「现在续一句」验证；
- 再打开总开关。

配置在 `%USERPROFILE%\.dsh\wake.json`；旧版 `continue-speaking.json` 会自动读取迁移。
