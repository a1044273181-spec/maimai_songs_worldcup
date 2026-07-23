# mai:CUP

舞萌中国版歌曲淘汰赛网站。用户可以按版本浏览曲库、试听歌曲，并依次完成小组赛、淘汰复活、一对一淘汰赛、四分之一决赛、半决赛和总决赛，最后生成可保存或分享的淘汰树海报。

## 在线地址

- GitHub Pages：<https://a1044273181-spec.github.io/maimai_songs_worldcup/>
- Sites：<https://mai-cup-cn-2026.xzso3.chatgpt.site>

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

## 构建与测试

```bash
npm test
npm run build:pages
```

`npm run build:pages` 会生成适配 `/maimai_songs_worldcup/` 子路径的静态文件到 `dist/client/`，并生成指向 GitHub Pages 地址的二维码。

## GitHub Pages

推送到 `main` 后，[部署工作流](.github/workflows/deploy-pages.yml)会自动：

1. 安装依赖；
2. 执行静态导出；
3. 上传 `dist/client/`；
4. 发布到 GitHub Pages。

如果仓库尚未启用 Pages，请在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。
