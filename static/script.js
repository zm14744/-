// ===== Markdown 配置 =====
marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// 修复常见 LaTeX 错误命令
function fixCommonLaTeXErrors(text) {
    return text.replace(/\\textrightarrow/g, '\\rightarrow')
               .replace(/\\textleftarrow/g, '\\leftarrow')
               .replace(/\\textbackslash/g, '\\backslash');
}

// 检测是否包含 LaTeX 命令或数学符号
function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

// 核心：将所有公式片段转换为 <span class="math-tex">\(...\)</span> 或 \[...\]
function prepareMathContent(text) {
    let processed = fixCommonLaTeXErrors(text);

    // 统一处理所有可能的公式分隔符，并转义反斜杠为 &#92;（防止 marked 破坏）
    // 顺序很重要：先处理块级，再处理行内，避免交叉干扰

    // 1. 处理 $$...$$ 块级
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        return '<span class="math-tex">\\[' + content.replace(/\\/g, '&#92;') + '\\]</span>';
    });

    // 2. 处理 \[...\] 块级（可能已被转义）
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
        return '<span class="math-tex">\\[' + content.replace(/\\/g, '&#92;') + '\\]</span>';
    });

    // 3. 处理未转义的 [ ... ] 块（若包含 LaTeX 命令）
    processed = processed.replace(/\[([^\]]*?)\]/g, (match, content) => {
        if (hasLatex(content) && !match.includes('<span class="math-tex">')) {
            return '<span class="math-tex">\\[' + content.replace(/\\/g, '&#92;') + '\\]</span>';
        }
        return match;
    });

    // 4. 处理 $...$ 行内
    processed = processed.replace(/\$([^\$]*?)\$/g, (match, content) => {
        return '<span class="math-tex">\\(' + content.replace(/\\/g, '&#92;') + '\\)</span>';
    });

    // 5. 处理 \(...\) 行内（可能已被转义）
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
        return '<span class="math-tex">\\(' + content.replace(/\\/g, '&#92;') + '\\)</span>';
    });

    // 6. 处理剩余的裸 LaTeX 命令（包含 \ 或 _ 或 ^ 等，且未被上述规则覆盖）
    // 使用 split 分段，只处理非 span 部分
    const parts = processed.split(/(<span[^>]*>[\s\S]*?<\/span>)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('<span')) return part; // 已保护跳过
        // 如果包含 LaTeX 特征且没有被任何公式分隔符包裹，则自动包裹
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n');
            const content = part.replace(/\\/g, '&#92;');
            return isDisplay ? '<span class="math-tex">\\[' + content + '\\]</span>'
                             : '<span class="math-tex">\\(' + content + '\\)</span>';
        }
        return part;
    });
    return finalParts.join('');
}

// ===== 以下为应用逻辑（保持不变）=====
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
            const processed = prepareMathContent(typingFullText);
            typingDiv.innerHTML = marked.parse(processed);
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
            const processed = prepareMathContent(typingFullText);
            typingDiv.innerHTML = marked.parse(processed);
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
                const processed = prepareMathContent(m.text);
                div.innerHTML = marked.parse(processed);
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
