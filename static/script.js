let sessions = [];
let currentId = null;

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

// ======================
// 🚀 打字机核心函数
// ======================
function typeWriter(element, text, speed = 15) {
    let i = 0;
    element.innerText = "";

    function typing() {
        if (i < text.length) {
            element.innerText += text[i];
            i++;
            setTimeout(typing, speed);
        }
    }

    typing();
}

// ======================
// 发送（改成打字机效果）
// ======================
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });

    renderChat();

    fetch("/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
    })
    .then(res => res.json())
    .then(data => {

        const aiText = data.text;

        const msgDiv = document.createElement("div");
        msgDiv.className = "msg ai";
        document.getElementById("chat").appendChild(msgDiv);

        // ⭐ 打字机效果
        typeWriter(msgDiv, aiText, 10);

        s.messages.push({ role: "ai", text: aiText });

        renderInfo();

        // ⭐ MathJax 渲染（不破坏你的公式）
        setTimeout(() => {
            if (window.MathJax) {
                MathJax.typeset();
            }
        }, 200);
    });
}

// 回车发送
document.getElementById("text").addEventListener("keydown", function(e){
    if (e.key === "Enter") {
        e.preventDefault();
        send();
    }
});

// ======================
// 渲染聊天（保持不动）
// ======================
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

// ======================
// 会话列表（完全不动）
// ======================
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

// ======================
function renderInfo() {
    const s = getCurrent();
    if (!s) return;

    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

newChat();
