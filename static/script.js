let sessions = [];
let currentId = null;

// =========================
// 文本清洗（解决 #### / ** / \{ \} 问题）
// =========================
function formatText(text) {

    return text
        // Markdown标题 ####
        .replace(/#{1,6}\s?/g, "")

        // 加粗
        .replace(/\*\*/g, "")

        // 多余反斜杠（但保留 LaTeX 结构）
        .replace(/\\(?![a-zA-Z])/g, "")

        .replace(/\r/g, "");
}

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

function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =========================
// 发送（流式）
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });

    const aiMsg = { role: "ai", text: "" };
    s.messages.push(aiMsg);

    renderChat();

    fetch("/chat_stream?text=" + encodeURIComponent(text))
        .then(res => {

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            function read() {
                return reader.read().then(({ done, value }) => {

                    if (done) return;

                    aiMsg.text += decoder.decode(value);

                    renderChat();
                    renderInfo(); // ✅ 实时更新右侧

                    return read();
                });
            }

            return read();
        });
}

// =========================
// 回车发送
document.addEventListener("DOMContentLoaded", () => {

    const input = document.getElementById("text");

    input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            send();
        }
    });
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

        // ✅ 修复 Markdown + 保留 LaTeX
        div.innerText = formatText(m.text);

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    // MathJax 渲染
    if (window.MathJax) {
        MathJax.typeset();
    }
}

// =========================
// 左侧会话
function renderSessions() {

    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {

        const div = document.createElement("div");
        div.className = "session";
        div.innerText = s.name;

        div.onclick = () => {
            currentId = s.id;
            renderAll();
        };

        div.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name;
                renderSessions();
            }
        };

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
// 右侧信息（实时）
function renderInfo() {

    const s = getCurrent();
    const info = document.getElementById("info");

    if (!s || !info) return;

    info.innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// =========================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

newChat();
