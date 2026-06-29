marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// 修复 AI 常见错误
function fixAIErrors(text) {
    return text
        // 错误标记
        .replace(/\\JBLOCK/g, '\\]')
        .replace(/IJBLOCK/g, '\\]')
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\text\{/g, '\\text{')
        .replace(/\\boxed\{/g, '\\boxed{')
        .replace(/\bINLINE\b/g, '')
        .replace(/\bBLOCK\b/g, '')
        // 常见命令错误
        .replace(/\\operatomame/g, '\\operatorname')
        .replace(/\\text\{([^}]*)\}/g, '\\text{$1}')
        .replace(/\\text{dots}/g, '\\dots')
        .replace(/\\text{overline}/g, '\\overline')
        // 修复未闭合的括号（如 \{ 后缺 }）
        .replace(/\\{([^}]*)$/g, '\\{$1}')
        // 修复类似 \(V(n \text{ le }5)\) 中错误的空格
        .replace(/\\text{ le }/g, '\\le ');
}

// 检测是否包含 LaTeX 命令
function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

// 主函数：占位符保护
function prepareMathContent(text) {
    let raw = fixAIErrors(text);
    const placeholders = [];
    let idx = 0;

    // 第一步：提取所有公式片段，替换为占位符
    // 匹配：\[...\]、$$...$$、\(...\)、$...$、[...]（含 LaTeX）
    const regex = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|\$([^\$]*?)\$|\[([^\]]*?)\]/g;
    raw = raw.replace(regex, (match, d1, d2, i1, i2, bracket) => {
        let content = d1 || d2 || i1 || i2 || bracket;
        if (!content || !content.trim()) return match;
        // 对于未转义的 [...] 但内容不含 LaTeX，则保留原样
        if (match.startsWith('[') && !hasLatex(content)) return match;
        const isDisplay = match.startsWith('\\[') || match.startsWith('$$') || (match.startsWith('[') && !match.startsWith('\\['));
        const ph = '@@MATH_' + (idx++) + '@@';
        placeholders.push({ ph, content, isDisplay });
        return ph;
    });

    // 第二步：处理裸 LaTeX（未被上述规则匹配的）
    // 按占位符分割，只处理非占位符部分
    const parts = raw.split(/(@@MATH_\d+@@)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('@@MATH_')) return part; // 已保护
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n');
            const ph = '@@MATH_' + (idx++) + '@@';
            placeholders.push({ ph, content: part, isDisplay });
            return ph;
        }
        return part;
    });
    const pureText = finalParts.join('');

    // 第三步：用 marked 解析纯文本（占位符不受影响）
    let html = marked.parse(pureText);

    // 第四步：替换占位符为 <span class="math-tex">，并转义反斜杠
    placeholders.forEach(p => {
        const escaped = p.content.replace(/\\/g, '&#92;');
        const span = p.isDisplay
            ? '<span class="math-tex">\\[' + escaped + '\\]</span>'
            : '<span class="math-tex">\\(' + escaped + '\\)</span>';
        html = html.replace(p.ph, span);
    });

    return html;
}

// ===== 应用逻辑（保持不变）=====
let sessions = [];
let currentId = null;
let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingCurrentText = "";
let typingSessionId = null;
const TYPING_SPEED = 15;

function getCurrent() { return sessions.find(s => s.id === currentId); }

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");
    if (input) {
        input.disabled = !enable;
        input.placeholder = enable ? "输入消息…" : "等待回复…";
        if (enable) input.focus();
    }
    if (btn) btn.disabled = !enable;
}

function newChat() {
    if (typingTimer) forceCompleteTyping();
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
    enableInput(true);
}

function send() {
    if (typingTimer) return;
    const input = document.getElementById("text");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!currentId) newChat();
    const s = getCurrent();
    if (!s) return;

    s.messages.push({ role: "user", text });
    try { renderChat(); } catch (e) { console.error(e); }
    try { renderInfo(); } catch (e) { console.error(e); }
    input.value = "";
    enableInput(false);

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    })
    .then(res => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return res.text().then(html => {
                throw new Error(`服务器返回了 HTML（状态 ${res.status}），请检查后端日志。`);
            });
        }
        return res.json();
    })
    .then(data => {
        const reply = data.reply || "（未收到回复）";
        startTyping(reply, s);
    })
    .catch(err => {
        console.error(err);
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();
    typingFullText = text || "";
    typingCurrentText = "";
    typingSessionId = session.id;
    const chat = document.getElementById("chat");
    if (!chat) { enableInput(true); return; }
    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;

    if (typingFullText.length === 0) { finish(); return; }

    typingTimer = setInterval(() => {
        if (typingCurrentText.length < typingFullText.length) {
            typingCurrentText += typingFullText[typingCurrentText.length];
            typingDiv.innerText = typingCurrentText;
            chat.scrollTop = chat.scrollHeight;
        } else {
            clearInterval(typingTimer);
            typingTimer = null;
            finish();
        }
    }, TYPING_SPEED);

    function finish() {
        try {
            typingDiv.innerHTML = prepareMathContent(typingFullText);
        } catch (e) {
            console.error(e);
            typingDiv.innerText = typingFullText;
        }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });
        typingDiv = null;
        typingSessionId = null;
        try { renderChat(); } catch (e) { console.error(e); }
        try { renderInfo(); } catch (e) { console.error(e); }
        enableInput(true);
    }
}

function forceCompleteTyping() {
    if (!typingTimer) return;
    clearInterval(typingTimer);
    typingTimer = null;
    if (typingDiv) {
        try {
            typingDiv.innerHTML = prepareMathContent(typingFullText);
        } catch (e) { typingDiv.innerText = typingFullText; }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });
        typingDiv = null;
        typingSessionId = null;
        try { renderChat(); } catch (e) { console.error(e); }
        try { renderInfo(); } catch (e) { console.error(e); }
        enableInput(true);
    }
}

function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) return;
    chat.innerHTML = "";
    const s = getCurrent();
    if (!s) { chat.innerHTML = '<div class="empty-tip">暂无对话，请新建</div>'; return; }
    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");
        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            try {
                div.innerHTML = prepareMathContent(m.text);
            } catch (e) {
                console.error(e);
                div.innerText = m.text;
            }
        }
        chat.appendChild(div);
    });

    if (typingTimer && typingDiv && typingSessionId === currentId) {
        const newDiv = document.createElement("div");
        newDiv.className = "msg ai";
        newDiv.innerText = typingCurrentText;
        chat.appendChild(newDiv);
        typingDiv = newDiv;
    }

    if (window.MathJax) {
        MathJax.typesetPromise([chat]).catch(err => console.warn('MathJax 渲染错误:', err));
    }
    chat.scrollTop = chat.scrollHeight;
}

function renderSessions() {
    const box = document.getElementById("sessions");
    if (!box) return;
    box.innerHTML = "";
    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";
        const span = document.createElement("span");
        span.innerText = s.name;
        span.onclick = () => {
            if (typingTimer) forceCompleteTyping();
            currentId = s.id;
            try { renderChat(); } catch (e) { console.error(e); }
            try { renderInfo(); } catch (e) { console.error(e); }
            enableInput(true);
        };
        span.ondblclick = () => {
            if (typingTimer) forceCompleteTyping();
            const newName = prompt("修改名称：", s.name);
            if (newName) { s.name = newName; renderSessions(); }
        };
        const del = document.createElement("button");
        del.className = "del";
        del.title = "删除对话";
        del.onclick = (e) => {
            e.stopPropagation();
            if (typingTimer) forceCompleteTyping();
            deleteSession(s.id);
        };
        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (!sessions.some(s => s.id === currentId)) {
        currentId = sessions.length > 0 ? sessions[0].id : null;
    }
    renderAll();
    if (sessions.length === 0) {
        enableInput(false);
        const input = document.getElementById("text");
        if (input) input.placeholder = "请新建对话";
    } else {
        enableInput(true);
    }
}

function renderInfo() {
    const info = document.getElementById("info");
    if (!info) return;
    const s = getCurrent();
    info.innerText = s ? `名称: ${s.name}\n消息数: ${s.messages.length}` : "无会话";
}

function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey && !input.disabled) {
                e.preventDefault();
                send();
            }
        });
    }
    newChat();
    setTimeout(() => enableInput(true), 100);
});
