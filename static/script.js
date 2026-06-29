marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

let sessions = [];
let currentId = null;

let typingTimer = null;
let typingText = "";
let typingSessionId = null;

// =====================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =====================
function enableInput(v) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    if (input) input.disabled = !v;
    if (btn) btn.disabled = !v;
}

// =====================
// 安全渲染（MathJax稳定版）
function renderHTML(el, text) {
    el.innerHTML = marked.parse(text);

    if (window.MathJax) {
        MathJax.typesetPromise([el]).catch(() => {});
    }
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
    .then(async r => {
        const ct = r.headers.get("content-type") || "";

        // ⭐关键：防 HTML 崩溃
        if (!ct.includes("application/json")) {
            const t = await r.text();
            throw new Error("后端未返回JSON：" + t.slice(0, 80));
        }

        return r.json();
    })
    .then(d => {
        startTyping(d.reply || "（空回复）", currentId);
    })
    .catch(err => {
        startTyping("❌ 请求失败：" + err.message, currentId);
    });
}

// =====================
function startTyping(text, sessionId) {
    stopTyping();

    typingText = text;
    typingSessionId = sessionId;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < text.length) {
            div.innerText += text[i++];
        } else {
            stopTyping(true);
        }
    }, 10);
}

// =====================
function stopTyping(force = false) {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    const chat = document.getElementById("chat");
    const last = chat.lastElementChild;

    if (force && last) {
        renderHTML(last, typingText);
    }

    if (typingSessionId) {
        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingText });
    }

    typingSessionId = null;
    enableInput(true);
}

// =====================
function renderChat() {
    const chat = document.getElementById("chat");

    if (typingTimer) return;

    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) return;

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            renderHTML(div, m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
}

// =====================
// ⭐修复：右侧信息栏消失问题
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    if (!info) return;

    if (!s) {
        info.innerText = "无会话";
        return;
    }

    info.innerText =
        `名称: ${s.name}\n消息数: ${s.messages.length}`;
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

        span.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name?.trim()) {
                s.name = name.trim();
                renderSessions();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

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

// =====================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();   // ⭐关键修复
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
