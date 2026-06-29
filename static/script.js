marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false,
    pedantic: false
});

// ===== 清理干扰标记 =====
function fixAIErrors(text) {
    // 移除所有 INLINE 和 BLOCK 单词（不区分大小写），并合并多余空格
    let cleaned = text.replace(/\b(INLINE|BLOCK)\b/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // 修复常见错误命令
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
        .replace(/\\end\{([^}]*)\\end\{\1\}/g, '\\end{$1}');
}

function hasLatex(text) {
    return /\\[a-zA-Z]+|\\begin|\\end|\^|_|~/.test(text);
}

function prepareMathContent(text) {
    let processed = fixAIErrors(text);
    const placeholders = [];
    let idx = 0;

    // ---- 1. 保护已有的 <span class="math-tex"> ----
    processed = processed.replace(/<span class="math-tex">([\s\S]*?)<\/span>/g, (match, content) => {
        const ph = '@@EXISTING_SPAN_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, type: 'existing' });
        return ph;
    });

    // ---- 2. 保护块级公式：\[...\]、$$...$$、\begin...\end ----
    const blockPatterns = [
        /\\\[([\s\S]*?)\\\]/g,
        /\$\$([\s\S]*?)\$\$/g,
        /\\begin\{([^}]*)\}([\s\S]*?)\\end\{\1\}/g
    ];
    blockPatterns.forEach(pattern => {
        processed = processed.replace(pattern, (match, ...args) => {
            const ph = '@@BLOCK_' + (idx++) + '@@';
            placeholders.push({ ph, content: match, type: 'display' });
            return ph;
        });
    });

    // ---- 3. 保护未转义的 [...] 但含 LaTeX ----
    processed = processed.replace(/\[([^\]]*?)\]/g, (match, content) => {
        if (hasLatex(content) && !match.includes('<span class="math-tex">')) {
            const ph = '@@BLOCK_' + (idx++) + '@@';
            placeholders.push({ ph, content: '\\[' + content + '\\]', type: 'display' });
            return ph;
        }
        return match;
    });

    // ---- 4. 保护行内公式：\(...\)、$...$ ----
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
        const ph = '@@INLINE_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, type: 'inline' });
        return ph;
    });
    processed = processed.replace(/\$([^\$]*?)\$/g, (match, content) => {
        const ph = '@@INLINE_' + (idx++) + '@@';
        placeholders.push({ ph, content: match, type: 'inline' });
        return ph;
    });

    // ---- 5. 处理裸 LaTeX（未被上述规则匹配的） ----
    const parts = processed.split(/(@@(EXISTING_SPAN|BLOCK|INLINE)_\d+@@)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('@@')) return part;
        if (hasLatex(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            const isDisplay = part.includes('\n') || /\\begin/.test(part);
            const ph = (isDisplay ? '@@BLOCK_' : '@@INLINE_') + (idx++) + '@@';
            if (isDisplay) {
                placeholders.push({ ph, content: '\\[' + part + '\\]', type: 'display' });
            } else {
                placeholders.push({ ph, content: '\\(' + part + '\\)', type: 'inline' });
            }
            return ph;
        }
        return part;
    });
    const pureText = finalParts.join('');

    // ---- 6. 用 marked 解析纯文本 ----
    let html = marked.parse(pureText);

    // ---- 7. 还原占位符为 <span class="math-tex"> ----
    placeholders.forEach(p => {
        let spanContent = p.content;
        if (p.type === 'existing') {
            html = html.replace(p.ph, spanContent);
            return;
        }
        if (p.type === 'display') {
            // 确保内容以 \[...\] 形式存在
            if (!/^\\\[/.test(spanContent) && !/^\$\$/.test(spanContent)) {
                spanContent = '\\[' + spanContent + '\\]';
            }
            // 将 $$...$$ 转换为 \[...\]
            if (/^\$\$/.test(spanContent) && /\$\$$/.test(spanContent)) {
                spanContent = spanContent.replace(/^\$\$/, '\\[').replace(/\$\$$/, '\\]');
            }
            const span = '<span class="math-tex">' + spanContent + '</span>';
            html = html.replace(p.ph, span);
        } else if (p.type === 'inline') {
            if (!/^\\\(/.test(spanContent) && !/^\$/.test(spanContent)) {
                spanContent = '\\(' + spanContent + '\\)';
            }
            if (/^\$/.test(spanContent) && /\$$/.test(spanContent)) {
                spanContent = spanContent.replace(/^\$/, '\\(').replace(/\$$/, '\\)');
            }
            const span = '<span class="math-tex">' + spanContent + '</span>';
            html = html.replace(p.ph, span);
        }
    });

    // ---- 8. 后处理：确保所有反斜杠被转义，避免被浏览器解析 ----
    html = html.replace(/\\\(/g, '&#92;(')
               .replace(/\\\)/g, '&#92;)')
               .replace(/\\\[/g, '&#92;[')
               .replace(/\\\]/g, '&#92;]');

    // ---- 9. 优化排版：为块级公式添加换行和居中样式 ----
    // 在 span 外部包裹 div，并添加样式（如果尚未包裹）
    html = html.replace(/<span class="math-tex">\\\[([\s\S]*?)\\\]<\/span>/g, (match, content) => {
        return '<div style="text-align:center; margin: 12px 0; overflow-x:auto;">' +
               '<span class="math-tex">\\[' + content + '\\]</span></div>';
    });

    return html;
}

// ========== 应用逻辑（完整保留） ==========
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

    const history = s.messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
    }));

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
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
