marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

let sessions = [];
let currentId = null;

// ⭐关键：防止删除时打断输出
let typingTimer = null;
let typingSessionId = null;
let typingFullText = "";
let typingDiv = null;

// =====================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(v) {
    document.getElementById("text").disabled = !v;
}

// =====================
// ⭐核心：可复制渲染（文本真实存在）
function renderContent(text) {
    return `
        <div class="ai-content">
            <div class="text-layer">${marked.parse(text)}</div>
        </div>
    `;
}

// =====================
function newChat() {
    stopTyping();
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
}

// =====================
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
    .then(d => startTyping(d.reply || "", s.id))
    .catch(e => startTyping("请求失败：" + e.message, s.id));
}

// =====================
// ⭐关键修复：删除 session 不影响正在输出
function startTyping(text, sessionId) {
    stopTyping();

    typingFullText = text;
    typingSessionId = sessionId;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";

    // ⭐关键：允许选中
    div.style.userSelect = "text";

    chat.appendChild(div);
    typingDiv = div;

    let i = 0;

    typingTimer = setInterval(() => {
        if (!typingDiv) return;

        if (i < text.length) {
            typingDiv.innerText += text[i++];
        } else {
            stopTyping(true);
        }
    }, 10);
}

// =====================
function stopTyping(forceFinish = false) {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv && forceFinish) {
        typingDiv.innerHTML = renderContent(typingFullText);
    }

    if (typingDiv && typingSessionId) {
        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });
    }

    typingDiv = null;
    typingSessionId = null;

    enableInput(true);
}

// =====================
function renderChat() {
    const chat = document.getElementById("chat");

    // ⭐关键修复：如果正在打字，不清空
    if (typingTimer) return;

    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话</div>';
        return;
    }

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

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

// =====================
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

            // ⭐关键：如果删的是当前对话 → 停止输出
            if (s.id === typingSessionId) {
                stopTyping(true);
            }

            sessions = sessions.filter(x => x.id !== s.id);

            renderAll();
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

// =====================
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// =====================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// =====================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            send();
        }
    });

    newChat();
    enableInput(true);
});
