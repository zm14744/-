let sessions = [];
let currentId = null;

// =========================
// 新对话
// =========================
function newChat() {
    const id = Date.now();

    sessions.push({
        id,
        name: "新对话",
        messages: []
    });

    currentId = id;
    renderAll();
}

// =========================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =========================
// 发送（真流式核心）
// =========================
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    // 用户消息
    s.messages.push({ role: "user", text });

    // AI占位
    const aiMsg = { role: "ai", text: "" };
    s.messages.push(aiMsg);

    renderChat();

    // =========================
    // 真流式读取
    // =========================
    fetch("/chat_stream?text=" + encodeURIComponent(text))
        .then(res => {

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            function read() {
                return reader.read().then(({ done, value }) => {

                    if (done) return;

                    aiMsg.text += decoder.decode(value);

                    renderChat();

                    return read();
                });
            }

            return read();
        });
}

// =========================
// 渲染聊天
// =========================
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

// =========================
// 全局刷新
// =========================
function renderAll() {
    renderChat();
}

// =========================
newChat();
