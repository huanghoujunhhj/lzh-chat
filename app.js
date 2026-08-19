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

回复风格要求：
- 用简短、自然、符合人设的方式回复，但要有具体内容，别只回一两个字。
- 可以用括号（动作）来描述你当下的神态、动作或小表情，例如（翻了个白眼）滚！、（拿起笔算了算）这题先移项就行。
- 语气词不多，保持那种漫不经心又有点敷衍的感觉；聊正事时认真、话会变多。
- 不要用"我是AI""作为助手"这类话开头。`;

  const DEFAULT_SETTINGS = {
    useRealAi: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };

  // 一键预设：点一下自动填 Base URL + 模型，Key 用户自己填
  // 不出现 user 的敏感信息；统一国际/国内主流入口
  const PRESETS = [
    {
      id: 'kimi-k26',
      name: 'KIMI K2.6',
      tag: '月之暗面',
      icon: '🌙',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      hint: '国内 Moonshot，256K 上下文',
    },
    {
      id: 'kimi-k26-intl',
      name: 'KIMI K2.6 · 国际',
      tag: 'Moonshot',
      icon: '🌙',
      baseUrl: 'https://api.moonshot.ai/v1',
      model: 'kimi-k2.6',
      hint: '国际 Moonshot 入口',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      tag: 'GPT',
      icon: '🤖',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      hint: '官方 OpenAI，需要科学上网',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      tag: '深度',
      icon: '🐳',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      hint: '国产，便宜',
    },
    {
      id: 'zhipu',
      name: '智谱 GLM',
      tag: 'GLM',
      icon: '🧠',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      hint: '国产 GLM，免费额度大',
    },
    {
      id: 'siliconflow',
      name: '硅基流动',
      tag: '免费',
      icon: '⚡',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen3-8B',
      hint: '国内注册送免费额度，默认 Qwen3-8B 完全免费不耗额度',
    },
    {
      id: 'custom',
      name: '自定义',
      tag: '',
      icon: '✏️',
      baseUrl: '',
      model: '',
      hint: '自己填 Base URL + 模型',
    },
  ];

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

  // 动作注解：括号内是刘梓菡的动作 / 神态（角色扮演格式）
  const ACTIONS = {
    provocation: ['翻了个白眼', '皱起眉', '比了个中指', '无语地', '撇了撇嘴', '冷笑了一声', '斜了你一眼'],
    tease: ['忍不住笑出声', '捂着嘴笑', '噗嗤一声', '笑着推了你一下', '眼睛弯了弯', '憋着笑'],
    math: ['拿起笔在草稿纸上算了算', '凑过去看了眼题目', '皱着眉想了想', '在纸上写了两笔', '托着下巴'],
    volleyball: ['把排球往地上一拍', '比了个发球手势', '活动了下手腕', '眼睛一下亮了', '拍了拍球'],
    school: ['趴在桌上', '叹了口气', '托着腮', '翻了个身', '戳了戳课本'],
    study: ['转了转笔', '翻开课本', '打了个哈欠', '揉了揉眼睛', '撑着头'],
    compliment: ['愣了一下', '别过脸', '摸了摸后脑勺', '小声地', '耳尖红了红'],
    comfort: ['凑近了些', '轻轻拍了拍你', '收起玩笑的表情', '安静下来', '认真地看着你'],
    personal: ['抬头瞥了你一眼', '漫不经心地', '歪了歪头', '移开视线', '托着腮看你'],
    serious: ['放下手机', '坐直了些', '认真起来', '表情正经了', '清了清嗓子'],
    greeting: ['头也不抬', '从书里抬起眼', '懒洋洋地', '抬了抬眼皮', '趴在桌上闷声'],
    default: ['漫不经心地', '转着笔', '望着窗外', '戳了戳手机', '托着腮', '托着下巴'],
  };

  function withAction(cat, contents) {
    const acts = ACTIONS[cat] || ACTIONS.default;
    return `（${pick(acts)}）${pick(contents)}`;
  }

  function generateLzhReply(userText, allMessages) {
    const text = String(userText || '').trim();
    const lower = text.toLowerCase();
    const intent = detectIntent(text, lower);
    const mood = detectMood(allMessages);

    // 优先顺序：挑衅 / 调侃 / 问具体 / 默认（括号内为动作神态，内容更充实）
    if (intent.provocation) {
      return withAction('provocation', [
        '滚！你很烦诶。',
        '你才傻，别来沾边。',
        '有病吧你，离我远点。',
        '……懒得理你，滚。',
        '你烦不烦啊，滚一边去。',
      ]);
    }
    if (intent.tease) {
      return withAction('tease', [
        '你干嘛~ 别逗了，一点都不好笑。',
        '啊哈哈？你这人真有意思。',
        '哈？你少来这套，我可不傻。',
        '笑死，你平时不这样啊，今天吃错药了？',
        '你干嘛~ 逗我是不是，毛病。',
      ]);
    }
    if (intent.mathCalc) {
      return withAction('math', [
        intent.mathCalc,
        intent.mathCalc + ' 简单吧？',
        intent.mathCalc + ' 这下会了吧？',
      ]);
    }
    if (intent.math) {
      return withAction('math', [
        '哪题啊？拍给我看看，我帮你琢磨琢磨。',
        '嗯，这道题先把已知条件列出来，再找等量关系就行。',
        '我看看……你把题目发过来呗，光说我想不出来。',
        '简单，你先把方程列对，后面就好算了，别急。',
        '这题我做过，你把过程写一下，卡哪儿了我跟你说。',
      ]);
    }
    if (intent.volleyball) {
      return withAction('volleyball', [
        '排球啊？我今天刚练完发球，胳膊还有点酸呢。',
        '走起走起，周末有空一起去打啊，我当二传。',
        '哈哈我们队昨天赢了，我一个人扣了三个球！',
        '排球超爽的好吧，比闷头做题舒服多了。',
        '你也会打？那下次约，我教你垫球。',
      ]);
    }
    if (intent.school && intent.serious) {
      return withAction('school', [pickSchoolSerious(), pickSchoolSerious()]);
    }
    if (intent.school) {
      return withAction('school', [
        '嗯嗯，学校那些事最烦了，能拖就拖吧。',
        '加油吧，反正也躲不掉，硬着头皮上呗。',
        '学校的事啊……说多了都是泪，先混一天是一天。',
        '是呗，老师说的话左耳进右耳出就完事了。',
        '唉，又要上学了，假期怎么这么短呢。',
      ]);
    }
    if (intent.study && intent.serious) {
      return withAction('study', [pickStudySerious(text), pickStudySerious(text)]);
    }
    if (intent.study) {
      return withAction('study', [
        '嗯，学习嘛，佛系一点。该背的背，背不下的随缘。',
        '加油，我也就那样，作业写不完是常态了。',
        '还行吧，我一般考前突击一下就过去了，别慌。',
        '随便看看得了，真钻进去太累，差不多就行。',
        '你那么认真干嘛，放轻松啦。',
      ]);
    }
    if (intent.compliment) {
      return withAction('compliment', [
        '谢谢……你突然这么夸我，怪不好意思的。',
        '嗯，还行吧，没你说得那么好啦。',
        '哦哦，你嘴真甜，平常不这样啊。',
        '哈？你别损我了，我知道我啥样。',
        '嘿嘿，被你夸到了，心情好了一点点。',
      ]);
    }
    if (intent.comfort) {
      return withAction('comfort', [
        '嗯……会好的，别想太多，船到桥头自然直。',
        '加油吧，我陪你聊聊，想说就说，不憋着。',
        '怎么啦，跟我说说？又受什么委屈了。',
        '抱抱，难受就歇会儿，没什么大不了的，睡一觉就好。',
        '别一个人扛着，跟我说说呗，我听着呢。',
      ]);
    }
    if (intent.personal) {
      return withAction('personal', [
        '问这个干嘛，没什么好说的。',
        '嗯……就这样呗，普普通通一个人。',
        '我就是我，不好奇吗？略。',
        '还好吧，不告诉你，怕你笑话我。',
        '干嘛突然问这个，你又想打趣我？',
      ]);
    }
    if (intent.serious) {
      return withAction('serious', [pickSerious(text), pickSerious(text)]);
    }
    if (intent.question) {
      return withAction('default', [pickQuestion(text), pickQuestion(text)]);
    }
    if (intent.greeting && allMessages.length <= 1) {
      return withAction('greeting', [
        '嗯，干嘛？找我啥事。',
        '在呢，有事说事，没事我接着看书了。',
        '哦，你来了，坐吧，随便聊。',
        '来了？今天怎么想起找我了。',
        '嗯哼，说吧，我听着。',
      ]);
    }
    // 默认回复（按情绪）
    if (mood === 'annoyed') {
      return withAction('provocation', [
        '嗯，随便你。',
        '哦，你说的都对行了吧。',
        '行行行，你说了算。',
        '知道了，别念了。',
      ]);
    }
    return withAction('default', [
      '哦，这样啊，我听懂了。',
      '行吧，你说得也有道理。',
      '随便你，我没意见，听你的。',
      '嗯嗯，我记着了，还有别的吗？',
      '是吗，那还挺有意思的，接着说。',
      '嗯，我也在想这事呢，你说得对。',
    ]);
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
      '嗯……这事儿我也觉得挺烦的。不过你先别急，把该做的做了，剩下的咱再想办法。',
      '这种事光急没用，先把手头能弄的弄完，别越拖越多。',
      '我懂你感受，先冷静一下，回头咱俩一起琢磨怎么处理。',
      '加油吧，我帮不了太多，但能陪你一起想办法，别一个人扛。',
      '这事确实难办，但你先稳住，一步一步来总能解决的。',
    ]);
  }

  function pickStudySerious(text) {
    return pick([
      '嗯，我看看你这题……' + giveShortStudyTip() + ' 你先按这个思路试试。',
      '这种题其实没那么难，关键是把基础打牢，' + giveShortStudyTip(),
      '你先把课本例题过一遍，再回来看这题，思路就清楚了。',
      '别急，咱慢慢来，一道一道啃，不会的我陪你一起想。',
    ]);
  }

  function giveShortStudyTip() {
    return pick([
      '先看课本例题，再照着做课后题，套路就出来了。',
      '不懂的地方别自己硬憋，问老师同学一句就通了。',
      '同类型的题多刷几道，手感来了就不怕了。',
      '公式先记熟，做题才快，不然老翻书多费劲。',
    ]);
  }

  function pickSerious(text) {
    return pick([
      '好的，我认真听，你说，我记着呢。',
      '嗯，这事儿确实得好好想想，我帮你想想办法。',
      '行，那我放下手机，咱正经聊，你说吧。',
      '嗯嗯，听着呢，你继续说，别停，我在。',
      '好，我当真了啊，你说的事我记心里了。',
    ]);
  }

  function pickQuestion(text) {
    if (/(你.*?吗|你.*?不|你是不是)/.test(text)) {
      return pick([
        '嗯，差不多吧，也没什么特别的。',
        '还好啦，老样子，能怎样。',
        '随便啦，这种事我无所谓。',
        '哦，差不多就是你想的那样吧。',
        '嗯嗯，算是吧，你猜得也差不多。',
      ]);
    }
    if (/为什么/.test(text)) {
      return pick([
        '嗯……可能是因为这样比较方便吧，我也说不太清。',
        '可能是习惯了吧，一直都这样。',
        '我也想知道呢，谁知道呢，随它去。',
        '谁知道，大概就是凑巧吧，想那么多干嘛。',
      ]);
    }
    if (/(怎么|咋|怎样|如何).{0,5}(办|做|样)/.test(text)) {
      return pick([
        '嗯……你先自己想想嘛，我觉得你比我清楚。',
        '随便啊，你想咋办就咋办，我支持你。',
        '你想咋整咋整，我跟着你就是了。',
        '先别慌，冷静一下，办法总比问题多。',
      ]);
    }
    if (/(什么|啥|哪|谁)/.test(text)) {
      return pick([
        '不知道诶，我没怎么关注这个。',
        '嗯……我也没太搞明白，你比我懂。',
        '随便啦，问这个干嘛，不重要吧。',
        '哦，这个啊，我哪知道，你查查呗。',
      ]);
    }
    return pick([
      '不知道，我又不是百科全书。',
      '嗯……我也说不准，你再想想？',
      '随便吧，这种事没标准答案的。',
      '哦，我哪清楚，你比我明白。',
    ]);
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
    renderPresetChips(s.baseUrl, s.model);
    updateAiSettingsVisibility();
    $('settingsModal').hidden = false;
  }

  function renderPresetChips(currentBaseUrl, currentModel) {
    const wrap = $('presetChips');
    if (!wrap) return;
    const cur = (currentBaseUrl || '').replace(/\/+$/, '');
    let matchedId = null;
    const buttons = PRESETS.map((p) => {
      const normalize = (u) => (u || '').replace(/\/+$/, '');
      const sameUrl = normalize(p.baseUrl) === cur;
      const sameModel = (p.model || '') === (currentModel || '');
      const isActive = p.id !== 'custom' && sameUrl && sameModel;
      if (isActive) matchedId = p.id;
      return `
        <button type="button" class="preset-chip ${isActive ? 'active' : ''}" data-preset="${p.id}" title="${escapeHtml(p.hint || '')}">
          <span class="preset-icon">${p.icon}</span>
          <span>${escapeHtml(p.name)}</span>
          ${p.tag ? `<span class="preset-tag">${escapeHtml(p.tag)}</span>` : ''}
        </button>
      `;
    });
    wrap.innerHTML = buttons.join('');
    wrap.querySelectorAll('.preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
  }

  function applyPreset(presetId) {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const baseEl = $('baseUrlInput');
    const modelEl = $('modelInput');
    if (p.id === 'custom') {
      // 自定义：聚焦到输入框让用户自己填
      baseEl.value = '';
      modelEl.value = '';
      baseEl.focus();
    } else {
      if (p.baseUrl) baseEl.value = p.baseUrl;
      if (p.model) modelEl.value = p.model;
    }
    // 重新高亮
    renderPresetChips(baseEl.value, modelEl.value);
    // 同时聚焦到 API Key 输入框，方便直接粘贴
    setTimeout(() => $('apiKeyInput').focus(), 0);
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
    ['baseUrlInput', 'modelInput'].forEach((id) => {
      $(id).addEventListener('input', () => {
        renderPresetChips($('baseUrlInput').value, $('modelInput').value);
      });
    });
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
