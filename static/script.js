let sessions = [];
let currentId = null;

// =====================
// 新建对话
// =====================
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

// =====================
// 获取当前会话
// =====================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =====================
// 发送消息（流式）
// =====================
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });

    renderChat();

    fetch("/chat_stream?text=" + encodeURIComponent(text))
        .then(response => {

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let aiText = "";

            const aiMsg = { role: "ai", text: "" };
            s.messages.push(aiMsg);

            function read() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        renderInfo();
                        return;
                    }

                    aiText += decoder.decode(value);
                    aiMsg.text = aiText;

                    renderChat();
                    read();
                });
            }

            read();
        });
}

// =====================
// 回车发送
// =====================
document.getElementById("text").addEventListener("keydown", function(e){
    if (e.key === "Enter") {
        e.preventDefault();
        send();
    }
});

// =====================
// 渲染聊天
// =====================
function renderChat() {

    const chat = document.getElementById("chat");
    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) return;

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");
        div.innerHTML = m.text;   // ⭐支持MathJax
        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    // ⭐ 关键：MathJax重新渲染
    if (window.MathJax) {
        MathJax.typesetPromise();
    }
}

// =====================
// 会话列表（可改名）
// =====================
function renderSessions() {

    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {

        const div = document.createElement("div");
        div.className = "session";
        div.innerText = s.name;

        div.onclick = () => {
            currentId = s.id;
            renderChat();
            renderInfo();
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
        del.innerText = "×";

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

// =====================
// 信息栏
// =====================
function renderInfo() {
    const s = getCurrent();
    if (!s) return;

    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// =====================
// 总刷新
// =====================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// =====================
// 初始化
// =====================
newChat();
