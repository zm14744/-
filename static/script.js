marked.setOptions({ gfm: true, breaks: true });

// ===== 修复 AI 常见拼写/格式错误 =====
function fixAIErrors(text) {
    return text
        .replace(/\\JBLOCK/g, '$$')
        .replace(/IJBLOCK/g, '$$')
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\text\{/g, '\\text{')
        .replace(/\\boxed\{/g, '\\boxed{')
        .replace(/\\operatomame/g, '\\operatorname')
        .replace(/\\text{dots}/g, '\\dots')
        .replace(/\\text{overline}/g, '\\overline')
        .replace(/\\text{ le }/g, '\\le ')
        .replace(/\\text{ *le *}/g, '\\le ')
        .replace(/\\end\{([^}]*)\\end\{\1\}/g, '\\end{$1}')
        .replace(/\bINLINE\b/g, '')
        .replace(/\bBLOCK\b/g, '')
        .replace(/\$\$([\s\S]*?)\$\$/g, '\\\[$1\\\]')
        .replace(/\$([^\$]*?)\$/g, '\\\($1\\\)');
}

// ===== 判断文本中是否包含 LaTeX 命令 =====
function hasLatex(text) {
    return /\\[a-zA-Z(){}]|\\begin|\\end|\^|_|~/.test(text);
}

// ===== 占位符替换逻辑：保护 LaTeX 不被 Markdown 转义 =====
function prepareMathContent(text) {
    let processed = fixAIErrors(text);
    let placeholders = [];
    let counter = 0;

    // 1. 提取块级公式 \[ ... \]
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
        let placeholder = `__MATH_BLOCK_${counter++}__`;
        placeholders.push({ type: 'block', content: content, placeholder: placeholder });
        return placeholder;
    });

    // 2. 提取行内公式 \( ... \)
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
        let placeholder = `__MATH_INLINE_${counter++}__`;
        placeholders.push({ type: 'inline', content: content, placeholder: placeholder });
        return placeholder;
    });

    // 3. 兼容 AI 常犯的 [ ... ] 块级错误
    processed = processed.replace(/\[([\s\S]*?)\]/g, (match, content) => {
        if (hasLatex(content) && !match.includes('<span class="math-tex">')) {
            let placeholder = `__MATH_BLOCK_${counter++}__`;
            placeholders.push({ type: 'block', content: content, placeholder: placeholder });
            return placeholder;
        }
        return match;
    });

    // 4. 兼容 AI 常犯的 ( ... ) 行内错误
    processed = processed.replace(/\(((?:[^()]|\([^()]*\))*)\)/g, (match, content) => {
        if (hasLatex(content) && !match.includes('<span class="math-tex">')) {
            let placeholder = `__MATH_INLINE_${counter++}__`;
            placeholders.push({ type: 'inline', content: content, placeholder: placeholder });
            return placeholder;
        }
        return match;
    });

    // 5. 让 marked 正常解析 Markdown 结构
    let html = marked.parse(processed);

    // 6. 将占位符替换为原生的 <span> 标签，直接传给 MathJax 渲染
    placeholders.forEach(p => {
        let replacement;
        if (p.type === 'block') {
            replacement = `<span class="math-tex">\\[${p.content}\\]</span>`;
        } else {
            replacement = `<span class="math-tex">\\(${p.content}\\)</span>`;
        }
        // 使用替换所有匹配到的占位符
        html = html.replace(new RegExp(escapeRegex(p.placeholder), 'g'), replacement);
    });

    return html;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========== 聊天应用逻辑 ==========
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
    input.value = "";
    enableInput(false);

    // 【核心修复】：将整个历史记录 s.messages 传给后端，解决上下文丢失问题！
    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history: s.messages })
    })
    .then(async res => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const textContent = await res.text();
            throw new Error(`服务器返回了非 JSON 数据 (状态码 ${res.status})。\n请检查后端控制台日志及网关状态。内容片段: ${textContent.substring(0, 50)}...`);
        }
        return res.json();
    })
    .then(data => {
        const reply = data.reply || "（未收到回复）";
        startTyping(reply, s);
    })
    .catch(err => {
        console.error(err);
        startTyping("❌ 请求失败: " + err.message + "\n\n(提示：请检查 Flask 后台终端是否报错，或者 API 网络环境是否正常)", s);
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
