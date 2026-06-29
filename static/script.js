marked.setOptions({
    gfm: true,
    breaks: true
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
function stopTyping() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }

    if (typingSessionId) {
        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingText });
    }

    typingSessionId = null;
    enableInput(true);
}

// =====================
function newChat() {
    stopTyping();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });

    currentId = id;

    renderSessions();
    renderChat();
    renderInfo();
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
    .then(d => startTyping(d.reply || ""))
    .catch(e => startTyping("请求失败：" + e.message));
}

// =====================
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
        if (i < text.length) {
            div.innerText += text[i++];
        } else {
            stopTyping();
            renderChat(); // ⭐关键：一次性渲染
        }
    }, 10);
}

// =====================
function renderChat() {
    const chat = document.getElementById("chat");

    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) return;

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");
        div.innerText = m.text;
        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
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
            renderChat();
            renderInfo();
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

            renderSessions();
            renderChat();
            renderInfo();
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

    if (!info) return;

    if (!s) {
        info.innerText = "无会话";
        return;
    }

    info.innerText = `名称: ${s.name}\n消息数: ${s.messages.length}`;
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
});
