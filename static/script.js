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
// 发送（真流式）
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
// 回车发送（关键修复）
document.addEventListener("DOMContentLoaded", () => {

    const input = document.getElementById("text");

    if (input) {
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                send();
            }
        });
    }
});

// =========================
// 渲染聊天
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
// 左侧会话列表（完整恢复）
function renderSessions() {

    const box = document.getElementById("sessions");
    if (!box) return;

    box.innerHTML = "";

    sessions.forEach(s => {

        const div = document.createElement("div");
        div.className = "session";
        div.innerText = s.name;

        // 切换会话
        div.onclick = () => {
            currentId = s.id;
            renderAll();
        };

        // 改名
        div.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name;
                renderSessions();
            }
        };

        // 删除
        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

            sessions = sessions.filter(x => x.id !== s.id);

            if (currentId === s.id) currentId = null;

            renderAll();
        };

        div.appendChild(del);
        box.appendChild(div);
    });
}

// =========================
// 右侧信息
function renderInfo() {

    const s = getCurrent();
    const info = document.getElementById("info");

    if (!s || !info) return;

    info.innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// =========================
// 全局刷新
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// =========================
newChat();
