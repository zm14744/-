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

// ================= 基础（不动） =================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    input.disabled = !enable;
    btn.disabled = !enable;
}

// ================= 清理（不动 LaTeX） =================
function cleanText(text) {
    return text.replace(/\b(INLINE|BLOCK)\b/gi, '').trim();
}

// ================= 渲染（只修排版，不改结构） =================
function renderContent(text) {
    return `<div class="ai-content">${marked.parse(cleanText(text))}</div>`;
}

// ================= 新建 =================
function newChat() {
    if (typingTimer) forceCompleteTyping();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;

    renderAll();
    enableInput(true);
}

// ================= 发送 =================
function send() {
    if (typingTimer) return;

    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();
    if (!s) return;

    s.messages.push({ role: "user", text });

    renderChat();
    renderInfo();

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
    .then(data => {
        startTyping(data.reply || "（未收到回复）", s);
    })
    .catch(err => {
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

// ================= 打字 =================
function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();

    typingFullText = text || "";
    typingSessionId = session.id;

    const chat = document.getElementById("chat");
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < typingFullText.length) {
            typingDiv.innerText += typingFullText[i++];
        } else {
            clearInterval(typingTimer);
            typingTimer = null;
            finish();
        }
    }, 10);

    function finish() {
        typingDiv.innerHTML = renderContent(typingFullText);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        renderInfo();
        enableInput(true);

        if (window.MathJax) MathJax.typesetPromise();
    }
}

// ================= 强制结束 =================
function forceCompleteTyping() {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv) {
        typingDiv.innerHTML = renderContent(typingFullText);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        renderInfo();
        enableInput(true);

        if (window.MathJax) MathJax.typesetPromise();
    }
}

// ================= 渲染聊天（核心修复） =================
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
            div.innerHTML = renderContent(m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([chat]);
    }
}

// ================= sessions（❗删除按钮完全不动） =================
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
            renderAll();
            enableInput(true);
        };

        span.ondblclick = () => {
            const newName = prompt("修改名称：", s.name);
            if (newName) {
                s.name = newName;
                renderSessions();
            }
        };

        // ❗这里完全不改（你的红色圆形按钮样式完全保留）
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

// ================= init =================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") send();
    });

    newChat();
    enableInput(true);
});
