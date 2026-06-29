marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

let sessions = [];
let currentId = null;

let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingSessionId = null;

// ================= 基础 =================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(enable) {
    document.getElementById("text").disabled = !enable;
}

// ================= Markdown =================
function renderContent(text) {
    return `<div class="ai-content">${marked.parse(text)}</div>`;
}

// ================= 新建 =================
function newChat() {
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
}

// ================= 发送 =================
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
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            messages: s.messages.map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.text
            }))
        })
    })
    .then(r => r.json())
    .then(d => startTyping(d.reply || "", s))
    .catch(e => startTyping("请求失败：" + e.message, s));
}

// ================= 打字 =================
function startTyping(text, session) {
    typingFullText = text;
    typingSessionId = session.id;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";

    // ⭐关键：允许选中文本（解决“不能复制”核心问题）
    div.style.userSelect = "text";

    chat.appendChild(div);
    typingDiv = div;

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < text.length) {
            typingDiv.innerText += text[i++];
        } else {
            clearInterval(typingTimer);
            finish();
        }
    }, 10);

    function finish() {
        typingDiv.innerHTML = renderContent(text);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        enableInput(true);

        if (window.MathJax) {
            MathJax.typesetPromise([document.getElementById("chat")]);
        }
    }
}

// ================= 强制刷新 =================
function forceCompleteTyping() {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv) {
        typingDiv.innerHTML = renderContent(typingFullText);
        typingDiv = null;
        enableInput(true);
    }
}

// ================= 渲染聊天 =================
function renderChat() {
    const chat = document.getElementById("chat");
    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话</div>';
        return;
    }

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        // ⭐关键：允许复制
        div.style.userSelect = "text";

        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            div.innerHTML = renderContent(m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([chat]);
    }
}

// ================= sessions（不动删除按钮） =================
function renderSessions() {
    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = s.name;

        span.onclick = () => {
            currentId = s.id;
            renderAll();
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();
            sessions = sessions.filter(x => x.id !== s.id);
            renderAll();
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

// ================= info =================
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();
    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// ================= 全渲染 =================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ================= ⭐ Enter发送（修复点） =================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    newChat();
    enableInput(true);
});
