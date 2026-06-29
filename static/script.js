marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// ===================== 状态
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingText = "";
let typingSessionId = null;

// ===================== 当前会话
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// ===================== 输入控制
function enableInput(v) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    if (input) {
        input.disabled = !v;
        input.placeholder = v ? "输入消息…" : "等待回复…";
    }
    if (btn) btn.disabled = !v;
}

// ===================== ⭐只停止AI，不动UI（关键修复）
function stopTyping() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }
    typingText = "";
    typingSessionId = null;
}

// ===================== 渲染消息
function renderMessage(el, text) {
    el.innerHTML = marked.parse(text || "");
    if (window.MathJax) {
        MathJax.typesetPromise([el]).catch(() => {});
    }
}

// ===================== 新对话
function newChat() {
    stopTyping();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });

    currentId = id;

    renderAll();
    enableInput(true);
}

// ===================== 发送（⭐关键：input只在这里清空）
function send() {
    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();
    s.messages.push({ role: "user", text });

    renderChat();

    input.value = ""; // ⭐只在这里清

    enableInput(false);

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: s.messages.map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.text
            }))
        })
    })
    .then(r => r.json())
    .then(d => startTyping(d.reply || "（无回复）"))
    .catch(err => startTyping("❌ 请求失败: " + err.message));
}

// ===================== typing（只管当前AI，不重绘全局）
function startTyping(text) {
    stopTyping();

    typingText = text;
    typingSessionId = currentId;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < typingText.length) {
            div.innerText += typingText[i++];
        } else {
            clearInterval(typingTimer);
            typingTimer = null;

            renderMessage(div, typingText);

            const s = getCurrent();
            if (s) s.messages.push({ role: "ai", text: typingText });

            typingSessionId = null;

            renderInfo();
            enableInput(true);
        }
    }, 12);
}

// ===================== 渲染聊天（不会影响input！）
function renderChat() {
    stopTyping();

    const chat = document.getElementById("chat");
    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话，请新建</div>';
        return;
    }

    for (const m of s.messages) {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            renderMessage(div, m.text);
        }

        chat.appendChild(div);
    }

    chat.scrollTop = chat.scrollHeight;
}

// ===================== 右侧信息栏
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    if (!info) return;

    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// ===================== 会话列表
function renderSessions() {
    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = s.name;

        span.onclick = () => {
            stopTyping();
            currentId = s.id;
            renderChat();
            renderInfo();
            enableInput(true);
        };

        span.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name && name.trim()) {
                s.name = name.trim();
                renderSessions();
                renderInfo();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

            stopTyping();

            sessions = sessions.filter(x => x.id !== s.id);

            if (currentId === s.id) {
                currentId = sessions.length ? sessions[0].id : null;
            }

            renderAll();
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

// ===================== 全局渲染
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ===================== 初始化
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !input.disabled) {
            e.preventDefault();
            send();
        }
    });

    newChat();
    enableInput(true);
});
