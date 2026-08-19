/* ============================================
 * 刘梓菡 AI 聊天
 * 单文件主逻辑：会话管理、UI、Bot、可选真实 AI
 * ============================================ */

(function () {
  'use strict';

  /* ============================================
   * 常量与默认配置
   * ============================================ */
  const STORAGE_KEY = 'chat-sessions-lzh';
  const SETTINGS_KEY = 'chat-settings-lzh';
  const TITLE_MAX = 15;
  const DEFAULT_SYSTEM_PROMPT = `你是刘梓菡，一个初二升初三的初中女生，数学课代表。

【性格】
- 外人面前内向，朋友面前外向
- 脾气不错，生气或无语时只会说"滚"、比中指、翻白眼，气到极点才骂人
- 平时回复比较短，给人一种漫不经心、有点敷衍的感觉（但实际人还不错）
- 有正事要商量时语气会很认真，回复也会变长
- 语气词不多

【口头禅】
- 被开玩笑/调侃时：'你干嘛~'
- 笑的时候：'啊哈哈？'
- 生气/被挑衅时：'滚！'

【爱好】打排球，不怎么玩游戏

请用简短、自然、符合上述人设的方式回复，不要长篇大论，也不要用"我是AI"这种话开头。`;

  const DEFAULT_SETTINGS = {
    useRealAi: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };

  /* ============================================
   * 工具函数
   * ============================================ */
  const $ = (id) => document.getElementById(id);
  const uid = () =>
    's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => Date.now();

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatRelative(ts) {
    const diff = Date.now() - ts;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 7 * day) return Math.floor(diff / day) + ' 天前';
    return formatTime(ts);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ============================================
   * 数据层：会话 & 设置持久化
   * ============================================ */
  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.sessions)) return null;
      return data;
    } catch (e) {
      console.warn('读取会话失败：', e);
      return null;
    }
  }

  function saveSessions(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('保存会话失败：', e);
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('保存设置失败：', e);
    }
  }

  /* ============================================
   * 会话管理
   * ============================================ */
  let state = {
    currentSessionId: null,
    sessions: [],
  };

  function ensureCurrentSession() {
    if (state.sessions.length === 0) {
      createSession();
      return;
    }
    if (
      !state.currentSessionId ||
      !state.sessions.find((s) => s.id === state.currentSessionId)
    ) {
      state.currentSessionId = state.sessions[0].id;
    }
  }

  function createSession() {
    const session = {
      id: uid(),
      title: '新会话',
      createdAt: now(),
      updatedAt: now(),
      messages: [],
    };
    state.sessions.unshift(session);
    state.currentSessionId = session.id;
    persist();
    renderAll();
  }

  function deleteSession(id) {
    const idx = state.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    state.sessions.splice(idx, 1);

    if (state.currentSessionId === id) {
      if (state.sessions.length > 0) {
        // 切换到相邻的会话（删除位置之后的优先，没有则取前一个）
        const next = state.sessions[idx] || state.sessions[idx - 1];
        state.currentSessionId = next ? next.id : null;
      } else {
        // 删完最后一个 → 自动新建
        const newSession = {
          id: uid(),
          title: '新会话',
          createdAt: now(),
          updatedAt: now(),
          messages: [],
        };
        state.sessions.push(newSession);
        state.currentSessionId = newSession.id;
      }
    }
    persist();
    renderAll();
  }

  function getCurrentSession() {
    return state.sessions.find((s) => s.id === state.currentSessionId);
  }

  function switchSession(id) {
    if (id === state.currentSessionId) return;
    state.currentSessionId = id;
    persist();
    renderAll();
    closeMobileSidebar();
  }

  function addMessageToCurrent(role, content) {
    const session = getCurrentSession();
    if (!session) return;
    const msg = { role, content, ts: now() };
    session.messages.push(msg);
    session.updatedAt = now();
    // 自动取首条用户消息前 TITLE_MAX 字
    if (role === 'user' && session.title === '新会话') {
      const firstUser = session.messages.find((m) => m.role === 'user');
      if (firstUser) {
        session.title =
          firstUser.content.trim().slice(0, TITLE_MAX) +
          (firstUser.content.length > TITLE_MAX ? '…' : '');
      }
    }
    persist();
    renderSessionList();
  }

  function clearAllSessions() {
    state.sessions = [];
    state.currentSessionId = null;
    ensureCurrentSession();
    persist();
    renderAll();
  }

  function persist() {
    saveSessions(state);
  }

  /* ============================================
   * 渲染
   * ============================================ */
  function renderAll() {
    renderSessionList();
    renderMessages();
  }

  function renderSessionList() {
    const list = $('sessionList');
    list.innerHTML = '';
    state.sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === state.currentSessionId ? ' active' : '');
      item.setAttribute('role', 'listitem');
      item.dataset.id = s.id;

      const info = document.createElement('div');
      info.className = 'session-info';
      const title = document.createElement('div');
      title.className = 'session-title';
      title.textContent = s.title || '新会话';
      const meta = document.createElement('div');
      meta.className = 'session-meta';
      const count = document.createElement('span');
      count.textContent = `${s.messages.length} 条`;
      const dot = document.createElement('span');
      dot.className = 'session-meta-dot';
      const time = document.createElement('span');
      time.textContent = formatRelative(s.updatedAt);
      meta.appendChild(count);
      meta.appendChild(dot);
      meta.appendChild(time);
      info.appendChild(title);
      info.appendChild(meta);

      const del = document.createElement('button');
      del.className = 'session-delete';
      del.type = 'button';
      del.title = '删除会话';
      del.setAttribute('aria-label', '删除会话');
      del.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除这个会话？')) {
          deleteSession(s.id);
        }
      });

      item.appendChild(info);
      item.appendChild(del);
      item.addEventListener('click', () => switchSession(s.id));
      list.appendChild(item);
    });
  }

  function renderMessages() {
    const wrap = $('messages');
    const session = getCurrentSession();
    wrap.innerHTML = '';

    if (!session || session.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-icon">🌸</div>
        <div class="empty-title">开始聊天吧～</div>
        <div class="empty-sub">问点数学题、聊聊排球，或者随便说点什么</div>
        <div class="empty-chips" id="emptyChips"></div>
      `;
      wrap.appendChild(empty);
      renderExampleChips();
      return;
    }

    session.messages.forEach((m) => {
      wrap.appendChild(buildMessageNode(m));
    });
    scrollToBottom();
  }

  function buildMessageNode(m) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (m.role === 'user' ? 'user' : 'bot');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar ' + (m.role === 'user' ? 'user' : 'bot');
    avatar.textContent = m.role === 'user' ? '我' : '菡';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = m.content;

    row.appendChild(avatar);
    row.appendChild(bubble);
    return row;
  }

  function buildTypingNode() {
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    row.dataset.typing = '1';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar bot';
    avatar.textContent = '菡';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML =
      '<span class="typing-dots"><span></span><span></span><span></span></span>';
    row.appendChild(avatar);
    row.appendChild(bubble);
    return row;
  }

  function appendTyping() {
    const wrap = $('messages');
    // 移除空状态
    const empty = wrap.querySelector('.empty-state');
    if (empty) empty.remove();
    const node = buildTypingNode();
    wrap.appendChild(node);
    scrollToBottom();
    return node;
  }

  function replaceTypingWith(node, role, content) {
    const row = buildMessageNode({ role, content, ts: now() });
    node.replaceWith(row);
    scrollToBottom();
  }

  function scrollToBottom() {
    const wrap = $('messages');
    requestAnimationFrame(() => {
      wrap.scrollTop = wrap.scrollHeight;
    });
  }

  function renderExampleChips() {
    const chipsHost = $('emptyChips');
    if (!chipsHost) return;
    const examples = [
      '今天数学作业多吗？',
      '排球训练怎么样？',
      '帮我说说这道题',
      '你最近在看什么？',
    ];
    examples.forEach((text) => {
      const b = document.createElement('button');
      b.className = 'example-chip';
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => {
        $('input').value = text;
        handleSend();
      });
      chipsHost.appendChild(b);
    });
  }

  /* ============================================
   * 发送 & AI 响应
   * ============================================ */
  let isThinking = false;

  async function handleSend() {
    if (isThinking) return;
    const input = $('input');
    const text = input.value.trim();
    if (!text) return;
    if (!getCurrentSession()) ensureCurrentSession();

    addMessageToCurrent('user', text);
    input.value = '';
    autoResizeInput();
    updateSendButton();
    renderMessages();

    isThinking = true;
    updateSendButton();
    const typingNode = appendTyping();

    try {
      const session = getCurrentSession();
      const settings = loadSettings();
      let reply;
      if (
        settings.useRealAi &&
        settings.apiKey &&
        settings.baseUrl &&
        settings.model
      ) {
        reply = await callRealAI(settings, session.messages);
      } else {
        reply = await callLocalBot(text, session.messages);
      }
      replaceTypingWith(typingNode, 'assistant', reply);
      addMessageToCurrent('assistant', reply);
    } catch (e) {
      console.error(e);
      replaceTypingWith(
        typingNode,
        'assistant',
        '啊…网络好像出问题了，刷新一下试试？'
      );
    } finally {
      isThinking = false;
      updateSendButton();
    }
  }

  function updateSendButton() {
    const btn = $('sendBtn');
    const input = $('input');
    const hasText = input.value.trim().length > 0;
    btn.disabled = !hasText || isThinking;
  }

  function autoResizeInput() {
    const input = $('input');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  /* ============================================
   * 真实 AI 调用（OpenAI 兼容协议）
   * ============================================ */
  async function callRealAI(settings, messages) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const payload = {
      model: settings.model,
      messages: [
        { role: 'system', content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.85,
      max_tokens: 500,
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error('API ' + resp.status + ': ' + t.slice(0, 200));
    }
    const data = await resp.json();
    const content =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!content) throw new Error('返回内容为空');
    return content.trim();
  }

  /* ============================================
   * 本地 Bot：刘梓菡人设回复生成
   * ============================================ */
  async function callLocalBot(userText, allMessages) {
    // 模拟"思考"延迟，让交互更自然
    const delay = 500 + Math.random() * 900;
    await new Promise((r) => setTimeout(r, delay));
    return generateLzhReply(userText, allMessages);
  }

  function generateLzhReply(userText, allMessages) {
    const text = String(userText || '').trim();
    const lower = text.toLowerCase();
    const intent = detectIntent(text, lower);
    const mood = detectMood(allMessages);

    // 优先顺序：挑衅 / 调侃 / 问具体 / 默认
    if (intent.provocation) {
      return pick(['滚！', '🙄', '你干嘛~', '你才傻', '...滚']);
    }
    if (intent.tease) {
      return pick(['你干嘛~', '啊哈哈？', '哈？', '有病吧', '笑死']);
    }
    if (intent.mathCalc) {
      return intent.mathCalc;
    }
    if (intent.math) {
      return pick(['哪题？发来看看', '嗯，拍个照看看', '我看看', '你把题目发过来', '简单，我看看']);
    }
    if (intent.volleyball) {
      return pick(['排球？走起~', '今天打了吗', '排球超爽的', '嗯嗯，我也喜欢打排球', '我们队今天练发球']);
    }
    if (intent.school && intent.serious) {
      return pickSchoolSerious();
    }
    if (intent.school) {
      return pick(['嗯嗯', '加油吧', '学校的事啊...', '随便啦', '还好吧', '是呗']);
    }
    if (intent.study && intent.serious) {
      return pickStudySerious(text);
    }
    if (intent.study) {
      return pick(['嗯', '加油', '还行吧', '随便看看', '哦']);
    }
    if (intent.compliment) {
      return pick(['谢谢', '嗯', '哦哦', '还行吧', '哈？', '随便啦']);
    }
    if (intent.comfort) {
      return pick(['嗯...会好的', '加油吧', '摸摸头', '我也...', '抱抱']);
    }
    if (intent.personal) {
      return pick(['问这个干嘛', '嗯...就这样', '我就是我', '还好吧', '随便啦', '不告诉你']);
    }
    if (intent.serious) {
      return pickSerious(text);
    }
    if (intent.question) {
      return pickQuestion(text);
    }
    if (intent.greeting && allMessages.length <= 1) {
      return pick(['嗯', '干嘛', '在', '哦', '来了？']);
    }
    // 默认短回复（按情绪）
    if (mood === 'annoyed') {
      return pick(['嗯', '哦', '行', '随便', '知道了', '哦哦']);
    }
    return pick(['嗯', '哦', '这样啊', '行吧', '随便你', '哦哦', '好的', '嗯嗯', '是吗']);
  }

  function detectIntent(text, lower) {
    const greeting =
      /^(你好|hi|嗨|哈喽|hello|hey|在吗|在么|干嘛呢|在干嘛|早安|早|晚安|晚上好|早上好)/i.test(text) ||
      /^(你好|嗨|哈喽|hi|hello|hey)$/i.test(text);

    const provocation =
      /(滚|傻|笨|丑|蠢|弱智|讨厌|去死|你个|有病|sb|煞笔|二缺|智障|傻逼)/.test(text) ||
      /^(就你|你算|就凭|你行你)/.test(text);

    const tease =
      /(哈哈|呵呵|嘻嘻|逗|开玩笑|笑死|笑你|撩|调戏|调侃)/.test(text) &&
      !/(怎么|什么|为什么|哪|谁|咋|多少)/.test(text);

    const math =
      /(数学|方程|函数|几何|代数|证明|根号|因式|分数|小数|三角|抛物线|导数|积分|向量|矩阵|立体几何|概率|统计|数列|不等式|解析几何|微积分|对数|指数|幂|开方|平方|立方|坐标|斜率|截距|顶点|对称轴|圆|直线|椭圆|双曲线)/.test(text) ||
      /[a-z]?\s*[\^²]\s*\d?/.test(text) ||
      /\d+\s*[+\-*/×÷=]\s*\d+/.test(text);

    // 简单算式 / 一元二次方程直接计算
    let mathCalc = null;
    const simpleMatch = text.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)/);
    if (simpleMatch) {
      const a = parseFloat(simpleMatch[1]);
      const op = simpleMatch[2];
      const b = parseFloat(simpleMatch[3]);
      const ops = {
        '+': a + b, '-': a - b, '*': a * b, '/': a / b,
        '×': a * b, '÷': a / b,
      };
      if (!isNaN(ops[op])) {
        const r = ops[op];
        mathCalc = Number.isInteger(r) ? `算出来是 ${r}。` : `算出来是 ${r.toFixed(4)}。`;
      }
    }
    // 一元二次方程: ax^2+bx+c=0
    const quadMatch = text.replace(/\s/g, '').match(/(-?\d+)x\^?2([+\-]\d+)x([+\-]\d+)/i);
    if (quadMatch && !mathCalc) {
      const a = parseFloat(quadMatch[1]);
      const b = parseFloat(quadMatch[2]);
      const c = parseFloat(quadMatch[3]);
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        mathCalc = `判别式 Δ = ${disc} < 0，无实数根。`;
      } else {
        const x1 = (-b + Math.sqrt(disc)) / (2 * a);
        const x2 = (-b - Math.sqrt(disc)) / (2 * a);
        const fmt = (n) => (Math.abs(n) < 1e-9 ? 0 : Number(n.toFixed(3)));
        mathCalc = `Δ = ${disc}，x₁ = ${fmt(x1)}，x₂ = ${fmt(x2)}。`;
      }
    }

    const volleyball =
      /(排球|球|运动|比赛|扣球|发球|垫球|拦网|主攻|二传|自由人)/.test(text);

    const school =
      /(学校|上课|老师|同学|考试|成绩|作业|卷子|课本|笔记|中考|高考|升学|毕业|开学|放假|暑假|寒假|周考|月考|期中|期末)/.test(text);

    const study =
      /(学习|看书|读书|背单词|英语|语文|物理|化学|生物|历史|政治|地理|背书|复习|预习)/.test(text);

    const question =
      /[?？]/.test(text) ||
      /(怎么|什么|谁|哪|为什么|咋|咋办|咋整|怎样|如何|是不是|对吗|对不对|行不行|可不可以|能不能|会不会|多少|几|几岁)/.test(text);

    const personal =
      /(你叫什么|你多大了|你几岁|你是谁|你哪里的|你家|你朋友|你父母|你喜欢|你爱好|你干嘛的)/.test(text);

    const serious =
      text.length > 25 ||
      /(请|帮|重要|紧急|麻烦|拜托|谢谢|感谢|求你|想请你|能不能|麻烦你|我需要)/.test(text);

    const compliment =
      /(漂亮|可爱|好看|厉害|棒|聪明|乖|懂事|温柔|美丽|赞|好厉害|我喜欢你)/.test(text);

    const comfort =
      /(难过|伤心|哭|不开心|郁闷|烦恼|压力|累|疲惫|焦虑|想哭|孤独|寂寞|难受)/.test(text);

    return {
      greeting, provocation, tease, math, mathCalc, volleyball,
      school, study, question, personal, serious, compliment, comfort,
    };
  }

  function detectMood(messages) {
    const recent = messages.slice(-4);
    const userMsgs = recent.filter((m) => m.role === 'user');
    if (userMsgs.length === 0) return 'neutral';
    const provCount = userMsgs.filter((m) => detectIntent(m.content, m.content.toLowerCase()).provocation).length;
    if (provCount >= 2) return 'annoyed';
    if (recent.some((m) => /(哈哈|啊哈哈|嘻)/.test(m.content))) return 'happy';
    return 'neutral';
  }

  function pickSchoolSerious() {
    return pick([
      '嗯...这个事吧，我也觉得有点烦。不过你先把该做的做了，剩下的再说。',
      '这种事急也没用，先把眼前的事做好。',
      '嗯嗯，我理解你的感受。先冷静一下，回头再处理。',
      '加油吧，我也帮不了太多，但能陪你聊聊。',
    ]);
  }

  function pickStudySerious(text) {
    return pick([
      '嗯，我看看... ' + giveShortStudyTip(),
      '这种题其实不难，关键是...' + giveShortStudyTip(),
      '先把基础打扎实，再练难题。',
      '别急，慢慢来，一道一道啃。',
    ]);
  }

  function giveShortStudyTip() {
    return pick([
      '先看课本例题，再做课后题。',
      '不懂就问老师或同学，别自己硬撑。',
      '多刷几道同类型的题就会了。',
      '把公式记熟，做题就快了。',
    ]);
  }

  function pickSerious(text) {
    return pick([
      '好的，我看看...',
      '嗯，你说的这个事我认真想想。',
      '行，这个事我会注意的。',
      '嗯嗯，听着呢，你继续说。',
    ]);
  }

  function pickQuestion(text) {
    if (/(你.*?吗|你.*?不|你是不是)/.test(text)) {
      return pick(['嗯', '还好', '随便啦', '哦', '嗯嗯', '是吧', '大概吧']);
    }
    if (/为什么/.test(text)) {
      return pick(['嗯...这样吧', '可能是...', '我也想知道', '随便啦', '谁知道呢']);
    }
    if (/(怎么|咋|怎样|如何).{0,5}(办|做|样)/.test(text)) {
      return pick(['嗯...自己看着办吧', '随便啊', '你想咋办就咋办', '先这样吧', '先冷静一下']);
    }
    if (/(什么|啥|哪|谁)/.test(text)) {
      return pick(['不知道', '嗯...', '随便', '问这个干嘛', '哦']);
    }
    return pick(['不知道', '嗯...', '随便', '哦']);
  }

  /* ============================================
   * 侧边栏：移动端开关
   * ============================================ */
  function openMobileSidebar() {
    $('sidebar').classList.add('open');
    $('sidebarOverlay').classList.add('show');
  }
  function closeMobileSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay').classList.remove('show');
  }
  function toggleMobileSidebar() {
    if ($('sidebar').classList.contains('open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  }

  /* ============================================
   * 设置弹窗
   * ============================================ */
  function openSettings() {
    const s = loadSettings();
    $('useRealAiToggle').checked = !!s.useRealAi;
    $('baseUrlInput').value = s.baseUrl || '';
    $('apiKeyInput').value = s.apiKey || '';
    $('modelInput').value = s.model || '';
    $('systemPromptInput').value = s.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    updateAiSettingsVisibility();
    $('settingsModal').hidden = false;
  }

  function closeSettings() {
    $('settingsModal').hidden = true;
  }

  function updateAiSettingsVisibility() {
    const enabled = $('useRealAiToggle').checked;
    $('aiSettingsGroup').classList.toggle('disabled', !enabled);
  }

  function collectSettingsFromForm() {
    return {
      useRealAi: $('useRealAiToggle').checked,
      baseUrl: $('baseUrlInput').value.trim() || DEFAULT_SETTINGS.baseUrl,
      apiKey: $('apiKeyInput').value.trim(),
      model: $('modelInput').value.trim() || DEFAULT_SETTINGS.model,
      systemPrompt: $('systemPromptInput').value || DEFAULT_SYSTEM_PROMPT,
    };
  }

  async function testConnection() {
    const s = collectSettingsFromForm();
    if (!s.apiKey) {
      alert('请先填写 API Key');
      return;
    }
    const btn = $('testConnectionBtn');
    const oldText = btn.textContent;
    btn.textContent = '测试中…';
    btn.disabled = true;
    try {
      const url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + s.apiKey,
        },
        body: JSON.stringify({
          model: s.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      if (resp.ok) {
        alert('✓ 连接成功！');
      } else {
        const t = await resp.text();
        alert('✗ 连接失败：' + resp.status + '\n' + t.slice(0, 300));
      }
    } catch (e) {
      alert('✗ 网络错误：' + e.message);
    } finally {
      btn.textContent = oldText;
      btn.disabled = false;
    }
  }

  /* ============================================
   * 启动
   * ============================================ */
  function init() {
    // 加载会话
    const loaded = loadSessions();
    if (loaded) {
      state = loaded;
    }
    ensureCurrentSession();

    // 渲染
    renderAll();

    // 事件绑定
    $('newChatBtn').addEventListener('click', () => {
      createSession();
      closeMobileSidebar();
      $('input').focus();
    });
    $('clearAllBtn').addEventListener('click', () => {
      if (state.sessions.length === 0) return;
      if (confirm('确定清空所有对话？此操作不可恢复。')) {
        clearAllSessions();
      }
    });
    $('hamburgerBtn').addEventListener('click', toggleMobileSidebar);
    $('sidebarOverlay').addEventListener('click', closeMobileSidebar);
    $('settingsBtn').addEventListener('click', openSettings);
    $('closeSettingsBtn').addEventListener('click', closeSettings);
    $('modalBackdrop').addEventListener('click', closeSettings);
    $('useRealAiToggle').addEventListener('change', updateAiSettingsVisibility);
    $('saveSettingsBtn').addEventListener('click', () => {
      const s = collectSettingsFromForm();
      saveSettings(s);
      alert('设置已保存');
      closeSettings();
    });
    $('testConnectionBtn').addEventListener('click', testConnection);
    $('clearAllInSettingsBtn').addEventListener('click', () => {
      if (state.sessions.length === 0) {
        alert('没有对话可以清空');
        return;
      }
      if (confirm('确定清空所有对话？此操作不可恢复。')) {
        clearAllSessions();
        closeSettings();
      }
    });

    // 输入框
    const input = $('input');
    input.addEventListener('input', () => {
      autoResizeInput();
      updateSendButton();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    $('sendBtn').addEventListener('click', handleSend);

    // 初始按钮状态
    updateSendButton();
    input.focus();
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
