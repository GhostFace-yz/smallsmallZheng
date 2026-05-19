# 部署配置详情

## 1. 服务器环境

- **OS**: Ubuntu (latest LTS)
- **CPU**: 2 核
- **内存**: 4G
- **Node.js**: v22.22.2（通过 NodeSource 安装）
- **npm**: v10.x

### Node.js 安装

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2. OpenClaw CLI

### 安装

```bash
sudo npm install -g openclaw@latest
```

### 配置

复制 `openclaw.config.example.json` 到 `~/.openclaw/openclaw.json`，填入：
- `gateway.auth.token`: 自定义认证 Token
- `models.providers.kimi.apiKey`: Kimi API Key

## 3. 微信官方插件

### 安装

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

### 登录（生成二维码）

```bash
openclaw channels login --channel openclaw-weixin
```

### 二维码网页服务

```bash
cd ~ && nohup node qrcode-server.js > qrcode-server.log 2>&1 &
```

访问方式（安全）：
```bash
# 本地终端执行 SSH 端口转发
ssh -i <key> -L 3001:localhost:3001 <user>@<your-server-ip>

# 浏览器访问
http://localhost:3001
```

## 4. Caddy 反向代理

```bash
sudo apt update
sudo apt install -y caddy
```

Caddyfile:
```
your-domain.com {
    # 配置需要的路由
}
```

```bash
sudo systemctl start caddy
sudo systemctl enable caddy
```

## 5. 网关管理

```bash
# 查看状态
openclaw status

# 重启网关
openclaw gateway restart

# 启动网关（前台）
openclaw gateway
```
