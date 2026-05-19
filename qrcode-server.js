const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const LOG_FILE = path.join(__dirname, 'qrcode-login.log');

let currentQRCode = null;
let loginStatus = 'waiting'; // waiting, scanning, confirmed, expired
let statusMessage = '正在初始化...';

// 清空日志文件
fs.writeFileSync(LOG_FILE, '');

// 启动 OpenClaw 登录命令
function startLoginProcess() {
  console.log('[Login] 启动 OpenClaw 微信登录流程...');
  statusMessage = '正在获取二维码...';

  const proc = spawn('openclaw', ['channels', 'login', '--channel', 'openclaw-weixin'], {
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    fs.appendFileSync(LOG_FILE, text);

    // 提取二维码 URL
    const urlMatch = text.match(/https:\/\/liteapp\.weixin\.qq\.com\/q\/[^\s]+/);
    if (urlMatch) {
      currentQRCode = urlMatch[0];
      loginStatus = 'waiting';
      statusMessage = '请用微信扫描二维码';
      console.log('[Login] QR Code updated:', currentQRCode);
    }

    // 检测状态变化
    if (text.includes('已扫码') || text.includes('scaned')) {
      loginStatus = 'scanning';
      statusMessage = '已扫码，请在微信中确认登录';
    }
    if (text.includes('confirmed') || text.includes('登录成功') || text.includes('连接成功')) {
      loginStatus = 'confirmed';
      statusMessage = '登录成功！';
    }
    if (text.includes('过期') || text.includes('expired')) {
      loginStatus = 'expired';
      statusMessage = '二维码已过期，正在刷新...';
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    fs.appendFileSync(LOG_FILE, `[STDERR] ${text}`);
    console.error('[Login STDERR]', text.trim());
  });

  proc.on('close', (code) => {
    console.log(`[Login] 进程退出，code: ${code}`);
    if (loginStatus !== 'confirmed') {
      statusMessage = `登录流程结束 (code: ${code})，请刷新页面重试`;
      loginStatus = 'error';
    }
  });

  proc.on('error', (err) => {
    console.error('[Login] 进程错误:', err);
    statusMessage = '启动失败: ' + err.message;
    loginStatus = 'error';
  });
}

// HTTP 服务
const server = http.createServer((req, res) => {
  // API: 获取当前二维码 URL
  if (req.url === '/api/qrcode') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      url: currentQRCode,
      status: loginStatus,
      message: statusMessage,
      timestamp: Date.now()
    }));
    return;
  }

  // 首页: 显示二维码
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

    const qrImage = currentQRCode
      ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(currentQRCode)}" width="280" height="280" style="border:1px solid #ddd; border-radius:8px;">`
      : '<div style="width:280px;height:280px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;justify-content:center;"><span>加载中...</span></div>';

    res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw 微信扫码登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 { font-size: 24px; color: #333; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
    .qr-wrap {
      margin: 20px auto;
      padding: 16px;
      background: #fafafa;
      border-radius: 12px;
      display: inline-block;
    }
    .status {
      margin-top: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .status.waiting { background: #e3f2fd; color: #1976d2; }
    .status.scanning { background: #fff3e0; color: #f57c00; }
    .status.confirmed { background: #e8f5e9; color: #388e3c; }
    .status.expired { background: #ffebee; color: #c62828; }
    .status.error { background: #ffebee; color: #c62828; }
    .tip {
      margin-top: 16px;
      font-size: 13px;
      color: #999;
      line-height: 1.6;
    }
    .link-url {
      margin-top: 12px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 6px;
      font-size: 12px;
      color: #666;
      word-break: break-all;
    }
    .refresh-btn {
      margin-top: 16px;
      padding: 10px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .refresh-btn:hover { background: #5a6fd6; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>微信扫码登录</h1>
    <p class="subtitle">连接 OpenClaw 与微信</p>

    <div class="qr-wrap" id="qrWrap">
      ${qrImage}
    </div>

    <div class="status ${loginStatus}" id="status">
      ${statusMessage}
    </div>

    <div class="link-url ${currentQRCode ? '' : 'hidden'}" id="linkUrl">
      ${currentQRCode || ''}
    </div>

    <p class="tip">
      1. 打开微信 &rarr; 点击右上角"+" &rarr; "扫一扫"<br>
      2. 扫描上方二维码<br>
      3. 在微信中点击"确认登录"
    </p>

    <button class="refresh-btn" onclick="location.reload()">刷新页面</button>
  </div>

  <script>
    let currentUrl = ${JSON.stringify(currentQRCode || null)};

    // 每 3 秒轮询刷新二维码
    async function poll() {
      try {
        const res = await fetch('/api/qrcode?t=' + Date.now());
        const data = await res.json();

        if (data.url && data.url !== currentUrl) {
          currentUrl = data.url;
          document.getElementById('qrWrap').innerHTML =
            '<img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' +
            encodeURIComponent(data.url) + '" width="280" height="280" style="border:1px solid #ddd; border-radius:8px;">';
          document.getElementById('linkUrl').textContent = data.url;
          document.getElementById('linkUrl').classList.remove('hidden');
        }

        const statusEl = document.getElementById('status');
        statusEl.className = 'status ' + data.status;
        statusEl.textContent = data.message;

        if (data.status === 'confirmed') {
          setTimeout(() => location.reload(), 3000);
          return; // 停止轮询
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
      setTimeout(poll, 3000);
    }

    poll();
  </script>
</body>
</html>`);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Code server running on http://0.0.0.0:${PORT}`);
  startLoginProcess();
});
