// ===== 配置 =====
marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// 修复常见错误命令
function fixCommonLaTeXErrors(text) {
    return text.replace(/\\textrightarrow/g, '\\rightarrow')
               .replace(/\\textleftarrow/g, '\\leftarrow')
               .replace(/\\textbackslash/g, '\\backslash');
}

// 检测是否包含 LaTeX 命令或数学符号
function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

// 全面公式保护：将所有公式模式转换为 <span class="math-tex">\(...\)</span> 或 <span class="math-tex">\[...\]</span>
function convertAllMathToSpans(text) {
    // 1. 保护标准块级公式 \[...\] 和 \(...\)
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
        return '<span class="math-tex">\\[' + content + '\\]</span>';
    });
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
        return '<span class="math-tex">\\(' + content + '\\)</span>';
    });

    // 2. 保护 $$...$$ 和 $...$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        return '<span class="math-tex">\\[' + content + '\\]</span>';
    });
    text = text.replace(/\$([^\$]*?)\$/g, (match, content) => {
        return '<span class="math-tex">\\(' + content + '\\)</span>';
    });

    // 3. 保护未转义的块级公式 [ ... ] 但内部有 LaTeX 命令
    // 先处理多行块，再处理单行，避免贪婪匹配
    text = text.replace(/\[([\s\S]*?)\]/g, (match, content) => {
        if (hasLatex(content) && !match.includes('<span class="math-tex">')) {
            return '<span class="math-tex">\\[' + content + '\\]</span>';
        }
        return match;
    });

    // 4. 处理剩余的裸 LaTeX 命令（如 \infty, \rightarrow 等未被包裹的）
    // 使用 split 分段处理，避免重复修改已保护部分
    const parts = text.split(/(<span[^>]*>[\s\S]*?<\/span>)/g);
    const processed = parts.map(part => {
        if (part.startsWith('<span')) return part; // 已保护跳过
        // 如果包含 LaTeX 命令且没有被任何公式分隔符包裹，则加 $...$
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            // 如果包含换行，使用块级，否则行内
            if (part.includes('\n')) {
                return '<span class="math-tex">\\[' + part + '\\]</span>';
            } else {
                return '<span class="math-tex">\\(' + part + '\\)</span>';
            }
        }
        return part;
    }).join('');

    return processed;
}

// 完整预处理流水线（带日志）
function prepareMathContent(text) {
    console.log('原始内容:', text);
    let processed = fixCommonLaTeXErrors(text);
    processed = convertAllMathToSpans(processed);
    console.log('处理后内容:', processed);
    return processed;
}

// ===== 以下为状态和逻辑（全部保留）=====
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
    if (typingTimer) { console.log('打字中，禁止发送'); return; }
    const input = document.getElementById("text");
    if (!input) { console.error('input 元素不存在'); return; }
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();
    const s = getCurrent();
    if (!s) { console.error('当前会话不存在'); return; }

    s.messages.push({ role: "user", text });
    try { renderChat(); } catch (e) { console.error('renderChat 错误:', e); }
    try { renderInfo(); } catch (e) { console.error('renderInfo 错误:', e); }
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
        console.error('fetch 错误:', err);
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();
    typingFullText = text || "";
    typingCurrentText = "";
    typingSessionId = session.id;
    const chat = document.getElementById("chat");
    if (!chat) { console.error('聊天容器不存在'); enableInput(true); return; }
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
            const processed = prepareMathContent(typingFullText);
            typingDiv.innerHTML = marked.parse(processed);
        } catch (e) {
            console.error('Markdown 渲染失败:', e);
            typingDiv.innerText = typingFullText;
        }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });
        typingDiv = null;
        typingSessionId = null;
        try { renderChat(); } catch (e) { console.error('renderChat 错误:', e); }
        try { renderInfo(); } catch (e) { console.error('renderInfo 错误:', e); }
        enableInput(true);
    }
}

function forceCompleteTyping() {
    if (!typingTimer) return;
    clearInterval(typingTimer);
    typingTimer = null;
    if (typingDiv) {
        try {
            const processed = prepareMathContent(typingFullText);
            typingDiv.innerHTML = marked.parse(processed);
        } catch (e) { typingDiv.innerText = typingFullText; }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });
        typingDiv = null;
        typingSessionId = null;
        try { renderChat(); } catch (e) { console.error('renderChat 错误:', e); }
        try { renderInfo(); } catch (e) { console.error('renderInfo 错误:', e); }
        enableInput(true);
    }
}

function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) { console.warn('chat 元素不存在'); return; }
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
                const processed = prepareMathContent(m.text);
                div.innerHTML = marked.parse(processed);
            } catch (e) {
                console.error('解析消息失败:', e);
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
            try { renderChat(); } catch (e) { console.error('renderChat 错误:', e); }
            try { renderInfo(); } catch (e) { console.error('renderInfo 错误:', e); }
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
    if (!info) { console.warn('info 元素不存在'); return; }
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
