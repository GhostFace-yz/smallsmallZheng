# 常用命令速查

## SSH 连接

```bash
ssh -i <key> <user>@<your-server-ip>
```

## OpenClaw

```bash
# 查看状态
openclaw status

# 启动 Gateway（前台）
openclaw gateway

# 重启 Gateway
openclaw gateway restart

# 微信扫码登录
openclaw channels login --channel openclaw-weixin

# 查看配置
cat ~/.openclaw/openclaw.json

# 查看版本
openclaw --version
```

## 二维码服务

```bash
# 查看进程
ps aux | grep qrcode-server

# 重启二维码服务
pkill -f qrcode-server
cd ~ && nohup node qrcode-server.js > qrcode-server.log 2>&1 &

# 查看日志
tail -f ~/qrcode-server.log
tail -f ~/qrcode-login.log
```

## Caddy

```bash
# 状态
sudo systemctl status caddy

# 重启
sudo systemctl restart caddy

# 查看配置
cat /etc/caddy/Caddyfile

# 重新加载配置
sudo caddy reload --config /etc/caddy/Caddyfile
```

## 日志查看

```bash
# OpenClaw 日志
ls -la ~/.openclaw/logs/

# 二维码服务日志
tail -f ~/qrcode-server.log

# 系统日志
sudo journalctl -f
```

## 文件位置

| 文件 | 路径 |
|------|------|
| OpenClaw 配置 | `~/.openclaw/openclaw.json` |
| OpenClaw 插件 | `~/.openclaw/npm/openclaw-weixin/` |
| 二维码服务 | `~/qrcode-server.js` |
| Caddy 配置 | `/etc/caddy/Caddyfile` |
