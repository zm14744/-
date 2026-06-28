// 配置 marked
marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// 自动补全缺失的 $ 分隔符
function ensureMathDelimiters(text) {
    // 如果已经包含 $ 或 $$，跳过预处理
    if (/\$/.test(text)) return text;
    // 检测常见的 LaTeX 命令或环境
    const hasLatex = /\\[a-zA-Z]|\\begin|\\end/.test(text);
    if (hasLatex) {
        // 如果是多行，用 $$...$$，否则用 $...$
        if (text.includes('\n')) {
            return '$$' + text + '$$';
        } else {
            return '$' + text + '$';
        }
    }
    return text;
}

let sessions = [];
let currentId = null;
let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingCurrentText = "";
let typingSessionId = null;
const TYPING_SPEED = 15;

function getCurrent() { return sessions.find(s => s.id === currentId); }

function newChat() {
    if (typingTimer) forceCompleteTyping();
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
    enableInput(true);
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");
    input.disabled = !enable;
    btn.disabled = !enable;
    if (enable) input.focus();
}

function send() {
    if (typingTimer) return;
    const input = document.getElementById("text");
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

function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();
    typingFullText = text;
    typingCurrentText = "";
    typingSessionId = session.id;
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;
    typingTimer = setInterval(() => {
        if (typingCurrentText.length < typingFullText.length) {
            typingCurrentText += typingFullText[typingCurrentText.length];
            typingDiv.innerText = typingCurrentText;
            chat.scrollTop = chat.scrollHeight;
        } else {
            clearInterval(typingTimer);
            typingTimer = null;
            // 预处理补充分隔符
            let processed = typingFullText;
            if (!/\$/.test(processed)) {
                processed = ensureMathDelimiters(processed);
            }
            try {
                typingDiv.innerHTML = marked.parse(processed);
            } catch(e) {
                typingDiv.innerText = typingFullText;
            }
            const s = sessions.find(s => s.id === typingSessionId);
            if (s) {
                s.messages.push({ role: "ai", text: typingFullText }); // 保存原始文本
            }
            typingDiv = null;
            typingSessionId = null;
            renderChat();
            renderInfo();
            enableInput(true);
        }
    }, TYPING_SPEED);
}

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
        } catch(e) {
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

function renderChat() {
    const chat = document.getElementById("chat");
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
            // 如果内容没有 $，尝试自动补充分隔符
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

    // 强制对整个聊天容器进行公式渲染
    if (window.MathJax) {
        MathJax.typesetPromise([chat]).catch(console.error);
    }

    chat.scrollTop = chat.scrollHeight;
}

function renderSessions() {
    const box = document.getElementById("sessions");
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

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (!sessions.some(s => s.id === currentId)) {
        currentId = sessions.length > 0 ? sessions[0].id : null;
    }
    renderAll();
    if (sessions.length === 0) {
        enableInput(false);
        document.getElementById("text").placeholder = "请新建对话";
    } else {
        enableInput(true);
    }
}

function renderInfo() {
    const s = getCurrent();
    document.getElementById("info").innerText = s ? `名称: ${s.name}\n消息数: ${s.messages.length}` : "无会话";
}

function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");
    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey && !input.disabled) {
            e.preventDefault();
            send();
        }
    });
    newChat();
});
