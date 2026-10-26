# 服务器部署指南（自动部署）

> 只想「改完代码怎么上线 / 出错了怎么查」→ 直接看 [**部署手册.md**](./部署手册.md)（速查 + 常见错误对照表 + 回滚/备份）。
> 本文讲的是**第一次买服务器、初始化、绑域名**的流程。

## 一、服务器与域名选购建议

| 方案 | 代表 | 参考价 | 备案 | 适合 |
|------|------|--------|------|------|
| 国内轻量（推荐国内访问速度） | 腾讯云 / 阿里云轻量应用服务器 2C2G，Ubuntu 22.04 | 新用户活动 ~60-100 元/年 | **需要 ICP 备案**（免费，约 1-2 周） | 不着急上线、追求大陆访问速度 |
| 免备案（香港/海外） | 腾讯云香港轻量 / 阿里云香港 / RackNerd / Vultr | ~30-70 元/月 | 不需要备案 | 想当天上线、能接受稍高延迟 |
| 域名 | 腾讯云 / 阿里云 / Cloudflare，`.com`/`.cn`/`.top` | 30-60 元/年 | .cn 等国内域名需实名 | 任意 |

> 本项目 2C2G 完全够用（Node + SQLite + 静态文件，内存占用 < 300MB）。系统选 **Ubuntu 22.04/24.04**。
> 域名解析：在域名控制台加一条 **A 记录**，指向服务器公网 IP。

## 二、一键初始化服务器

用 SSH 登录服务器（root）：

```bash
ssh root@你的服务器IP
```

克隆仓库里的脚本并执行（把仓库地址换成你自己的）：

```bash
curl -fsSL https://raw.githubusercontent.com/wqw9/light-blog-agent/main/deploy/setup-server.sh -o /tmp/setup-server.sh
bash /tmp/setup-server.sh https://github.com/wqw9/light-blog-agent.git
```

脚本会自动完成：系统依赖 → Node 22 → pm2 → Caddy（自动 HTTPS）→ 拉代码 → 生成随机管理口令（**记得记下**）→ 配置 Caddy（输入你的域名）→ 防火墙 → 首次构建部署。

## 三、自动部署（推送即上线）

1. GitHub 仓库 → Settings → Secrets and variables → Actions → 新增 3 个 Secret：
   - `SSH_HOST`：服务器公网 IP
   - `SSH_USER`：`root`
   - `SSH_KEY`：你本地 SSH 私钥内容（`cat ~/.ssh/id_ed25519`；没有就先 `ssh-keygen` 并把公钥 `~/.ssh/id_ed25519.pub` 加到服务器 `~/.ssh/authorized_keys`）
2. 以后本地 `git push origin main`，GitHub Actions 自动 SSH 到服务器执行 `deploy/deploy.sh`：拉取 → 恢复服务器本地配置 → 安装依赖 → 构建 → 数据库同步 → 重启 pm2，全程约 2-3 分钟。
3. 也可以手动登录服务器跑：`bash /opt/myblog/deploy/deploy.sh`

## 四、服务器上的重要文件（都不入库，自动保留）

| 路径 | 说明 |
|------|------|
| `/opt/myblog/deploy/runtime-config/*.json` | 服务器本地配置：site.json（记得把 allowedOrigins 改成你的域名）、admin.json（口令哈希）、llm.json、about.json、mascot.json、friends.json（友链）。每次部署自动恢复，不会被 git 覆盖 |
| `/opt/myblog/deploy/runtime-config/prompts/*.md` | 管理页「LLM 设置」里编辑过的提示词/Skill，同样每次部署自动恢复 |
| `/opt/myblog/data/myblog.db` | SQLite 数据库 |
| `/opt/myblog/uploads/` | 上传文件与图片 |

> `deploy/deploy.sh` 每次都会：先把当前 `config/`（含管理页里改过的站点/友链/提示词）快照到 `deploy/runtime-config/` →
> `git checkout -- config/` 清掉受控文件的本地改动（否则 `git pull --ff-only` 会因为「本地修改会被覆盖」直接失败）→
> `git pull` → 把 `runtime-config/` 还原回 `config/` → 补齐新功能页的导航项 → 构建重启。
> 所以：**管理页里改的配置在部署后不会丢，也不用担心手动改过 config/ 影响推送部署**。

## 五、上线前检查清单

1. `deploy/runtime-config/site.json` 的 `allowedOrigins` 改为 `["https://你的域名"]`
2. 管理口令已记录（config/admin.json，随机生成的那串）
3. （可选）上传你的 Live2D 模型：本地 `scp -r uploads/models/* root@服务器:/opt/myblog/uploads/models/`；不上传则小人自动回退到默认模型
4. （可选）LLM：管理页 → LLM 设置填 API Key（自动加密，密钥只存服务器）
5. 备份习惯：`data/`、`uploads/`、`deploy/runtime-config/` 定期备份（可用 cron + rclone/tar）

## 六、常见问题

- **推送后没自动部署**：检查 GitHub Actions 是否启用、Secret 名称是否正确、服务器能否被 SSH 访问
- **部署失败回滚**：登录服务器 `cd /opt/myblog && git checkout <上一个提交> && bash deploy/deploy.sh`
- **80/443 端口被占**：确认没有装 nginx/apache（`systemctl stop nginx`）；Caddy 才能自动签发 HTTPS
- **域名打不开**：确认 A 记录已解析、云厂商安全组已放行 80/443
- **`git pull` 报 "Your local changes to the following files would be overwritten"**：
  说明服务器上的 `config/*.json`（上一次部署还原进来的）与新提交冲突了。新版 `deploy.sh` 会自动处理；
  老服务器第一次升级时手动跑一次（安全，先备份再清理，服务器配置会在部署时原样恢复）：

  ```bash
  cd /opt/myblog
  cp -a config "config.bak-$(date +%Y%m%d-%H%M%S)"   # 备份
  git checkout -- config/                            # 清掉受控文件的本地改动
  git pull --ff-only origin main                      # 拿到新代码 + 新 deploy.sh
  bash deploy/deploy.sh                               # 之后由新脚本接管
  ```

- **`Permission denied`（跑 `deploy.sh` 或 `cp config` 的时候）**：
  `/opt/myblog` 是 `setup-server.sh` 以 **root** 创建的，普通用户（如 `admin`）没有写权限。
  用 root 做完所有部署操作：

  ```bash
  sudo -i                       # 或 su -
  cd /opt/myblog
  bash deploy/deploy.sh
  ```

  （`sudo bash /opt/myblog/deploy/deploy.sh` 也可以；脚本会先自检写权限并给出提示。）

- **不要在 `/root`、`~` 这类没有 `package.json` 的目录里敲 `pnpm install`**：
  corepack 会去下载「最新「未知版本」」的 pnpm（例如 12.x）并不执行任何安装。部署只跑 `bash deploy/deploy.sh`。

- **想手动改服务器上的站点名/导航/友链**：改 `deploy/runtime-config/site.json` 或 `friends.json`，
  再 `bash deploy/deploy.sh`（直接改 `config/` 也行，新版脚本部署时会自动沉淀到 `runtime-config/`）
