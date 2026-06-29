const chat = document.getElementById("chat");
// ✅ 正确获取文本框（HTML 中 id="text"）
const input = document.getElementById("text");

let messages = [];

// 打字机状态
let typingTimer = null;
let typingText = "";
let typingIndex = 0;
let typingDiv = null;

const SPEED = 20;

// =====================
// 发送（点击按钮调用）
// =====================
async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    addMessage("user", text);
    messages.push({ role: "user", content: text });

    stopTyping();

    const res = await fetch("/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ messages })
    });

    const data = await res.json();
    const reply = data.reply;

    messages.push({ role: "assistant", content: reply });

    typeWriter(reply);
}

// =====================
// 回车发送（Shift+Enter 换行）
// =====================
input.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

// =====================
// 添加消息
// =====================
function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// =====================
// 停止打字机
// =====================
function stopTyping() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }
}

// =====================
// 打字机（最终版）
// =====================
function typeWriter(text) {
    typingText = text;
    typingIndex = 0;

    typingDiv = document.createElement("div");
    typingDiv.className = "msg bot";
    chat.appendChild(typingDiv);

    stopTyping();

    typingTimer = setInterval(() => {
        typingIndex++;
        const current = typingText.slice(0, typingIndex);

        // 防止未闭合代码块破坏 DOM
        let safeText = current;
        const codeBlockCount = (current.match(/```/g) || []).length;
        if (codeBlockCount % 2 !== 0) {
            safeText += "\n```";
        }

        try {
            typingDiv.innerHTML = marked.parse(safeText);
        } catch {
            typingDiv.innerText = current;
        }

        chat.scrollTop = chat.scrollHeight;

        // 完成
        if (typingIndex >= typingText.length) {
            stopTyping();
            typingDiv.innerHTML = marked.parse(typingText);
            // ✅ 只在最终渲染时调用 MathJax，可复制且不卡顿
            if (window.MathJax) {
                MathJax.typesetPromise([typingDiv]).catch(()=>{});
            }
        }
    }, SPEED);
}
