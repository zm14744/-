marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// ========= 只做轻微清洗，不碰 \ =========
function cleanText(text) {
    return text
        .replace(/\b(INLINE|BLOCK)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/Icdot/g, '\\cdot')
        .replace(/Itimes/g, '\\times')
        .replace(/\\operatomame/g, '\\operatorname');
}

// ========= 核心：不再破坏 LaTeX =========
function prepareMathContent(text) {
    const processed = cleanText(text);

    // 直接交给 marked，不做任何 LaTeX 包装
    let html = marked.parse(processed);

    return html;
}

// ================= 状态 =================
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingCurrentText = "";
let typingSessionId = null;

const TYPING_SPEED = 15;

// ================= 工具 =================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    if (input) {
        input.disabled = !enable;
        input.placeholder = enable ? "输入消息…" : "等待回复…";
        if (enable) input.focus();
    }
    if (btn) btn.disabled = !enable;
}

// ================= 新建对话 =================
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
    s.messages.push({ role: "user", text });

    renderChat();
    renderInfo();

    input.value = "";
    enableInput(false);

    const history = s.messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
    }));

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
    })
    .then(res => res.json())
    .then(data => {
        const reply = data.reply || "（未收到回复）";
        startTyping(reply, s);
    })
    .catch(err => {
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

// ================= 打字效果 =================
function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();

    typingFullText = text || "";
    typingCurrentText = "";
    typingSessionId = session.id;

    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;

    if (!typingFullText) {
        finish();
        return;
    }

    typingTimer = setInterval(() => {
        if (typingCurrentText.length < typingFullText.length) {
            typingCurrentText += typingFullText[typingCurrentText.length];
            typingDiv.innerText = typingCurrentText;
        } else {
            clearInterval(typingTimer);
            typingTimer = null;
            finish();
        }
    }, TYPING_SPEED);

    function finish() {
        // ⭐ 关键：这里才做 Markdown + MathJax
        typingDiv.innerHTML = prepareMathContent(typingFullText);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        renderInfo();
        enableInput(true);

        if (window.MathJax) {
            MathJax.typesetPromise();
        }
    }
}

function forceCompleteTyping() {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv) {
        typingDiv.innerHTML = prepareMathContent(typingFullText);

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

// ================= 渲染聊天 =================
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
            div.innerHTML = prepareMathContent(m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([chat]);
    }
}

// ================= 会话列表 =================
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

// ================= 总渲染 =================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ================= 初始化 =================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    newChat();
    setTimeout(() => enableInput(true), 100);
});
