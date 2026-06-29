marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

let sessions = [];
let currentId = null;

let typingTimer = null;
let typingFullText = "";
let typingCurrentText = "";
let typingDiv = null;
let typingSessionId = null;

function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");
    input.disabled = !enable;
    btn.disabled = !enable;
}

// ================= 新对话 =================
function newChat() {
    if (typingTimer) forceCompleteTyping();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;

    renderAll();
}

// ================= 发送 =================
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
    if (typingTimer) forceCompleteTyping();

    typingFullText = text;
    typingCurrentText = "";
    typingSessionId = session.id;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";
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
        typingDiv.innerHTML = `<div class="ai-content">${marked.parse(text)}</div>`;

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text });

        typingDiv = null;
        typingSessionId = null;

        renderAll();
        enableInput(true);

        if (window.MathJax) MathJax.typesetPromise();
    }
}

// ================= 强制完成 =================
function forceCompleteTyping() {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv) {
        typingDiv.innerHTML = `<div class="ai-content">${marked.parse(typingFullText)}</div>`;

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderAll();
        enableInput(true);

        if (window.MathJax) MathJax.typesetPromise();
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

        div.innerHTML = m.role === "user"
            ? m.text
            : `<div class="ai-content">${marked.parse(m.text)}</div>`;

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([chat]);
    }
}

// ================= sessions（全部功能恢复） =================
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
        };

        span.ondblclick = () => {
            if (typingTimer) forceCompleteTyping();
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name;
                renderSessions();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();
            if (typingTimer) forceCompleteTyping();

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

// ================= info =================
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// ================= 全刷新 =================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ================= Enter发送 =================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    newChat();
    enableInput(true);
});
