# Filament Studio

个人 3D 打印耗材管理 PWA，支持库存、AMS 槽位、Bambu 材料指南、烘干记录、JSON 备份和 R2 多设备同步。库存先写入当前浏览器的 IndexedDB。登录应用账号后可把该账号的库存同步到 R2。

## 从 GitHub 部署到 Cloudflare Pages

在 Cloudflare 控制台进入 **Workers & Pages → Create application → Pages → Connect to Git**，授权 Cloudflare GitHub App 访问 `ELT17604/FilamentStudio`。使用下列构建设置。

| 项目 | 设置 |
| --- | --- |
| GitHub 仓库 | `ELT17604/FilamentStudio` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | 仓库根目录，留空 |
| Build command | 留空 |
| Build output directory | `public` |

Pages 直接发布 `public/`，并自动编译仓库根目录的 `functions/`。只有 `/api/*` 进入 Pages Functions。无需独立创建 Worker，也无需配置 ChatGPT Sites。首次部署可以先打开网页使用本机库存。

## 配置 R2

1. 在同一个 Cloudflare 账户中启用 R2，创建一个私有桶，例如 `filament-studio-prod`。关闭 Public Development URL，且无需添加公开域名或创建 S3 API Token。
2. 打开 Pages 项目，进入 **Settings → Bindings → Add → R2 bucket**。绑定名填 **`BUCKET`**，选择实际的 R2 桶。配置 **Production**。如需在 **Preview** 测试，使用独立测试桶和独立凭据。
3. 配置账号变量后重新部署，让绑定和变量生效。

| R2 对象路径 | 用途 |
| --- | --- |
| `inventory/user1.json` | 第一个账号的当前库存，包含版本及保存信息 |
| `recovery/user1/0.json` 至 `recovery/user1/9.json` | 写入前的轮换快照 |
| `limits/…` | 登录和每个账号读写的限流状态 |

服务端从已验证的会话确定账号 ID，并通过 R2 ETag 条件写入处理并发。每账号每分钟最多读取 120 次、写入 20 次，每次提交上限 8 MiB。预览和生产环境可独立配置。

## 配置用户名和密码

在本地克隆仓库。用密码管理器生成独立的高强度密码，例如 24 个随机字符。用 Bash 或 Zsh 从终端隐式输入并生成校验值。

```bash
printf '输入应用密码（屏幕不会显示）: '
IFS= read -rs FILAMENT_PASSWORD
printf '\n'
printf '%s' "$FILAMENT_PASSWORD" | node scripts/password-verifier.mjs
unset FILAMENT_PASSWORD
```

另外生成一次随机会话签名密钥。

```bash
openssl rand -hex 32
```

在 Pages 项目的 **Settings → Variables and Secrets** 中，选中对应环境并添加下列变量。变量名区分大小写。

| 变量名 | 类型 | 值 |
| --- | --- | --- |
| `user1` | Text | 你选择的用户名 |
| `pw1` | Secret | 脚本输出的整行 `pbkdf2$100000$…` |
| `SESSION_SECRET` | Secret | 上一步生成的随机签名密钥，至少 32 个字符 |

添加账号时依次使用 `user2` / `pw2`、`user3` / `pw3`。每个用户名应唯一。数字对应固定的 R2 库存 ID。修改用户名或密码时保留原来的编号。密码校验使用 Cloudflare 运行时支持的 100,000 次 PBKDF2-SHA256，旧版 Sites 的校验值需用仓库内脚本重新生成。密码本身及实际密钥只保存在你的密码管理器或 Cloudflare Secret 中。

`SESSION_SECRET` 用于给登录 Cookie 加上 HMAC-SHA256 签名。登录后浏览器携带 Cookie，服务器验证签名及有效期后，才从其中接受账号 ID 并定位 R2 文件。知道账号 ID 无法自行签出有效会话。该密钥独立于用户密码校验值，轮换它会让现有会话失效，用户重新登录即可。

保存后重新部署，在 Pages 地址打开 **设置 → 云同步 → 登录**，输入明文用户名和原始密码。用测试卷盘验证同步后，可在 R2 对象列表检查对应的 `inventory/userN.json`。Pages 网页本身默认可访问，应用登录保护库存 API。如需限制整个站点的访问，可另外配置 Cloudflare Access。

## 从原站点迁移库存

IndexedDB 按站点域名隔离。先在原站点使用 **设置 → 导出 JSON**，登录新 Pages 站点中的应用账号后，使用 **设置 → 恢复备份** 导入并同步。这样可将已有数据写到新桶。若已将备份导入新站点的未登录库存，登录后使用 **导入本地库存**。旧站点的 R2 数据和浏览器库存不会自动复制到新域名。

## 开发与验证

Node.js 22+ 下执行 `npm test`。测试直接调用 Pages Function 入口，用内存对象存储验证登录、隔离、并发冲突、重复写入、回退快照与限流。正式环境部署后，再用两个浏览器会话验证登录与同步，并确认 `/app.webmanifest`、`/sw.js` 返回应用资源。

- `public/` 存放页面、样式、PWA 资源与共享库存数据模型。
- `functions/api/[[path]].js` 是 Pages Functions 入口。
- `server/api.js` 实现会话和 R2 库存 API。
- `scripts/password-verifier.mjs` 在本地生成密码校验值。

[Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Pages Functions 与 R2 绑定](https://developers.cloudflare.com/pages/functions/bindings/) · [Pages Functions 路由配置](https://developers.cloudflare.com/pages/functions/routing/)
