marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// ===================== 数据
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingText = "";
let typingSessionId = null;

// ===================== 工具
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

// ===================== 停止打字
function stopTyping() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }

    if (typingSessionId) {
        const s = sessions.find(x => x.id === typingSessionId);
        if (s) {
            s.messages.push({ role: "ai", text: typingText });
        }
    }

    typingSessionId = null;
    typingText = "";
}

// ===================== Markdown + Math 渲染
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

// ===================== 发送
function send() {
    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();
    s.messages.push({ role: "user", text });

    renderChat();

    input.value = "";
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

// ===================== 打字效果
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
    }, 15);
}

// ===================== 渲染聊天
function renderChat() {
    stopTyping();

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
            renderMessage(div, m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
}

// ===================== 右侧信息栏（保持你原样结构）
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    if (!info) return;

    if (!s) {
        info.innerText = "无会话";
        return;
    }

    info.innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// ===================== 会话列表（不改删除按钮样式）
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
            renderAll();
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
    setTimeout(() => enableInput(true), 100);
});
