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
// ⭐关键：统一终止流式
function stopTyping(force = false) {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    const chat = document.getElementById("chat");
    const last = chat?.lastElementChild;

    if (force && last) {
        last.innerHTML = marked.parse(typingText);

        if (window.MathJax) {
            MathJax.typesetPromise([last]).catch(()=>{});
        }
    }

    if (typingSessionId) {
        const s = sessions.find(x => x.id === typingSessionId);
        if (s) {
            s.messages.push({ role: "ai", text: typingText });
        }
    }

    typingSessionId = null;
    enableInput(true);
}

// =====================
function newChat() {
    stopTyping(true);

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
    .then(d => startTyping(d.reply || "", currentId))
    .catch(e => startTyping("❌ 请求失败：" + e.message, currentId));
}

// =====================
function startTyping(text, sessionId) {
    stopTyping(true);

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
// ⭐关键修复：不允许残留 + 不允许 return
function renderChat() {
    const chat = document.getElementById("chat");

    // ⭐关键：必须先停止流式
    stopTyping(true);

    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) {
        chat.innerHTML = "<div>暂无对话</div>";
        return;
    }

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            div.innerHTML = marked.parse(m.text);

            if (window.MathJax) {
                MathJax.typesetPromise([div]).catch(()=>{});
            }
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
}

// =====================
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    if (!info) return;

    if (!s) {
        info.innerText = "无会话";
        return;
    }

    info.innerText = `名称: ${s.name}\n消息数: ${s.messages.length}`;
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
            stopTyping(true);     // ⭐关键
            currentId = s.id;
            renderAll();
        };

        span.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name?.trim()) {
                s.name = name.trim();
                renderSessions();
                renderInfo();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

            stopTyping(true);   // ⭐关键

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
    renderInfo();   // ⭐关键保证
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
