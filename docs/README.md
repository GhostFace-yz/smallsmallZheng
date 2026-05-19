# OpenClaw WeChat 部署文档

## 环境要求

- **OS**: Ubuntu (latest LTS)
- **Node.js**: v22.22.2
- **OpenClaw**: v2026.5.12

## 服务状态

| 服务 | 进程管理 | 端口 | 状态 |
|------|---------|------|------|
| OpenClaw Gateway | systemd | 18789 | 运行中 |
| 微信插件 | OpenClaw 内置 | - | 已绑定 |
| QR Code 页面 | nohup node | 3001 | 运行中 |
| Caddy | systemd | 80/443 | 运行中 |

## 架构

```
用户微信消息
    ↓
微信服务器 (iLink 协议)
    ↓
OpenClaw 微信插件 (@tencent-weixin/openclaw-weixin)
    ↓
OpenClaw Agent（本地嵌入模式）
    ↓ (anthropic-messages adapter)
Kimi AI API
    ↓
OpenClaw 微信插件自动回复用户
```

## 目录结构

```
/home/ubuntu/
├── .openclaw/                    # OpenClaw 配置
│   ├── openclaw.json            # 网关配置
│   ├── npm/                     # 插件目录
│   │   └── openclaw-weixin/    # 微信官方插件
│   └── workspace/               # Agent workspace
├── qrcode-server.js            # 二维码展示服务
└── qrcode-server.log           # 服务日志
```

## 快速开始

1. **扫码绑定微信**
   - 本地执行 SSH 端口转发：`ssh -i <key> -L 3001:localhost:3001 <user>@<your-server-ip>`
   - 浏览器访问 `http://localhost:3001`
   - 用微信扫描二维码并确认登录

2. **验证状态**
   ```bash
   openclaw status
   ```

3. **测试消息**
   - 直接给微信发消息，Kimi AI 会自动回复
