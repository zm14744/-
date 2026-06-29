marked.setOptions({ gfm: true, breaks: true, sanitize: false });

// 清理干扰标记和常见错误
function cleanText(text) {
    let cleaned = text.replace(/\b(INLINE|BLOCK)\b/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
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

function prepareMathContent(text) {
    let processed = cleanText(text);

    // ---- 1. 转义公式中的反斜杠为 HTML 实体（防止被浏览器或 marked 破坏） ----
    const escapeBS = s => s.replace(/\\/g, '&#92;');

    // ---- 2. 先处理块级公式：\[...\]、$$...$$、\begin...\end ----
    // 将 \[...\] 和 $$...$$ 替换为 <span class="math-tex">\[...\]</span>
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
        return '<span class="math-tex">\\[' + escapeBS(content) + '\\]</span>';
    });
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        return '<span class="math-tex">\\[' + escapeBS(content) + '\\]</span>';
    });
    // 处理 \begin{...}...\end{...}
    processed = processed.replace(/\\begin\{([^}]*)\}([\s\S]*?)\\end\{\1\}/g, (match, env, content) => {
        // 整个环境作为块级公式
        const full = match;
        return '<span class="math-tex">\\[' + escapeBS(full) + '\\]</span>';
    });

    // ---- 3. 处理未转义的 [...] 但包含 LaTeX 命令 ----
    processed = processed.replace(/\[([^\]]*?)\]/g, (match, content) => {
        if (/\\[a-zA-Z]/.test(content) && !match.includes('<span class="math-tex">')) {
            return '<span class="math-tex">\\[' + escapeBS(content) + '\\]</span>';
        }
        return match;
    });

    // ---- 4. 处理行内公式：\(...\)、$...$ ----
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
        return '<span class="math-tex">\\(' + escapeBS(content) + '\\)</span>';
    });
    processed = processed.replace(/\$([^\$]*?)\$/g, (match, content) => {
        // 避免匹配到 $$...$$ 残留（但已经处理过）
        return '<span class="math-tex">\\(' + escapeBS(content) + '\\)</span>';
    });

    // ---- 5. 处理裸 LaTeX 命令（未被任何包裹的） ----
    // 使用拆分法，只处理非 span 部分
    const parts = processed.split(/(<span class="math-tex">[\s\S]*?<\/span>)/g);
    const finalParts = parts.map(part => {
        if (part.startsWith('<span class="math-tex">')) return part;
        // 如果包含 LaTeX 命令且没有被 $ 或 \( 等包裹，则自动包裹为行内公式
        if (/\\[a-zA-Z]/.test(part) && !/\$/.test(part) && !/\\\(/.test(part) && !/\\\[/.test(part)) {
            // 判断是否为块级（含换行）
            const isDisplay = part.includes('\n');
            const escaped = escapeBS(part);
            if (isDisplay) {
                return '<span class="math-tex">\\[' + escaped + '\\]</span>';
            } else {
                return '<span class="math-tex">\\(' + escaped + '\\)</span>';
            }
        }
        return part;
    });
    processed = finalParts.join('');

    // ---- 6. 用 marked 解析（它会保留 HTML 标签） ----
    let html = marked.parse(processed);

    // ---- 7. 后处理：块级公式包裹 div 实现居中 ----
    html = html.replace(/<span class="math-tex">\\\[([\s\S]*?)\\\]<\/span>/g, (match, content) => {
        return '<div class="math-block" style="text-align:center; margin:14px 0; overflow-x:auto;">' +
               '<span class="math-tex">\\[' + content + '\\]</span></div>';
    });

    // ---- 8. 额外安全：将残留的 \( 和 \[ 转义（防止被浏览器识别为标签） ----
    html = html.replace(/\\\(/g, '&#92;(')
               .replace(/\\\)/g, '&#92;)')
               .replace(/\\\[/g, '&#92;[')
               .replace(/\\\]/g, '&#92;]');

    return html;
}

// ========== 应用逻辑（不变） ==========
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
