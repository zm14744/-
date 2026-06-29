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

function enableInput(v) {
    document.getElementById("text").disabled = !v;
}

// =====================
// ⭐关键：统一渲染入口（防 MathJax 混乱）
function renderHTML(text) {
    return marked.parse(text);
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
function startTyping(text, sessionId) {
    stopTyping();

    typingText = text;
    typingSessionId = sessionId;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";

    chat.appendChild(div);

    typingTimer = setInterval(() => {
        if (div.innerText.length < text.length) {
            div.innerText += text[div.innerText.length];
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
        const html = renderHTML(typingText);
        last.innerHTML = html;

        // ⭐关键：MathJax只渲染最后一个节点
        MathJax.typesetPromise([last]);
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
    if (!s) {
        chat.innerHTML = '<div>暂无对话</div>';
        return;
    }

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        div.innerHTML = (m.role === "user")
            ? m.text
            : renderHTML(m.text);

        chat.appendChild(div);
    });

    // ⭐统一 MathJax 渲染
    MathJax.typesetPromise([chat]);
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

        // ⭐稳定双击改名
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
