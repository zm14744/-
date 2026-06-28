// ===== 配置 Marked =====
marked.setOptions({ gfm: true, breaks: true, sanitize: false });

function ensureMathDelimiters(text) {
    if (!text || typeof text !== 'string') return text;
    if (/\$/.test(text)) return text;
    const hasLatex = /\\[a-zA-Z]|\\begin|\\end/.test(text);
    if (!hasLatex) return text;
    return text.includes('\n') ? '$$' + text + '$$' : '$' + text + '$';
}

// ===== 全局状态 =====
let sessions = [];
let currentId = null;
let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingCurrentText = "";
let typingSessionId = null;
const TYPING_SPEED = 15;

// ===== 辅助 =====
function getCurrent() { return sessions.find(s => s.id === currentId); }

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");
    if (input) {
        input.disabled = !enable;
        if (enable) {
            input.focus();
            input.placeholder = "输入消息…";
        } else {
            input.placeholder = "等待回复…";
        }
        console.log('输入框 disabled =', input.disabled);
    } else {
        console.warn('输入框 #text 未找到');
    }
    if (btn) btn.disabled = !enable;
}

// ===== 新建会话 =====
function newChat() {
    if (typingTimer) forceCompleteTyping();
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
    enableInput(true);
}

// ===== 发送 =====
function send() {
    if (typingTimer) {
        console.log('打字中，禁止发送');
        return;
    }
    const input = document.getElementById("text");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();
    const s = getCurrent();
    s.messages.push({ role: "user", text });
    renderChat();
    renderInfo();
    input.value = "";
    enableInput(false);

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(res => {
        const reply = res.reply || "（未收到回复）";
        startTyping(reply, s);
    })
    .catch(err => {
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

// ===== 打字机 =====
function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();

    typingFullText = text || "";
    typingCurrentText = "";
    typingSessionId = session.id;
    const chat = document.getElementById("chat");
    if (!chat) {
        console.error('聊天容器不存在');
        enableInput(true);
        return;
    }

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;

    if (typingFullText.length === 0) {
        finish();
        return;
    }

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
        let processed = typingFullText;
        if (!/\$/.test(processed)) {
            processed = ensureMathDelimiters(processed);
        }
        try {
            typingDiv.innerHTML = marked.parse(processed);
        } catch (e) {
            typingDiv.innerText = typingFullText;
        }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) {
            s.messages.push({ role: "ai", text: typingFullText });
        }
        typingDiv = null;
        typingSessionId = null;
        renderChat();
        renderInfo();
        enableInput(true);
    }
}

// ===== 强制完成 =====
function forceCompleteTyping() {
    if (!typingTimer) return;
    clearInterval(typingTimer);
    typingTimer = null;
    if (typingDiv) {
        let processed = typingFullText;
        if (!/\$/.test(processed)) {
            processed = ensureMathDelimiters(processed);
        }
        try {
            typingDiv.innerHTML = marked.parse(processed);
        } catch (e) {
            typingDiv.innerText = typingFullText;
        }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) {
            s.messages.push({ role: "ai", text: typingFullText });
        }
        typingDiv = null;
        typingSessionId = null;
        renderChat();
        renderInfo();
        enableInput(true);
    }
}

// ===== 渲染聊天 =====
function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) return;
    chat.innerHTML = "";
    const s = getCurrent();
    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话，请新建</div>';
        return;
    }
    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");
        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            let content = m.text;
            if (!/\$/.test(content)) {
                content = ensureMathDelimiters(content);
            }
            try {
                div.innerHTML = marked.parse(content);
            } catch {
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
        MathJax.typesetPromise([chat]).catch(err => console.warn('MathJax error:', err));
    }
    chat.scrollTop = chat.scrollHeight;
}

// ===== 会话列表 =====
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
            renderChat();
            renderInfo();
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

// ===== 删除会话 =====
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

// ===== 右侧信息 =====
function renderInfo() {
    const info = document.getElementById("info");
    if (!info) return;
    const s = getCurrent();
    info.innerText = s ? `名称: ${s.name}\n消息数: ${s.messages.length}` : "无会话";
}

// ===== 全刷新 =====
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ===== 初始化 =====
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
    // 额外确保输入启用
    setTimeout(() => enableInput(true), 100);
});
