marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// =====================
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingText = "";
let typingDiv = null;

// =====================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =====================
function enableInput(v) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    input.disabled = !v;
    btn.disabled = !v;
}

// ===================== ❗只用于切换会话 / 新建
function hardReset() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }

    typingText = "";
    typingDiv = null;

    document.getElementById("chat").innerHTML = "";
}

// =====================
function renderMsg(el, text, isAI) {
    if (!isAI) {
        el.innerText = text;
        return;
    }

    el.innerHTML = marked.parse(text);

    if (window.MathJax) {
        MathJax.typesetPromise([el]).catch(() => {});
    }
}

// =====================
function newChat() {
    hardReset();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });

    currentId = id;

    renderAll();
    enableInput(true);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: s.messages.map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.text
            }))
        })
    })
    .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
    })
    .then(d => startTyping(d.reply || "（无回复）"))
    .catch(err => {
        startTyping("❌ 请求失败: " + err.message);
        enableInput(true);
    });
}

// ===================== ❗关键：不再 reset DOM
function startTyping(text) {
    const chat = document.getElementById("chat");

    typingText = text;

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    typingDiv = div;

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < typingText.length) {
            div.innerText += typingText[i++];
        } else {
            clearInterval(typingTimer);
            typingTimer = null;

            renderMsg(div, typingText, true);

            const s = getCurrent();
            if (s) s.messages.push({ role: "ai", text: typingText });

            typingDiv = null;

            renderInfo();
            enableInput(true);
        }
    }, 10);
}

// =====================
function renderChat() {
    hardReset();

    const chat = document.getElementById("chat");
    const s = getCurrent();

    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话</div>';
        return;
    }

    for (const m of s.messages) {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        renderMsg(div, m.text, m.role === "ai");

        chat.appendChild(div);
    }
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
function renderSessions() {
    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = s.name;

        span.onclick = () => {
            hardReset();
            currentId = s.id;
            renderChat();
            renderInfo();
            enableInput(true);
        };

        span.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name.trim();
                renderSessions();
                renderInfo();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

            hardReset();

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
    renderInfo();
}

// =====================
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
