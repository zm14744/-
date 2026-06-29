marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// ========== AI 错误修复（覆盖全部已知错误） ==========
function fixAIErrors(text) {
    let fixed = text
        // 修复常见错误标记
        .replace(/\\JBLOCK/g, '\\]')
        .replace(/IJBLOCK/g, '\\]')
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\text\{/g, '\\text{')
        .replace(/\\boxed\{/g, '\\boxed{')
        .replace(/\bINLINE\b/g, '')
        .replace(/\bBLOCK\b/g, '')
        // 修复 \operatomame → \operatorname
        .replace(/\\operatomame/g, '\\operatorname')
        // 修复 \text{...} 内的内容
        .replace(/\\text\{([^}]*)\}/g, '\\text{$1}')
        // 修复 \text{dots} → \dots
        .replace(/\\text{dots}/g, '\\dots')
        // 修复 \text{overline} → \overline
        .replace(/\\text{overline}/g, '\\overline')
        // 修复 \text{ le } → \le
        .replace(/\\text{ le }/g, '\\le ')
        // 修复 { 未闭合的情况（例如 \{ 后缺 }）
        .replace(/\\{([^}]*)$/gm, '\\{$1}')
        // 修复 \( V(n \text{ le }5) \) 中 \text{ le } → \le
        .replace(/\\text{ *le *}/g, '\\le ')
        // 修复多余的 } 或 {
        .replace(/\\{/g, '\\{')
        .replace(/\\}/g, '\\}')
        // 修复 \dots 后跟逗号或空格
        .replace(/\\dots,/g, '\\dots,')
        // 修复 \begin{pmatrix} 等缺少 \end
        .replace(/\\begin\{([^}]*)\}([\s\S]*?)(?=\\end|$)/g, (match, env, content) => {
            // 如果后面没有 \end{env}，则补上
            if (!match.includes('\\end{' + env + '}')) {
                return '\\begin{' + env + '}' + content + '\\end{' + env + '}';
            }
            return match;
        })
        // 修复 \left( ... \right) 等
        .replace(/\\left\(/g, '\\left(')
        .replace(/\\right\)/g, '\\right)')
        // 修复矩阵中 \ 和 \\ 问题（保留正确的换行）
        .replace(/\\\\/g, '\\\\') // 确保双反斜杠保留
        // 移除 \text{...} 中的多余空格
        .replace(/\\text\{([^}]*)\}/g, (match, content) => {
            return '\\text{' + content.trim() + '}';
        });
    return fixed;
}

// ========== 占位符保护 ==========
function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

function prepareMathContent(text) {
    let raw = fixAIErrors(text);
    const placeholders = [];
    let idx = 0;

    // 提取所有公式：\[...\]、$$...$$、\(...\)、$...$、[...]（含 LaTeX）
    const regex = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|\$([^\$]*?)\$|\[([^\]]*?)\]/g;
    raw = raw.replace(regex, (match, d1, d2, i1, i2, bracket) => {
        let content = d1 || d2 || i1 || i2 || bracket;
        if (!content || !content.trim()) return match;
        // 如果匹配的是未转义的 [...] 但不含 LaTeX，则保留
        if (match.startsWith('[') && !hasLatex(content)) return match;
        const isDisplay = match.startsWith('\\[') || match.startsWith('$$') || (match.startsWith('[') && !match.startsWith('\\['));
        const ph = '@@MATH_' + (idx++) + '@@';
        placeholders.push({ ph, content, isDisplay });
        return ph;
    });

    // 处理裸 LaTeX
    const parts = raw.split(/(@@MATH_\d+@@)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('@@MATH_')) return part;
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n');
            const ph = '@@MATH_' + (idx++) + '@@';
            placeholders.push({ ph, content: part, isDisplay });
            return ph;
        }
        return part;
    });
    const pureText = finalParts.join('');

    // marked 解析纯文本
    let html = marked.parse(pureText);

    // 还原占位符
    placeholders.forEach(p => {
        const escaped = p.content.replace(/\\/g, '&#92;');
        const span = p.isDisplay
            ? '<span class="math-tex">\\[' + escaped + '\\]</span>'
            : '<span class="math-tex">\\(' + escaped + '\\)</span>';
        html = html.replace(p.ph, span);
    });

    return html;
}

// ========== 应用逻辑（完全不变） ==========
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
