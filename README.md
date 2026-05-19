# OpenClaw WeChat 部署

在 2C4G Ubuntu 服务器上部署 OpenClaw AI Agent，通过微信官方插件接入微信个人号。

## 环境要求

- **OS**: Ubuntu (latest LTS)
- **Node.js**: v22.22.2+
- **OpenClaw**: v2026.5.12+

## 快速开始

```bash
# 1. 安装 OpenClaw CLI
sudo npm install -g openclaw@latest

# 2. 配置 Kimi API（编辑 openclaw.config.json）
cp openclaw.config.example.json ~/.openclaw/openclaw.json

# 3. 安装微信插件
npx -y @tencent-weixin/openclaw-weixin-cli install

# 4. 启动二维码服务
nohup node qrcode-server.js > qrcode-server.log 2>&1 &

# 5. 通过 SSH 端口转发访问二维码页面
# 本地执行：ssh -i <key> -L 3001:localhost:3001 <user>@<your-server-ip>
# 浏览器访问 http://localhost:3001

# 6. 扫码绑定后重启网关
openclaw gateway restart
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `qrcode-server.js` | 二维码展示服务，通过 SSH 端口转发安全访问 |
| `Caddyfile` | Caddy 反向代理配置 |
| `openclaw.config.example.json` | OpenClaw 配置模板（需填入 API Key） |
| `docs/` | 详细部署文档 |

## 架构

```
用户微信消息
    ↓
微信服务器 (iLink 协议)
    ↓
OpenClaw 微信插件
    ↓
Kimi AI API
    ↓
OpenClaw 自动回复微信
```
