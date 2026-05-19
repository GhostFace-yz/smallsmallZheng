const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/home/ubuntu/.openclaw/workspace';
const SESSIONS_DIR = process.env.OPENCLAW_SESSIONS || '/home/ubuntu/.openclaw/agents/main/sessions';

// 人格配置文件列表
const PERSONALITY_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'HEARTBEAT.md', 'BOOTSTRAP.md'];

// 读取文件
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// 写入文件
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

// 获取所有会话
function getSessions() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessions = [];
    for (const f of files) {
      if (f.endsWith('.jsonl') && !f.includes('.trajectory')) {
        const stat = fs.statSync(path.join(SESSIONS_DIR, f));
        const sessionId = f.replace('.jsonl', '');
        // 读取第一行获取时间戳
        const firstLine = readFile(path.join(SESSIONS_DIR, f))?.split('\n')[0];
        let createdAt = stat.mtime.toISOString();
        try {
          const data = JSON.parse(firstLine);
          createdAt = data.timestamp || createdAt;
        } catch {}
        sessions.push({ id: sessionId, size: stat.size, createdAt, updatedAt: stat.mtime.toISOString() });
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}

// 解析会话消息
function parseSession(sessionId) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  const content = readFile(filePath);
  if (!content) return [];

  const messages = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.type === 'message' && data.message) {
        const text = data.message.content?.map(c => c.text).join('') || '';
        messages.push({
          role: data.message.role,
          text: text.substring(0, 500),
          timestamp: data.timestamp,
          model: data.message.model
        });
      }
    } catch {}
  }
  return messages;
}

// API 路由处理
function handleAPI(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/sessions
  if (url === '/api/sessions') {
    res.end(JSON.stringify(getSessions()));
    return true;
  }

  // GET /api/session?id=xxx
  if (url.startsWith('/api/session?')) {
    const params = new URLSearchParams(url.split('?')[1]);
    const id = params.get('id');
    if (id) {
      res.end(JSON.stringify(parseSession(id)));
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'missing id' }));
    }
    return true;
  }

  // GET /api/personality/:file
  if (url.startsWith('/api/personality/')) {
    const file = decodeURIComponent(url.split('/api/personality/')[1]);
    if (PERSONALITY_FILES.includes(file)) {
      const content = readFile(path.join(WORKSPACE, file));
      res.end(JSON.stringify({ file, content: content || '' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'file not found' }));
    }
    return true;
  }

  // POST /api/personality/:file
  if (req.method === 'POST' && url.startsWith('/api/personality/')) {
    const file = decodeURIComponent(url.split('/api/personality/')[1]);
    if (PERSONALITY_FILES.includes(file)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const ok = writeFile(path.join(WORKSPACE, file), data.content);
          res.end(JSON.stringify({ ok }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'invalid json' }));
        }
      });
      return true;
    }
  }

  // POST /api/import-wechat
  if (req.method === 'POST' && url === '/api/import-wechat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = analyzeWeChatHistory(data.messages || []);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid data' }));
      }
    });
    return true;
  }

  return false;
}

// 分析微信聊天记录，生成人格配置
function analyzeWeChatHistory(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const totalMessages = userMessages.length;
  const avgLength = userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / Math.max(totalMessages, 1);

  // 提取常用词/口头禅（简单实现）
  const wordFreq = {};
  for (const m of userMessages) {
    const text = m.content || '';
    const words = text.split(/[\s,，.。？?！!;；]/).filter(w => w.length >= 2);
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  // 判断语气风格
  const casualMarkers = ['哈哈', '嘿嘿', '嗯', '哦', '呢', '吧', '啦', '呀'];
  const formalMarkers = ['您好', '请', '谢谢', '抱歉', '对不起'];
  let casual = 0, formal = 0;
  for (const m of userMessages) {
    const text = m.content || '';
    for (const marker of casualMarkers) if (text.includes(marker)) casual++;
    for (const marker of formalMarkers) if (text.includes(marker)) formal++;
  }
  const vibe = casual > formal * 2 ? 'casual' : formal > casual ? 'formal' : 'neutral';

  // 生成 SOUL.md 建议内容
  const suggestedSoul = `# SOUL.md - 用户人格模拟

## 用户特征

基于 ${totalMessages} 条聊天记录分析：

- **平均消息长度**: ${avgLength.toFixed(0)} 字
- **语气风格**: ${vibe === 'casual' ? '偏随意、亲切' : vibe === 'formal' ? '偏正式、礼貌' : '中性'}

## 常用表达

${topWords.slice(0, 10).map(w => `- "${w.word}" (${w.count}次)`).join('\n')}

## 回复风格

模仿用户时：
${vibe === 'casual' ? '- 用轻松的语气\n- 适当使用语气词（呢、吧、啦）\n- 不要太正式' : vibe === 'formal' ? '- 保持礼貌和正式\n- 使用敬语\n- 结构清晰' : '- 保持自然\n- 根据场景调整语气'}
`;

  return {
    totalMessages,
    avgLength: Math.round(avgLength),
    vibe,
    topWords,
    suggestedSoul
  };
}

// HTML 页面
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw 管理后台</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #333;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header h1 { font-size: 24px; }
    .nav {
      display: flex;
      gap: 8px;
      padding: 16px 40px;
      background: white;
      border-bottom: 1px solid #e8e8e8;
      overflow-x: auto;
    }
    .nav button {
      padding: 8px 20px;
      border: none;
      background: #f0f2f5;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .nav button:hover, .nav button.active {
      background: #667eea;
      color: white;
    }
    .content {
      padding: 24px 40px;
      max-width: 1200px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .card h2 { font-size: 18px; margin-bottom: 16px; color: #444; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .stat-card .number { font-size: 32px; font-weight: bold; color: #667eea; }
    .stat-card .label { color: #888; font-size: 14px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #f0f0f0; }
    th { color: #888; font-weight: 500; font-size: 13px; }
    tr:hover { background: #fafafa; }
    .btn {
      padding: 6px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      background: #667eea;
      color: white;
    }
    .btn:hover { background: #5a6fd6; }
    .btn-secondary { background: #f0f2f5; color: #666; }
    .btn-secondary:hover { background: #e0e2e5; }
    textarea {
      width: 100%;
      min-height: 400px;
      padding: 16px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
    }
    .message {
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 12px;
      max-width: 80%;
    }
    .message.user { background: #e3f2fd; margin-left: auto; }
    .message.assistant { background: #f5f5f5; }
    .message .role { font-size: 12px; color: #888; margin-bottom: 4px; }
    .message .text { font-size: 14px; line-height: 1.5; }
    .hidden { display: none; }
    .file-tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
    .file-tab {
      padding: 6px 14px;
      border: none;
      background: #f0f2f5;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .file-tab.active { background: #667eea; color: white; }
    .import-area {
      border: 2px dashed #ddd;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      color: #888;
    }
    .import-area textarea { min-height: 200px; margin-bottom: 16px; }
    .result-box {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 13px;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #4caf50;
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
      z-index: 1000;
    }
    @keyframes slideIn {
      from { transform: translateX(100px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>OpenClaw 管理后台</h1>
  </div>
  <div class="nav">
    <button class="active" onclick="showPage('dashboard')">📊 概览</button>
    <button onclick="showPage('sessions')">💬 对话记录</button>
    <button onclick="showPage('personality')">🎭 人格配置</button>
    <button onclick="showPage('import')">📥 微信导入</button>
  </div>

  <div class="content">
    <!-- Dashboard -->
    <div id="page-dashboard">
      <div class="stats">
        <div class="stat-card">
          <div class="number" id="stat-sessions">-</div>
          <div class="label">总会话数</div>
        </div>
        <div class="stat-card">
          <div class="number" id="stat-messages">-</div>
          <div class="label">总消息数</div>
        </div>
        <div class="stat-card">
          <div class="number" id="stat-files">7</div>
          <div class="label">人格文件</div>
        </div>
      </div>
      <div class="card">
        <h2>最近会话</h2>
        <table>
          <thead><tr><th>会话ID</th><th>消息数</th><th>大小</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody id="recent-sessions"></tbody>
        </table>
      </div>
    </div>

    <!-- Sessions -->
    <div id="page-sessions" class="hidden">
      <div class="card">
        <h2>所有会话</h2>
        <table>
          <thead><tr><th>会话ID</th><th>大小</th><th>创建时间</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody id="all-sessions"></tbody>
        </table>
      </div>
      <div id="session-detail" class="card hidden">
        <h2>对话详情</h2>
        <div id="messages-list"></div>
      </div>
    </div>

    <!-- Personality -->
    <div id="page-personality" class="hidden">
      <div class="card">
        <div class="file-tabs" id="file-tabs"></div>
        <textarea id="editor" placeholder="加载中..."></textarea>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button class="btn" onclick="saveFile()">💾 保存</button>
          <button class="btn btn-secondary" onclick="resetFile()">↩️ 重置</button>
        </div>
      </div>
    </div>

    <!-- Import -->
    <div id="page-import" class="hidden">
      <div class="card">
        <h2>导入微信聊天记录</h2>
        <p style="color: #888; margin-bottom: 16px;">将微信聊天记录导出为 JSON 格式粘贴下方，系统会分析并生成人格配置建议。</p>
        <p style="color: #888; font-size: 13px; margin-bottom: 16px;">格式示例: [{"role":"user","content":"消息内容","time":"2024-01-01"},...]</p>
        <textarea id="import-data" placeholder='[{"role":"user","content":"你好"},{"role":"assistant","content":"你好呀"}]'></textarea>
        <button class="btn" onclick="analyzeChat()">🔍 分析并生成配置</button>
        <div id="import-result"></div>
      </div>
    </div>
  </div>

  <script>
    const FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'HEARTBEAT.md', 'BOOTSTRAP.md'];
    let currentFile = 'SOUL.md';
    let originalContent = '';
    let sessionsData = [];

    function showPage(page) {
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('[id^="page-"]').forEach(p => p.classList.add('hidden'));
      document.getElementById('page-' + page).classList.remove('hidden');
      if (page === 'dashboard') loadDashboard();
      if (page === 'sessions') loadSessions();
      if (page === 'personality') loadPersonality();
    }

    async function loadDashboard() {
      const res = await fetch('/api/sessions');
      sessionsData = await res.json();
      document.getElementById('stat-sessions').textContent = sessionsData.length;
      let totalMsgs = 0;
      const tbody = document.getElementById('recent-sessions');
      tbody.innerHTML = sessionsData.slice(0, 5).map(s => {
        totalMsgs += Math.floor(s.size / 200);
        return \`<tr>
          <td>\${s.id.substring(0, 20)}...</td>
          <td>~\${Math.floor(s.size / 200)}</td>
          <td>\${(s.size / 1024).toFixed(1)} KB</td>
          <td>\${new Date(s.updatedAt).toLocaleString()}</td>
          <td><button class="btn" onclick="viewSession('\${s.id}')">查看</button></td>
        </tr>\`;
      }).join('');
      document.getElementById('stat-messages').textContent = totalMsgs;
    }

    async function loadSessions() {
      const res = await fetch('/api/sessions');
      sessionsData = await res.json();
      const tbody = document.getElementById('all-sessions');
      tbody.innerHTML = sessionsData.map(s => \`<tr>
        <td>\${s.id}</td>
        <td>\${(s.size / 1024).toFixed(1)} KB</td>
        <td>\${new Date(s.createdAt).toLocaleString()}</td>
        <td>\${new Date(s.updatedAt).toLocaleString()}</td>
        <td><button class="btn" onclick="viewSession('\${s.id}')">查看</button></td>
      </tr>\`).join('');
    }

    async function viewSession(id) {
      const res = await fetch('/api/session?id=' + encodeURIComponent(id));
      const messages = await res.json();
      const container = document.getElementById('messages-list');
      container.innerHTML = messages.map(m => \`
        <div class="message \${m.role}">
          <div class="role">\${m.role === 'user' ? '用户' : 'AI'} · \${new Date(m.timestamp).toLocaleTimeString()}</div>
          <div class="text">\${escapeHtml(m.text)}</div>
        </div>
      \`).join('');
      document.getElementById('session-detail').classList.remove('hidden');
      document.getElementById('session-detail').scrollIntoView({ behavior: 'smooth' });
    }

    function loadPersonality() {
      const tabs = document.getElementById('file-tabs');
      tabs.innerHTML = FILES.map(f =>
        \`<button class="file-tab \${f === currentFile ? 'active' : ''}" onclick="switchFile('\${f}')">\${f}</button>\`
      ).join('');
      switchFile(currentFile);
    }

    async function switchFile(file) {
      currentFile = file;
      document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
      event?.target?.classList.add('active');
      const res = await fetch('/api/personality/' + encodeURIComponent(file));
      const data = await res.json();
      originalContent = data.content;
      document.getElementById('editor').value = data.content;
    }

    async function saveFile() {
      const content = document.getElementById('editor').value;
      const res = await fetch('/api/personality/' + encodeURIComponent(currentFile), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.ok) {
        originalContent = content;
        showToast('保存成功！');
      } else {
        showToast('保存失败', true);
      }
    }

    function resetFile() {
      document.getElementById('editor').value = originalContent;
      showToast('已重置');
    }

    async function analyzeChat() {
      const raw = document.getElementById('import-data').value;
      let messages;
      try {
        messages = JSON.parse(raw);
      } catch {
        showToast('JSON 格式错误', true);
        return;
      }
      const res = await fetch('/api/import-wechat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const result = await res.json();
      document.getElementById('import-result').innerHTML = \`
        <div class="card">
          <h3>分析结果</h3>
          <p>总消息数: \${result.totalMessages}</p>
          <p>平均长度: \${result.avgLength} 字</p>
          <p>语气风格: \${result.vibe === 'casual' ? '随意' : result.vibe === 'formal' ? '正式' : '中性'}</p>
          <h4 style="margin-top: 16px;">常用词汇</h4>
          <p>\${result.topWords.slice(0, 10).map(w => w.word + '(' + w.count + ')').join('、')}</p>
          <h4 style="margin-top: 16px;">建议的 SOUL.md</h4>
          <div class="result-box">\${escapeHtml(result.suggestedSoul)}</div>
          <button class="btn" style="margin-top: 12px;" onclick="applySoul(\`\${result.suggestedSoul.replace(/\\\\/g, '\\\\\\\\').replace(/\`/g, '\\\\\`')}\`)">应用此配置到 SOUL.md</button>
        </div>
      \`;
    }

    function applySoul(content) {
      currentFile = 'SOUL.md';
      showPage('personality');
      document.querySelector('.nav button:nth-child(3)').click();
      document.getElementById('editor').value = content;
      showToast('配置已加载到编辑器，点击保存即可应用');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function showToast(msg, error) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.background = error ? '#f44336' : '#4caf50';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    // 初始化
    loadDashboard();
  </script>
</body>
</html>`;

// HTTP 服务
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API
  if (handleAPI(req, res, req.url)) return;

  // HTML
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Admin dashboard running on http://127.0.0.1:${PORT}`);
});
