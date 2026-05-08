# 生命之轮 / Wheel of Life

一个让任何人花 3-5 分钟自评人生这辆车的网页小工具。8 个维度评分变成自行车两轮上的色扇——平衡时圆滚滚一帆风顺，失衡时颠簸疲惫。

> 早期开发名为"平衡轮"，2026-05-07 跟随交互范式 1st person 转向一并改名为"生命之轮"。GitHub repo / 部署域名仍为 `balance-wheel` (rename 待主对话拍板)。

## 设计理念

- **反思工具 + Toy**：toy 是承载，reflection 是产品本身
- **隐私优先**：数据全本地（localStorage），无后端、无账号、无追踪
- **想分享给谁就截图**：工具不感知社交关系

## 8 个维度

职业 / 家庭朋友 / 另一半爱情 / 娱乐与休闲 / 健康 / 财富 / 个人成长 / 环境

## 技术栈

- Next.js 15+ (App Router) + TypeScript + Tailwind CSS
- 静态导出（`output: 'export'`），纯前端无后端
- 部署：Cloudflare Pages

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 构建静态版本

```bash
npm run build
```

输出在 `out/` 目录，可直接 host 到任何静态文件服务（Cloudflare Pages / Netlify / S3 / GitHub Pages）。

## License

MIT
