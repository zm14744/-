marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// ========== 强化修复：移除所有 INLINE/BLOCK 等干扰标记 ==========
function fixAIErrors(text) {
    // 先移除所有 INLINE 和 BLOCK 单词（不区分大小写，并处理前后空格）
    let cleaned = text.replace(/\b(INLINE|BLOCK)\b/gi, '');
    // 移除 $ 符号前后的多余空格（如 "$ ... $" 变为 "$...$"）
    cleaned = cleaned.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');
    // 其余常规修复
    return cleaned
        .replace(/\\JBLOCK/g, '\\]')
        .replace(/IJBLOCK/g, '\\]')
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\text\{/g, '\\text{')
        .replace(/\\boxed\{/g, '\\boxed{')
        .replace(/\\operatomame/g, '\\operatorname')
        .replace(/\\text{dots}/g, '\\dots')
        .replace(/\\text{overline}/g, '\\overline')
        .replace(/\\text{ le }/g, '\\le ')
        .replace(/\\text{ *le *}/g, '\\le ')
        .replace(/\\{/g, '\\{')
        .replace(/\\}/g, '\\}')
        .replace(/\\dots,/g, '\\dots,')
        .replace(/\\end\{([^}]*)\\end\{\1\}/g, '\\end{$1}')
        .replace(/\\begin\{([^}]*)\}([\s\S]*?)(?=\\end|$)/g, (match, env, content) => {
            if (!match.includes('\\end{' + env + '}')) {
                return '\\begin{' + env + '}' + content + '\\end{' + env + '}';
            }
            return match;
        })
        .replace(/\\left\(/g, '\\left(')
        .replace(/\\right\)/g, '\\right)')
        .replace(/\\\\/g, '\\\\');
}

function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

function prepareMathContent(text) {
    let raw = fixAIErrors(text);
    const placeholders = [];
    let idx = 0;

    // ===== 第一步：提取所有 \begin...\end 环境（块级） =====
    const beginEndRegex = /\\begin\{([^}]*)\}([\s\S]*?)\\end\{\1\}/g;
    raw = raw.replace(beginEndRegex, (match, env, content) => {
        const ph = '@@MATH_BLOCK_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: true });
        return ph;
    });

    // ===== 第二步：提取 $$...$$ 和 \[...\] 和 [...]（含 LaTeX） =====
    const blockRegex = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\[([^\]]*?)\]/g;
    raw = raw.replace(blockRegex, (match, d1, d2, bracket) => {
        let content = d1 || d2 || bracket;
        if (!content || !content.trim()) return match;
        // 如果匹配的是未转义的 [...] 但不含 LaTeX，则保留
        if (match.startsWith('[') && !hasLatex(content)) return match;
        const ph = '@@MATH_BLOCK_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: true });
        return ph;
    });

    // ===== 第三步：提取 \(...\) 和 $...$ 行内 =====
    // 注意：$...$ 可能包含多个，使用非贪婪匹配
    const inlineRegex = /\\\(([\s\S]*?)\\\)|\$([^\$]*?)\$/g;
    raw = raw.replace(inlineRegex, (match, i1, i2) => {
        let content = i1 || i2;
        if (!content || !content.trim()) return match;
        const ph = '@@MATH_INLINE_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: false });
        return ph;
    });

    // ===== 第四步：处理裸 LaTeX（未被以上规则覆盖） =====
    const parts = raw.split(/(@@MATH_(BLOCK|INLINE)_\d+@@)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('@@MATH_')) return part;
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n') || /\\begin/.test(part);
            const ph = (isDisplay ? '@@MATH_BLOCK_' : '@@MATH_INLINE_') + (idx++) + '@@';
            placeholders.push({ ph, content: part, isDisplay });
            return ph;
        }
        return part;
    });
    const pureText = finalParts.join('');

    // ===== 第五步：用 marked 解析纯文本 =====
    let html = marked.parse(pureText);

    // ===== 第六步：还原占位符为 span，转义反斜杠 =====
    placeholders.forEach(p => {
        const escaped = p.content.replace(/\\/g, '&#92;');
        let span;
        if (p.isDisplay) {
            span = '<span class="math-tex">\\[' + escaped + '\\]</span>';
        } else {
            span = '<span class="math-tex">\\(' + escaped + '\\)</span>';
        }
        html = html.replace(p.ph, span);
    });

    // ===== 第七步：后处理，保护残留的 \( 和 \[ =====
    html = html.replace(/\\\(/g, '&#92;(')
               .replace(/\\\)/g, '&#92;)')
               .replace(/\\\[/g, '&#92;[')
               .replace(/\\\]/g, '&#92;]');

    return html;
}

// ========== 以下为应用逻辑（不变） ==========
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
});marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// ========== 强化修复：移除所有 INLINE/BLOCK 等干扰标记 ==========
function fixAIErrors(text) {
    // 先移除所有 INLINE 和 BLOCK 单词（不区分大小写，并处理前后空格）
    let cleaned = text.replace(/\b(INLINE|BLOCK)\b/gi, '');
    // 移除 $ 符号前后的多余空格（如 "$ ... $" 变为 "$...$"）
    cleaned = cleaned.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');
    // 其余常规修复
    return cleaned
        .replace(/\\JBLOCK/g, '\\]')
        .replace(/IJBLOCK/g, '\\]')
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\text\{/g, '\\text{')
        .replace(/\\boxed\{/g, '\\boxed{')
        .replace(/\\operatomame/g, '\\operatorname')
        .replace(/\\text{dots}/g, '\\dots')
        .replace(/\\text{overline}/g, '\\overline')
        .replace(/\\text{ le }/g, '\\le ')
        .replace(/\\text{ *le *}/g, '\\le ')
        .replace(/\\{/g, '\\{')
        .replace(/\\}/g, '\\}')
        .replace(/\\dots,/g, '\\dots,')
        .replace(/\\end\{([^}]*)\\end\{\1\}/g, '\\end{$1}')
        .replace(/\\begin\{([^}]*)\}([\s\S]*?)(?=\\end|$)/g, (match, env, content) => {
            if (!match.includes('\\end{' + env + '}')) {
                return '\\begin{' + env + '}' + content + '\\end{' + env + '}';
            }
            return match;
        })
        .replace(/\\left\(/g, '\\left(')
        .replace(/\\right\)/g, '\\right)')
        .replace(/\\\\/g, '\\\\');
}

function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

function prepareMathContent(text) {
    let raw = fixAIErrors(text);
    const placeholders = [];
    let idx = 0;

    // ===== 第一步：提取所有 \begin...\end 环境（块级） =====
    const beginEndRegex = /\\begin\{([^}]*)\}([\s\S]*?)\\end\{\1\}/g;
    raw = raw.replace(beginEndRegex, (match, env, content) => {
        const ph = '@@MATH_BLOCK_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: true });
        return ph;
    });

    // ===== 第二步：提取 $$...$$ 和 \[...\] 和 [...]（含 LaTeX） =====
    const blockRegex = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\[([^\]]*?)\]/g;
    raw = raw.replace(blockRegex, (match, d1, d2, bracket) => {
        let content = d1 || d2 || bracket;
        if (!content || !content.trim()) return match;
        // 如果匹配的是未转义的 [...] 但不含 LaTeX，则保留
        if (match.startsWith('[') && !hasLatex(content)) return match;
        const ph = '@@MATH_BLOCK_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: true });
        return ph;
    });

    // ===== 第三步：提取 \(...\) 和 $...$ 行内 =====
    // 注意：$...$ 可能包含多个，使用非贪婪匹配
    const inlineRegex = /\\\(([\s\S]*?)\\\)|\$([^\$]*?)\$/g;
    raw = raw.replace(inlineRegex, (match, i1, i2) => {
        let content = i1 || i2;
        if (!content || !content.trim()) return match;
        const ph = '@@MATH_INLINE_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, isDisplay: false });
        return ph;
    });

    // ===== 第四步：处理裸 LaTeX（未被以上规则覆盖） =====
    const parts = raw.split(/(@@MATH_(BLOCK|INLINE)_\d+@@)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('@@MATH_')) return part;
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n') || /\\begin/.test(part);
            const ph = (isDisplay ? '@@MATH_BLOCK_' : '@@MATH_INLINE_') + (idx++) + '@@';
            placeholders.push({ ph, content: part, isDisplay });
            return ph;
        }
        return part;
    });
    const pureText = finalParts.join('');

    // ===== 第五步：用 marked 解析纯文本 =====
    let html = marked.parse(pureText);

    // ===== 第六步：还原占位符为 span，转义反斜杠 =====
    placeholders.forEach(p => {
        const escaped = p.content.replace(/\\/g, '&#92;');
        let span;
        if (p.isDisplay) {
            span = '<span class="math-tex">\\[' + escaped + '\\]</span>';
        } else {
            span = '<span class="math-tex">\\(' + escaped + '\\)</span>';
        }
        html = html.replace(p.ph, span);
    });

    // ===== 第七步：后处理，保护残留的 \( 和 \[ =====
    html = html.replace(/\\\(/g, '&#92;(')
               .replace(/\\\)/g, '&#92;)')
               .replace(/\\\[/g, '&#92;[')
               .replace(/\\\]/g, '&#92;]');

    return html;
}

// ========== 以下为应用逻辑（不变） ==========
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
