marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// ===================== 状态
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingText = "";
let typingDiv = null;

// ===================== 当前会话
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// ===================== 输入控制
function enableInput(v) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    input.disabled = !v;
    btn.disabled = !v;
    input.placeholder = v ? "输入消息…" : "等待回复…";
}

// ===================== 🔥统一清理（关键）
function hardReset() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }

    typingText = "";

    const chat = document.getElementById("chat");
    chat.innerHTML = "";
}

// ===================== 渲染单条消息
function renderMsg(div, text, isAI) {
    if (!isAI) {
        div.innerText = text;
        return;
    }

    div.innerHTML = marked.parse(text);

    if (window.MathJax) {
        MathJax.typesetPromise([div]).catch(() => {});
    }
}

// ===================== 新对话（🔥修复关键点）
function newChat() {
    hardReset(); // ⭐必须

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

    input.value = ""; // ⭐只这里清

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
    .catch(e => startTyping("❌ " + e.message));
}

// ===================== 🔥 typing（唯一写DOM入口）
function startTyping(text) {
    hardReset(); // ⭐关键：彻底阻断旧渲染

    typingText = text;

    const chat = document.getElementById("chat");

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
    }, 12);
}

// ===================== 渲染聊天（纯历史）
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

// ===================== 信息栏
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    if (!info) return;

    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// ===================== 左侧列表
function renderSessions() {
    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = s.name;

        span.onclick = () => {
            hardReset(); // ⭐关键
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

// ===================== 全局
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ===================== init
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
