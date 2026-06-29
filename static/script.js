const chat = document.getElementById("chat");
const input = document.getElementById("input");

let messages = [];

// 打字机状态
let typingTimer = null;
let typingText = "";
let typingIndex = 0;
let typingDiv = null;

const SPEED = 20;

// =====================
// 发送
// =====================
async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    addMessage("user", text);
    messages.push({ role: "user", content: text });

    // ❗ 防止重复打字机
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
// 用户消息
// =====================
function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// =====================
// 停止打字机（关键修复）
// =====================
function stopTyping() {
    if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
    }
}

// =====================
// 打字机（最终稳定版）
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

        // ❗ 核心修复：避免未闭合 markdown 破坏 DOM
        let safeText = current;

        // 临时防止代码块未闭合
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

        // =====================
        // 完成
        // =====================
        if (typingIndex >= typingText.length) {
            stopTyping();

            // 最终一次完整渲染（保证正确）
            typingDiv.innerHTML = marked.parse(typingText);

            // ❗ 只在最终渲染 MathJax
            if (window.MathJax) {
                MathJax.typesetPromise([typingDiv]).catch(()=>{});
            }
        }

    }, SPEED);
}
