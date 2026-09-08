marked.setOptions({
    gfm: true,
    breaks: true
});

const STORAGE_KEY = "discrete_math_ai_sessions_v1";
const LEARNING_STORAGE_KEY = "discrete_math_ai_learning_v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_WRONG_QUESTIONS = 80;

let wrongBookFilter = "all";
let wrongBookSearch = "";
let wrongBookSort = "recent";
let currentWrongEditId = null;

let pendingWrongQuestionSelection = null;
const wrongSolutionExpandedIds = new Set();
const wrongSolutionLoadingIds = new Set();
const wrongSolutionQueue = [];
let wrongSolutionQueueBusy = false;

let knowledgeGraphData = null;
let knowledgeGraphFilter = "";
let knowledgeGraphViewMode = "focus";
let knowledgeGraphSelectedNodeId = "";
let knowledgeGraphLoading = false;

let sessions = [];
let currentId = null;
let learningState = createEmptyLearningState();

let typingTimer = null;
let typingFullText = "";
let typingDiv = null;
let typingSessionId = null;
let typingMeta = null;

let typingAutoFollow = true;
let preserveChatScrollOnce = null;

let requestBusy = false;


// -----------------------------
// 基础状态
// -----------------------------
function getCurrent() {
    return sessions.find(s => s.id === currentId) || null;
}

function makeSessionId() {
    let id = Date.now();

    while (sessions.some(s => s.id === id)) {
        id += 1;
    }

    return id;
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");

    if (input) input.disabled = !enable;
    if (sendBtn) sendBtn.disabled = !enable;
    if (imageBtn) imageBtn.disabled = !enable;
}

function setBusy(busy) {
    requestBusy = busy;

    if (busy) {
        enableInput(false);
    } else if (!typingTimer) {
        enableInput(true);
    }
}

function normalizeTeaching(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const asText = input => (
        typeof input === "string" ? input.trim() : ""
    );

    const asTextList = input => (
        Array.isArray(input)
            ? input
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
                .slice(0, 4)
            : []
    );

    return {
        category: asText(value.category) || "待识别",
        related_categories: asTextList(value.related_categories),
        knowledge_points: asTextList(value.knowledge_points),
        focus_points: asTextList(value.focus_points).slice(0, 2),
        prerequisite_points: asTextList(value.prerequisite_points),
        knowledge_path: asTextList(value.knowledge_path),
        question_type: asText(value.question_type) || "综合题",
        mode: asText(value.mode) || "hint",
        mode_label: asText(value.mode_label) || "提示引导",
        confidence: asText(value.confidence) || "低",
        input_source: asText(value.input_source) || "文本输入"
    };
}


function normalizeRetestSession(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const stage = [
        "generating",
        "awaiting_answer",
        "checking",
        "finished"
    ].includes(value.stage)
        ? value.stage
        : "finished";

    return {
        wrongQuestionId: typeof value.wrongQuestionId === "string"
            ? value.wrongQuestionId
            : "",
        stage,
        targetPoints: Array.isArray(value.targetPoints)
            ? value.targetPoints
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
                .slice(0, 2)
            : [],
        generatedQuestion: typeof value.generatedQuestion === "string"
            ? value.generatedQuestion.trim().slice(0, 3000)
            : "",
        startedAt: Number.isFinite(value.startedAt)
            ? value.startedAt
            : Date.now(),
        result: ["correct", "wrong", "unknown"].includes(value.result)
            ? value.result
            : ""
    };
}


function createEmptyLearningState() {
    return {
        version: 5,
        knowledge: {},
        events: [],
        wrongQuestions: []
    };
}

function normalizeLearningQuestion(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const text = typeof value.text === "string"
        ? value.text.trim()
        : "";

    if (!text) {
        return null;
    }

    const knowledgePoints = Array.isArray(value.knowledgePoints)
        ? value.knowledgePoints
            .filter(item => typeof item === "string" && item.trim())
            .map(item => item.trim())
            .slice(0, 4)
        : [];

    const focusPoints = Array.isArray(value.focusPoints)
        ? value.focusPoints
            .filter(item => typeof item === "string" && item.trim())
            .map(item => item.trim())
            .slice(0, 2)
        : [];

    return {
        text: text.slice(0, 3000),
        knowledgePoints,
        focusPoints,
        category: typeof value.category === "string"
            ? value.category.trim()
            : "",
        source: value.source === "ocr"
            ? "ocr"
            : (
                value.source === "ai"
                    ? "ai"
                    : "text"
            ),
        referenceAnswer: typeof value.referenceAnswer === "string"
            ? value.referenceAnswer.trim().slice(0, 1200)
            : "",
        sessionId: (
            typeof value.sessionId === "number"
            || typeof value.sessionId === "string"
        )
            ? value.sessionId
            : null,
        updatedAt: Number.isFinite(value.updatedAt)
            ? value.updatedAt
            : Date.now()
    };
}

function normalizeLearningState(value) {
    const state = createEmptyLearningState();

    if (!value || typeof value !== "object") {
        return state;
    }

    // v4 起学习统计改为“事件账本”。
    // v3 及更早只有总数，没有来源会话，无法在删除对话时准确回滚。
    // 因此升级时保留错题本，但旧的学习计数不继续继承。
    if (
        Number(value.version) >= 4
        && Array.isArray(value.events)
    ) {
        state.events = value.events
            .filter(event => event && typeof event === "object")
            .map(event => ({
                id: typeof event.id === "string" && event.id
                    ? event.id
                    : `learn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                sessionId: (
                    typeof event.sessionId === "number"
                    || typeof event.sessionId === "string"
                )
                    ? event.sessionId
                    : null,
                type: [
                    "seen",
                    "correct",
                    "wrong",
                    "support",
                    "reviewed"
                ].includes(event.type)
                    ? event.type
                    : "",
                points: Array.isArray(event.points)
                    ? [
                        ...new Set(
                            event.points
                                .filter(point => typeof point === "string" && point.trim())
                                .map(point => point.trim())
                        )
                    ].slice(0, 4)
                    : [],
                createdAt: Number.isFinite(event.createdAt)
                    ? event.createdAt
                    : Date.now()
            }))
            .filter(event => event.type && event.points.length)
            .slice(-1000);
    }

    if (Array.isArray(value.wrongQuestions)) {
        const normalizedWrong = value.wrongQuestions
            .filter(item => item && typeof item === "object")
            .map(item => {
                const question = typeof item.question === "string"
                    ? item.question.trim()
                    : "";

                if (!question) return null;

                return {
                    id: typeof item.id === "string" && item.id
                        ? item.id
                        : `wrong-${Date.now()}-${Math.random()}`,
                    question: question.slice(0, 3000),
                    knowledgePoints: Array.isArray(item.knowledgePoints)
                        ? item.knowledgePoints
                            .filter(point => typeof point === "string" && point.trim())
                            .map(point => point.trim())
                            .slice(0, 4)
                        : [],
                    focusPoints: Array.isArray(item.focusPoints)
                        ? item.focusPoints
                            .filter(point => typeof point === "string" && point.trim())
                            .map(point => point.trim())
                            .slice(0, 2)
                        : [],
                    category: typeof item.category === "string"
                        ? item.category.trim()
                        : "",
                    feedback: typeof item.feedback === "string"
                        ? item.feedback.trim().slice(0, 1000)
                        : "",
                    referenceAnswer: typeof item.referenceAnswer === "string"
                        ? item.referenceAnswer.trim().slice(0, 1200)
                        : "",
                    solution: typeof item.solution === "string"
                        ? item.solution.trim().slice(0, 8000)
                        : "",
                    solutionUpdatedAt: Number.isFinite(item.solutionUpdatedAt)
                        ? item.solutionUpdatedAt
                        : null,
                    note: typeof item.note === "string"
                        ? item.note.trim().slice(0, 1500)
                        : "",
                    source: item.source === "auto" ? "auto" : "manual",
                    corrected: Boolean(item.corrected),
                    mistakeCount: item.source === "auto"
                        ? Math.max(1, Number(item.mistakeCount) || 1)
                        : Math.max(0, Number(item.mistakeCount) || 0),
                    sessionId: (
                        typeof item.sessionId === "number"
                        || typeof item.sessionId === "string"
                    )
                        ? item.sessionId
                        : null,
                    createdAt: Number.isFinite(item.createdAt)
                        ? item.createdAt
                        : Date.now(),
                    updatedAt: Number.isFinite(item.updatedAt)
                        ? item.updatedAt
                        : Date.now(),
                    lastWrongAt: Number.isFinite(item.lastWrongAt)
                        ? item.lastWrongAt
                        : (
                            Number.isFinite(item.updatedAt)
                                ? item.updatedAt
                                : Date.now()
                        ),
                    correctedAt: Number.isFinite(item.correctedAt)
                        ? item.correctedAt
                        : null,
                    retestCount: Math.max(0, Number(item.retestCount) || 0),
                    retestPassCount: Math.max(0, Number(item.retestPassCount) || 0),
                    retestFailCount: Math.max(0, Number(item.retestFailCount) || 0),
                    retestPassed: Boolean(item.retestPassed),
                    retestPassedAt: Number.isFinite(item.retestPassedAt)
                        ? item.retestPassedAt
                        : null,
                    lastRetestAt: Number.isFinite(item.lastRetestAt)
                        ? item.lastRetestAt
                        : null,
                    lastRetestQuestion: typeof item.lastRetestQuestion === "string"
                        ? item.lastRetestQuestion.trim().slice(0, 3000)
                        : "",
                    lastRetestFeedback: typeof item.lastRetestFeedback === "string"
                        ? item.lastRetestFeedback.trim().slice(0, 1000)
                        : "",
                    lastRetestResult: ["correct", "wrong", "unknown"].includes(
                        item.lastRetestResult
                    )
                        ? item.lastRetestResult
                        : "",
                    lastRetestSessionId: (
                        typeof item.lastRetestSessionId === "number"
                        || typeof item.lastRetestSessionId === "string"
                    )
                        ? item.lastRetestSessionId
                        : null
                };
            })
            .filter(Boolean);

        // 老版本可能因为知识点识别略有不同，把同一道题存了多份。
        // 升级时按“题目本身”合并，避免用户看到重复卡片。
        const mergedMap = new Map();

        for (const item of normalizedWrong) {
            const key = wrongQuestionFingerprint(item.question);
            const existing = mergedMap.get(key);

            if (!existing) {
                mergedMap.set(key, item);
                continue;
            }

            const newer = item.updatedAt >= existing.updatedAt
                ? item
                : existing;
            const older = newer === item
                ? existing
                : item;

            newer.knowledgePoints = [
                ...new Set([
                    ...older.knowledgePoints,
                    ...newer.knowledgePoints
                ])
            ].slice(0, 4);

            newer.focusPoints = [
                ...new Set([
                    ...newer.focusPoints,
                    ...older.focusPoints
                ])
            ].slice(0, 2);

            newer.mistakeCount = (
                Math.max(0, Number(older.mistakeCount) || 0)
                + Math.max(0, Number(newer.mistakeCount) || 0)
            );

            // 同一道题的多个旧记录合并时，以更新时间更晚的状态为准。
            // 这样“后来已订正”不会被更早的待订正记录重新覆盖。
            newer.corrected = Boolean(newer.corrected);
            newer.correctedAt = newer.corrected
                ? (
                    Number(newer.correctedAt)
                    || Number(older.correctedAt)
                    || null
                )
                : null;

            newer.createdAt = Math.min(
                older.createdAt,
                newer.createdAt
            );

            newer.lastWrongAt = Math.max(
                older.lastWrongAt,
                newer.lastWrongAt
            );

            if (!newer.sessionId && older.sessionId) {
                newer.sessionId = older.sessionId;
            }

            if (!newer.note && older.note) {
                newer.note = older.note;
            }

            if (!newer.referenceAnswer && older.referenceAnswer) {
                newer.referenceAnswer = older.referenceAnswer;
            }

            if (!newer.solution && older.solution) {
                newer.solution = older.solution;
                newer.solutionUpdatedAt = older.solutionUpdatedAt;
            }

            newer.retestCount = (
                (Number(older.retestCount) || 0)
                + (Number(newer.retestCount) || 0)
            );
            newer.retestPassCount = (
                (Number(older.retestPassCount) || 0)
                + (Number(newer.retestPassCount) || 0)
            );
            newer.retestFailCount = (
                (Number(older.retestFailCount) || 0)
                + (Number(newer.retestFailCount) || 0)
            );

            const newerRetestTime = Number(newer.lastRetestAt) || 0;
            const olderRetestTime = Number(older.lastRetestAt) || 0;

            if (olderRetestTime > newerRetestTime) {
                newer.lastRetestAt = older.lastRetestAt;
                newer.lastRetestQuestion = older.lastRetestQuestion;
                newer.lastRetestFeedback = older.lastRetestFeedback;
                newer.lastRetestResult = older.lastRetestResult;
            }

            newer.retestPassedAt = Math.max(
                Number(newer.retestPassedAt) || 0,
                Number(older.retestPassedAt) || 0
            ) || null;

            const latestWrongAt = Math.max(
                Number(newer.lastWrongAt) || 0,
                Number(older.lastWrongAt) || 0
            );

            newer.retestPassed = Boolean(
                newer.retestPassedAt
                && newer.retestPassedAt >= latestWrongAt
            );

            if (!newer.lastRetestSessionId && older.lastRetestSessionId) {
                newer.lastRetestSessionId = older.lastRetestSessionId;
            }

            mergedMap.set(key, newer);
        }

        state.wrongQuestions = [...mergedMap.values()]
            .sort((a, b) => a.updatedAt - b.updatedAt)
            .slice(-MAX_WRONG_QUESTIONS);
    }

    state.knowledge = buildKnowledgeFromEvents(
        state.events
    );

    return state;
}

function loadLearningState() {
    try {
        const raw = localStorage.getItem(LEARNING_STORAGE_KEY);

        if (!raw) {
            learningState = createEmptyLearningState();
            return;
        }

        learningState = normalizeLearningState(
            JSON.parse(raw)
        );
    } catch (error) {
        console.warn("学习记录读取失败：", error);
        learningState = createEmptyLearningState();
    }
}

function saveLearningState() {
    try {
        localStorage.setItem(
            LEARNING_STORAGE_KEY,
            JSON.stringify(learningState)
        );
    } catch (error) {
        console.warn("学习记录保存失败：", error);
    }
}

function emptyKnowledgeRecord() {
    return {
        seen: 0,
        correct: 0,
        wrong: 0,
        support: 0,
        reviewed: 0,
        updatedAt: 0
    };
}

function buildKnowledgeFromEvents(events) {
    const knowledge = {};

    for (const event of Array.isArray(events) ? events : []) {
        if (
            !event
            || !Array.isArray(event.points)
            || !event.type
        ) {
            continue;
        }

        for (const rawPoint of event.points) {
            const point = String(rawPoint || "").trim();
            if (!point) continue;

            if (!knowledge[point]) {
                knowledge[point] = emptyKnowledgeRecord();
            }

            const record = knowledge[point];

            if (event.type === "seen") record.seen += 1;
            if (event.type === "correct") record.correct += 1;
            if (event.type === "wrong") record.wrong += 1;
            if (event.type === "support") record.support += 1;
            if (event.type === "reviewed") record.reviewed += 1;

            record.updatedAt = Math.max(
                record.updatedAt,
                Number(event.createdAt) || 0
            );
        }
    }

    return knowledge;
}

function rebuildKnowledge() {
    learningState.knowledge = buildKnowledgeFromEvents(
        learningState.events
    );
}

function updateKnowledge(points, eventType, sessionId = null) {
    const uniquePoints = [
        ...new Set(
            (Array.isArray(points) ? points : [])
                .filter(point => typeof point === "string" && point.trim())
                .map(point => point.trim())
        )
    ].slice(0, 4);

    if (
        !uniquePoints.length
        || ![
            "seen",
            "correct",
            "wrong",
            "support",
            "reviewed"
        ].includes(eventType)
    ) {
        return;
    }

    const now = Date.now();

    learningState.events.push({
        id: `learn-${now}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: (
            typeof sessionId === "number"
            || typeof sessionId === "string"
        )
            ? sessionId
            : null,
        type: eventType,
        points: uniquePoints,
        createdAt: now
    });

    if (learningState.events.length > 1000) {
        learningState.events = learningState.events.slice(-1000);
    }

    rebuildKnowledge();
    saveLearningState();
}

function removeLearningEventsForSession(sessionId) {
    if (
        sessionId === null
        || sessionId === undefined
    ) {
        return;
    }

    const before = learningState.events.length;

    learningState.events = learningState.events.filter(
        event => String(event.sessionId) !== String(sessionId)
    );

    if (learningState.events.length !== before) {
        rebuildKnowledge();
        saveLearningState();
    }
}

function knowledgeStatus(record) {
    if (!record || typeof record !== "object") {
        return "暂无记录";
    }

    const correct = Number(record.correct) || 0;
    const wrong = Number(record.wrong) || 0;
    const seen = Number(record.seen) || 0;
    const reviewed = Number(record.reviewed) || 0;

    if (!correct && !wrong && !seen && !reviewed) {
        return "暂无记录";
    }

    if (wrong > 0) {
        return "有错误记录";
    }

    if (correct > 0) {
        return "已有正确记录";
    }

    if (reviewed > 0) {
        return "完成过订正";
    }

    return "有学习记录";
}


function getLatestUserMessage(session) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
        const message = session.messages[index];

        if (
            message
            && message.role === "user"
            && typeof message.text === "string"
            && message.text.trim()
        ) {
            return message;
        }
    }

    return null;
}

function isShortLearningFollowUp(text) {
    const value = String(text || "")
        .trim()
        .replace(/\s+/g, "");

    if (!value) return true;

    const exactCommands = [
        "继续",
        "再提示一下",
        "再给个提示",
        "给我提示",
        "完整解析",
        "给我完整解析",
        "直接给答案",
        "告诉我答案",
        "为什么",
        "然后呢",
        "下一步呢",
        "再讲一下",
        "再解释一下",
        "换个写法",
        "换一种写法",
        "列一下",
        "写一下",
        "展开一下",
        "用大括号列一下",
        "用大括号写一下",
        "用矩阵写一下",
        "这个怎么看",
        "这个怎么写",
        "这一步怎么写"
    ];

    if (exactCommands.includes(value)) {
        return true;
    }

    // 这类短句通常是在追问“怎么表示/怎么改写”，不是一道新题。
    const followUpPatterns = [
        /用.+(?:列|写|表示|展开)一下$/,
        /(?:再|重新).+(?:讲|写|列|解释|说明)一下$/,
        /(?:换|改).+(?:写法|表示|形式)$/,
        /^(?:这个|这里|这一步|上面|刚才).{0,12}(?:怎么|为什么|什么意思|看不懂|不明白)/,
        /(?:怎么写|怎么表示|怎么列|什么意思|看不懂|不明白)$/
    ];

    if (
        value.length <= 30
        && followUpPatterns.some(pattern => pattern.test(value))
    ) {
        return true;
    }

    return value.length <= 6;
}

function looksLikeActualLearningProblem(message) {
    if (
        !message
        || typeof message.text !== "string"
    ) {
        return false;
    }

    if (message.source === "ocr") {
        return true;
    }

    const text = message.text.trim();
    if (!text || isShortLearningFollowUp(text)) {
        return false;
    }

    const compact = text.replace(/\s+/g, "");

    // 明显的题目结构或题干用语。
    const problemSignals = [
        "【题目文字】",
        "【图形信息】",
        "[图片识题]",
        "已知",
        "设",
        "求",
        "求解",
        "证明",
        "判断",
        "计算",
        "写出",
        "列出",
        "回答下列问题",
        "选择题",
        "证明题",
        "计算题"
    ];

    if (
        problemSignals.some(signal => compact.includes(signal))
    ) {
        return true;
    }

    if (/[（(]\s*[1-9]\s*[)）]/.test(text)) {
        return true;
    }

    // 一般完整题目会比“换个写法/再提示一下”长很多。
    if (text.length >= 80) {
        return true;
    }

    return false;
}

function buildLearningQuestionFromSession(session, teaching, excludeLatest = false) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    const end = excludeLatest
        ? session.messages.length - 2
        : session.messages.length - 1;

    for (let index = end; index >= 0; index -= 1) {
        const message = session.messages[index];

        if (
            !message
            || message.role !== "user"
            || typeof message.text !== "string"
        ) {
            continue;
        }

        const text = message.text.trim();
        if (!text) continue;

        if (message.isRetestPrompt || message.isRetestAnswer) {
            continue;
        }

        if (!looksLikeActualLearningProblem(message)) {
            continue;
        }

        return {
            text: text.slice(0, 3000),
            knowledgePoints: Array.isArray(teaching?.knowledge_points)
                ? teaching.knowledge_points.slice(0, 4)
                : [],
            focusPoints: Array.isArray(teaching?.focus_points)
                ? teaching.focus_points.slice(0, 2)
                : [],
            category: typeof teaching?.category === "string"
                ? teaching.category
                : "",
            source: message.source === "ocr" ? "ocr" : "text",
            sessionId: session.id,
            updatedAt: Date.now()
        };
    }

    return null;
}

function splitQuestionBankText(text) {
    const source = String(text || "").trim();

    if (!source) return [];

    const lines = source.split(/\r?\n/);
    const blocks = [];
    let current = null;

    const pushCurrent = () => {
        if (!current) return;

        const raw = current.lines
            .join("\n")
            .trim();

        if (!raw) {
            current = null;
            return;
        }

        const answerMatch = raw.match(
            /(?:^|\n)\s*答\s*[:：]\s*([^\n]*)/m
        );

        const referenceAnswer = answerMatch
            ? answerMatch[1].trim()
            : "";

        const question = raw
            .replace(
                /(?:^|\n)\s*答\s*[:：]\s*[^\n]*/m,
                ""
            )
            .trim();

        blocks.push({
            number: current.number,
            question,
            referenceAnswer
        });

        current = null;
    };

    for (const line of lines) {
        const match = line.match(
            /^\s*(\d{1,2})\s*[、.．]\s*(.*)$/
        );

        if (match) {
            pushCurrent();

            current = {
                number: match[1],
                lines: [
                    `${match[1]}、${match[2]}`
                ]
            };

            continue;
        }

        if (current) {
            current.lines.push(line);
        }
    }

    pushCurrent();

    if (blocks.length < 2) {
        return [];
    }

    const answerCount = blocks.filter(
        item => item.referenceAnswer
    ).length;

    const bankSignal = /题库答案|题库|选择或填空|练习答案|习题答案/.test(
        source
    );

    // 避免把“一个大题里的 1/2 两个小问”错误拆开：
    // 只有多个独立答案，或明显是题库且至少 3 题时才判为题组。
    const isQuestionBank = (
        answerCount >= 2
        || (
            bankSignal
            && blocks.length >= 3
        )
    );

    if (!isQuestionBank) {
        return [];
    }

    return blocks
        .filter(item => item.question)
        .slice(0, 30);
}

function isExerciseRequestText(text) {
    const value = String(text || "")
        .replace(/\s+/g, "");

    if (!value) return false;

    return /(?:给我|帮我|请|再|重新)?(?:出|来)(?:一道|一题|几道|几题)?[^，。！？]{0,10}(?:题|练习)|(?:练习题|测试题|例题).{0,8}(?:来一道|出一道|出一题|给一道)/.test(
        value
    );
}

function extractAiGeneratedExerciseText(reply) {
    let text = String(reply || "").trim();

    if (!text) return "";

    const headingPatterns = [
        /【题目】/,
        /【练习题】/,
        /(?:^|\n)#{1,4}\s*题目\s*(?:\n|$)/m,
        /(?:^|\n)\*\*题目[:：]?\*\*\s*/m
    ];

    let bestIndex = -1;
    let bestLength = 0;

    for (const pattern of headingPatterns) {
        const match = pattern.exec(text);

        if (
            match
            && (
                bestIndex < 0
                || match.index < bestIndex
            )
        ) {
            bestIndex = match.index;
            bestLength = match[0].length;
        }
    }

    if (bestIndex >= 0) {
        text = text.slice(
            bestIndex + bestLength
        ).trim();
    }

    // 练习题回答通常在题目后附“提示”。错题本只保存题目正文。
    const hintMatch = text.match(
        /\n\s*(?:---+\s*\n\s*)?(?:\*\*)?提示[:：]?(?:\*\*)?/i
    );

    if (hintMatch && typeof hintMatch.index === "number") {
        text = text.slice(0, hintMatch.index).trim();
    }

    return text.slice(0, 3000);
}

function openWrongQuestionPicker(questionInfo, choices) {
    const modal = document.getElementById(
        "wrongQuestionPickerModal"
    );
    const list = document.getElementById(
        "wrongQuestionPickerList"
    );

    if (!modal || !list || !choices.length) {
        return false;
    }

    pendingWrongQuestionSelection = {
        questionInfo,
        choices
    };

    list.innerHTML = "";

    choices.forEach((choice, index) => {
        const label = document.createElement("label");
        label.className = "wrong-picker-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(index);

        const content = document.createElement("div");
        content.className = "wrong-picker-content";

        const title = document.createElement("div");
        title.className = "wrong-picker-title";
        title.textContent = `第 ${choice.number} 题`;

        const preview = document.createElement("div");
        preview.className = "wrong-picker-preview";
        preview.textContent = choice.question
            .replace(/\s+/g, " ")
            .slice(0, 180);

        content.appendChild(title);
        content.appendChild(preview);

        if (choice.referenceAnswer) {
            const answer = document.createElement("div");
            answer.className = "wrong-picker-answer";
            answer.textContent = `题库参考答案：${choice.referenceAnswer}`;
            content.appendChild(answer);
        }

        label.appendChild(checkbox);
        label.appendChild(content);
        list.appendChild(label);
    });

    modal.classList.remove("hidden");
    return true;
}

function closeWrongQuestionPicker() {
    const modal = document.getElementById(
        "wrongQuestionPickerModal"
    );

    if (modal) {
        modal.classList.add("hidden");
    }

    pendingWrongQuestionSelection = null;
}

function addQuestionInfoToWrongBook(questionInfo) {
    const result = addWrongQuestion(
        questionInfo,
        "这道题已加入错题本。",
        "manual"
    );

    saveState();
    renderLearningSummary();
    renderWrongBook();

    return result;
}

function confirmWrongQuestionPicker() {
    const pending = pendingWrongQuestionSelection;

    if (!pending) return;

    const checked = [
        ...document.querySelectorAll(
            "#wrongQuestionPickerList input[type='checkbox']:checked"
        )
    ];

    if (!checked.length) {
        window.alert("请至少选择一道题。");
        return;
    }

    for (const checkbox of checked) {
        const index = Number(checkbox.value);
        const choice = pending.choices[index];

        if (!choice) continue;

        addQuestionInfoToWrongBook({
            ...pending.questionInfo,
            text: choice.question,
            referenceAnswer: choice.referenceAnswer || ""
        });
    }

    closeWrongQuestionPicker();

    const button = document.getElementById("markWrongBtn");
    if (button) {
        const previous = button.textContent;
        button.textContent = `已记录 ${checked.length} 道`;

        setTimeout(() => {
            button.textContent = previous;
            renderLearningSummary();
        }, 1000);
    }
}


function inferAnswerAssessment(reply) {
    let text = String(reply || "").replace(/\s+/g, " ").trim();

    if (!text) return "unknown";

    const strongPositive = [
        "完全正确",
        "这次作答正确",
        "作答正确",
        "答案正确",
        "结果正确",
        "计算正确",
        "没有错误",
        "没有问题",
        "没错",
        "是对的"
    ];

    const hasPositive = strongPositive.some(
        phrase => text.includes(phrase)
    );

    for (const phrase of strongPositive) {
        text = text.split(phrase).join("");
    }

    const negative = [
        "不正确",
        "这次作答有错误",
        "作答有错误",
        "答案有误",
        "结果有误",
        "存在错误",
        "这里错了",
        "这一步错",
        "算错",
        "写错",
        "错误在",
        "最早出错",
        "不成立",
        "需要修改",
        "需要纠正",
        "有一个错误",
        "有一处错误"
    ];

    if (negative.some(phrase => text.includes(phrase))) {
        return "wrong";
    }

    return hasPositive ? "correct" : "unknown";
}

function compactFeedback(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
}

function wrongQuestionFingerprint(question) {
    return String(question || "")
        .toLowerCase()
        .replace(/[【】\[\]（）()，,。.!！?？:：;；"'“”‘’`]/g, "")
        .replace(/\s+/g, "")
        .slice(0, 1600);
}

function wrongBookLearningPoints(entryOrQuestion) {
    const focus = Array.isArray(entryOrQuestion?.focusPoints)
        ? entryOrQuestion.focusPoints.filter(Boolean)
        : [];

    if (focus.length) {
        return focus.slice(0, 2);
    }

    return Array.isArray(entryOrQuestion?.knowledgePoints)
        ? entryOrQuestion.knowledgePoints.filter(Boolean).slice(0, 4)
        : [];
}

function addWrongQuestion(questionInfo, feedback, source = "auto") {
    const info = normalizeLearningQuestion(questionInfo);
    if (!info) return { entry: null, countAsMistake: false };

    const fingerprint = wrongQuestionFingerprint(info.text);

    const existing = learningState.wrongQuestions.find(
        item => wrongQuestionFingerprint(item.question) === fingerprint
    );

    const now = Date.now();

    if (existing) {
        const wasCorrected = Boolean(existing.corrected);

        existing.feedback = compactFeedback(feedback) || existing.feedback;

        if (info.referenceAnswer) {
            existing.referenceAnswer = info.referenceAnswer;
        }

        existing.knowledgePoints = [
            ...new Set([
                ...existing.knowledgePoints,
                ...info.knowledgePoints
            ])
        ].slice(0, 4);

        if (info.focusPoints.length) {
            existing.focusPoints = info.focusPoints.slice(0, 2);
        }

        if (info.category) {
            existing.category = info.category;
        }

        if (info.sessionId !== null) {
            existing.sessionId = info.sessionId;
        }

        if (source === "auto") {
            existing.source = "auto";
        }

        existing.corrected = false;
        existing.correctedAt = null;
        existing.updatedAt = now;
        existing.lastWrongAt = now;

        // 手动重复点“记为错题”不重复累计；
        // 真正再次答错，或订正后重新加入，才算一次新的错误记录。
        const countAsMistake = (
            source === "auto"
            || wasCorrected
        );

        if (countAsMistake) {
            existing.mistakeCount = (
                Math.max(0, Number(existing.mistakeCount) || 0)
                + 1
            );
            existing.retestPassed = false;
            existing.retestPassedAt = null;
        }

        saveLearningState();

        queueWrongQuestionSolution(
            existing.id
        );

        return {
            entry: existing,
            countAsMistake
        };
    }

    const entry = {
        id: `wrong-${now}-${Math.random().toString(36).slice(2, 8)}`,
        question: info.text,
        knowledgePoints: info.knowledgePoints,
        focusPoints: info.focusPoints,
        category: info.category,
        feedback: compactFeedback(feedback),
        referenceAnswer: info.referenceAnswer || "",
        solution: "",
        solutionUpdatedAt: null,
        note: "",
        source: source === "auto" ? "auto" : "manual",
        corrected: false,
        mistakeCount: source === "auto" ? 1 : 0,
        sessionId: info.sessionId,
        createdAt: now,
        updatedAt: now,
        lastWrongAt: now,
        correctedAt: null,
        retestCount: 0,
        retestPassCount: 0,
        retestFailCount: 0,
        retestPassed: false,
        retestPassedAt: null,
        lastRetestAt: null,
        lastRetestQuestion: "",
        lastRetestFeedback: "",
        lastRetestResult: "",
        lastRetestSessionId: null
    };

    learningState.wrongQuestions.push(entry);

    if (learningState.wrongQuestions.length > MAX_WRONG_QUESTIONS) {
        learningState.wrongQuestions = learningState.wrongQuestions
            .slice(-MAX_WRONG_QUESTIONS);
    }

    saveLearningState();

    queueWrongQuestionSolution(
        entry.id
    );

    return {
        entry,
        countAsMistake: true
    };
}

function currentLearningQuestion(session, teaching) {
    const saved = normalizeLearningQuestion(
        session?.learningQuestion
    );
    const currentTeaching = normalizeTeaching(
        teaching
    );

    if (saved) {
        const livePoints = currentTeaching?.knowledge_points || [];
        const liveFocus = currentTeaching?.focus_points || [];

        return {
            ...saved,
            knowledgePoints: [
                ...new Set([
                    ...saved.knowledgePoints,
                    ...livePoints
                ])
            ].slice(0, 4),
            // 题目正文继续沿用最初保存的原题，
            // 但“本次卡点”必须跟随当前这一轮对话更新。
            focusPoints: liveFocus.length
                ? liveFocus.slice(0, 2)
                : saved.focusPoints,
            category: (
                currentTeaching?.category
                && currentTeaching.category !== "待识别"
            )
                ? currentTeaching.category
                : saved.category
        };
    }

    return buildLearningQuestionFromSession(
        session,
        teaching,
        true
    ) || buildLearningQuestionFromSession(
        session,
        teaching,
        false
    );
}

function processLearningFromReply(session, teaching, reply) {
    const normalized = normalizeTeaching(teaching);

    if (!session || !normalized) {
        return;
    }

    const points = normalized.knowledge_points;
    const latest = getLatestUserMessage(session);
    const latestText = latest?.text || "";

    // 用户明确让 AI 出练习题时，AI 返回的题目本身就是当前学习题。
    // “记为错题”应保存模型生成的题目，而不是“给我一道题”这句请求。
    if (
        (
            normalized.mode === "exercise"
            || isExerciseRequestText(latestText)
        )
        && typeof reply === "string"
        && reply.trim()
    ) {
        const generatedExercise = extractAiGeneratedExerciseText(
            reply
        );

        session.learningQuestion = {
            text: generatedExercise || reply.trim().slice(0, 3000),
            knowledgePoints: points.slice(0, 4),
            focusPoints: normalized.focus_points.slice(0, 2),
            category: normalized.category,
            source: "ai",
            referenceAnswer: "",
            sessionId: session.id,
            updatedAt: Date.now()
        };

        if (points.length) {
            updateKnowledge(
                points,
                "seen",
                session.id
            );
        }
    }

    const isSubstantiveQuestion = Boolean(
        latest
        && looksLikeActualLearningProblem(latest)
        && normalized.mode !== "check_answer"
        && normalized.mode !== "exercise"
    );

    if (isSubstantiveQuestion && points.length) {
        session.learningQuestion = {
            text: latestText.slice(0, 3000),
            knowledgePoints: points.slice(0, 4),
            focusPoints: normalized.focus_points.slice(0, 2),
            category: normalized.category,
            source: latest.source === "ocr" ? "ocr" : "text",
            sessionId: session.id,
            updatedAt: Date.now()
        };

        updateKnowledge(points, "seen", session.id);
    }

    if (
        ["hint", "full_solution"].includes(normalized.mode)
        && points.length
    ) {
        updateKnowledge(
            normalized.focus_points.length
                ? normalized.focus_points
                : points,
            "support",
            session.id
        );
    }

    const selfReportsWrong = /(?:我|这题|刚才).{0,8}(?:做错|算错|写错|错了)/.test(
        latestText.replace(/\s+/g, "")
    );

    if (
        normalized.mode === "check_answer"
        || selfReportsWrong
    ) {
        const assessment = selfReportsWrong
            ? "wrong"
            : inferAnswerAssessment(reply);

        if (assessment === "wrong") {
            const questionInfo = currentLearningQuestion(
                session,
                normalized
            );

            const added = addWrongQuestion(
                questionInfo,
                selfReportsWrong
                    ? "你明确表示这道题做错了，建议完成订正后再标记为已订正。"
                    : reply,
                "auto"
            );

            if (added.countAsMistake) {
                updateKnowledge(
                    wrongBookLearningPoints(
                        questionInfo || {
                            knowledgePoints: points,
                            focusPoints: normalized.focus_points
                        }
                    ),
                    "wrong",
                    session.id
                );
            }
        } else if (assessment === "correct") {
            updateKnowledge(
                normalized.focus_points.length
                    ? normalized.focus_points
                    : points,
                "correct",
                session.id
            );
        }
    }

    saveState();
    saveLearningState();
    renderLearningSummary();
}

function manualMarkCurrentWrong() {
    const session = getCurrent();
    if (!session) return;

    const teaching = normalizeTeaching(
        session.teaching
    );

    const questionInfo = currentLearningQuestion(
        session,
        teaching
    );

    if (!questionInfo) {
        window.alert(
            "当前还没有可加入错题本的题目。"
        );
        return;
    }

    const choices = splitQuestionBankText(
        questionInfo.text
    );

    if (
        choices.length
        && openWrongQuestionPicker(
            questionInfo,
            choices
        )
    ) {
        return;
    }

    addQuestionInfoToWrongBook(
        questionInfo
    );

    const button = document.getElementById("markWrongBtn");
    if (button) {
        const previous = button.textContent;
        button.textContent = "已记录";

        setTimeout(() => {
            button.textContent = previous;
            renderLearningSummary();
        }, 900);
    }
}


function formatLearningDate(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(
        date.getHours()
    ).padStart(2, "0");
    const minute = String(
        date.getMinutes()
    ).padStart(2, "0");

    return `${month}月${day}日 ${hour}:${minute}`;
}

function renderLearningSummary() {
    const box = document.getElementById("learningSummary");
    const markButton = document.getElementById("markWrongBtn");
    const wrongButton = document.getElementById("wrongBookBtn");

    if (!box) return;

    const wrongCount = learningState.wrongQuestions.length;
    const pendingWrong = learningState.wrongQuestions
        .filter(item => !item.corrected)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    const pendingCount = pendingWrong.length;
    const passedCount = learningState.wrongQuestions
        .filter(item => item.retestPassed)
        .length;

    const recentFocus = pendingWrong.find(
        item => Array.isArray(item.focusPoints) && item.focusPoints.length
    );

    const lines = [];

    if (recentFocus) {
        lines.push(
            `当前主要卡点：${recentFocus.focusPoints.join("、")}`
        );
    }

    lines.push(
        `错题本：${wrongCount} 道，待订正 ${pendingCount} 道，已通过复测 ${passedCount} 道`
    );

    box.innerText = lines.join("\n");

    if (wrongButton) {
        wrongButton.textContent = `查看错题本 (${wrongCount})`;
    }

    if (markButton) {
        const session = getCurrent();
        const teaching = normalizeTeaching(session?.teaching);

        markButton.disabled = !(
            session
            && currentLearningQuestion(session, teaching)
        );
    }
}


function setWrongBookFilter(filter) {
    if (!["pending", "corrected", "passed"].includes(filter)) {
        return;
    }

    // 不再单独放“全部”按钮：
    // 未选择任何状态时就是“全部”；
    // 再点一次当前筛选即可取消筛选。
    wrongBookFilter = (
        wrongBookFilter === filter
            ? "all"
            : filter
    );

    renderWrongBook();
}

function setWrongBookSearch(value) {
    wrongBookSearch = String(value || "")
        .trim()
        .toLowerCase();

    renderWrongBook();
}

function setWrongBookSort(value) {
    if (!["recent", "oldest", "mistakes"].includes(value)) {
        return;
    }

    wrongBookSort = value;
    renderWrongBook();
}

function wrongBookStatus(item) {
    if (item.retestPassed) {
        return {
            key: "passed",
            text: "已通过复测",
            className: "passed"
        };
    }

    if (item.corrected) {
        return {
            key: "corrected",
            text: "已完成订正",
            className: "corrected"
        };
    }

    if (item.lastRetestResult === "wrong") {
        return {
            key: "pending",
            text: "复测未通过",
            className: "failed"
        };
    }

    return {
        key: "pending",
        text: "待订正",
        className: ""
    };
}

function wrongBookSearchText(item) {
    return [
        item.question,
        item.category,
        ...(item.knowledgePoints || []),
        ...(item.focusPoints || []),
        item.feedback,
        item.referenceAnswer,
        item.solution,
        item.note,
        item.lastRetestQuestion,
        item.lastRetestFeedback
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getFilteredWrongBookItems() {
    let items = [...learningState.wrongQuestions];

    if (wrongBookFilter !== "all") {
        items = items.filter(
            item => wrongBookStatus(item).key === wrongBookFilter
        );
    }

    if (wrongBookSearch) {
        items = items.filter(
            item => wrongBookSearchText(item).includes(wrongBookSearch)
        );
    }

    if (wrongBookSort === "oldest") {
        items.sort((a, b) => a.updatedAt - b.updatedAt);
    } else if (wrongBookSort === "mistakes") {
        items.sort((a, b) => (
            b.mistakeCount - a.mistakeCount
            || b.updatedAt - a.updatedAt
        ));
    } else {
        items.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return items;
}

function updateWrongBookToolbar(allItems, visibleItems) {
    const stats = document.getElementById("wrongBookStats");
    const filterButtons = document.querySelectorAll(
        "[data-wrong-filter]"
    );

    const total = allItems.length;
    const pending = allItems.filter(
        item => wrongBookStatus(item).key === "pending"
    ).length;
    const corrected = allItems.filter(
        item => wrongBookStatus(item).key === "corrected"
    ).length;
    const passed = allItems.filter(
        item => wrongBookStatus(item).key === "passed"
    ).length;

    if (stats) {
        const visibleText = visibleItems.length === total
            ? ""
            : ` · 当前显示 ${visibleItems.length} 道`;

        stats.textContent =
            `共 ${total} 道 · 待处理 ${pending} · 已订正 ${corrected} · 已通过复测 ${passed}${visibleText}`;
    }

    for (const button of filterButtons) {
        const value = button.getAttribute("data-wrong-filter");
        button.classList.toggle(
            "active",
            value === wrongBookFilter
        );
    }
}

function openWrongBook() {
    const modal = document.getElementById("wrongBookModal");
    if (!modal) return;

    renderWrongBook();
    modal.classList.remove("hidden");

    const search = document.getElementById("wrongBookSearch");
    if (search) {
        search.value = wrongBookSearch;
    }
}

function closeWrongBook() {
    const modal = document.getElementById("wrongBookModal");
    if (!modal) return;

    modal.classList.add("hidden");
}

function markWrongQuestionCorrected(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.corrected) return;

    const now = Date.now();

    entry.corrected = true;
    entry.correctedAt = now;
    entry.updatedAt = now;

    updateKnowledge(
        wrongBookLearningPoints(entry),
        "reviewed",
        entry.sessionId
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function removeWrongQuestion(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    const confirmed = window.confirm(
        "确定要把这道题移出错题本吗？这不会删除原聊天。"
    );

    if (!confirmed) return;

    learningState.wrongQuestions = learningState.wrongQuestions.filter(
        item => item.id !== id
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function clearCompletedWrongQuestions() {
    const completed = learningState.wrongQuestions.filter(
        item => item.corrected || item.retestPassed
    );

    if (!completed.length) {
        window.alert("目前没有可以清理的已完成错题。");
        return;
    }

    const confirmed = window.confirm(
        `确定移出 ${completed.length} 道已完成的错题吗？原聊天不会被删除。`
    );

    if (!confirmed) return;

    const completedIds = new Set(
        completed.map(item => item.id)
    );

    learningState.wrongQuestions = learningState.wrongQuestions.filter(
        item => !completedIds.has(item.id)
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function openWrongQuestionSession(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.sessionId === null) return;

    const session = sessions.find(
        item => String(item.id) === String(entry.sessionId)
    );

    if (!session) return;

    if (typingTimer) {
        forceCompleteTyping();
    }

    currentId = session.id;
    saveState();
    closeWrongBook();
    renderAll();
}

function openWrongRetestSession(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.lastRetestSessionId === null) return;

    const session = sessions.find(
        item => String(item.id) === String(entry.lastRetestSessionId)
    );

    if (!session) return;

    if (typingTimer) {
        forceCompleteTyping();
    }

    currentId = session.id;
    saveState();
    closeWrongBook();
    renderAll();
}

function openWrongEdit(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    currentWrongEditId = id;

    const modal = document.getElementById("wrongEditModal");
    const question = document.getElementById("wrongEditQuestion");
    const focus = document.getElementById("wrongEditFocus");
    const note = document.getElementById("wrongEditNote");

    if (!modal || !question || !focus || !note) return;

    question.value = entry.question;
    focus.value = (entry.focusPoints || []).join("、");
    note.value = entry.note || "";

    modal.classList.remove("hidden");
}

function closeWrongEdit() {
    const modal = document.getElementById("wrongEditModal");
    if (modal) {
        modal.classList.add("hidden");
    }

    currentWrongEditId = null;
}

function saveWrongEdit() {
    const entry = learningState.wrongQuestions.find(
        item => item.id === currentWrongEditId
    );

    if (!entry) {
        closeWrongEdit();
        return;
    }

    const questionBox = document.getElementById("wrongEditQuestion");
    const focusBox = document.getElementById("wrongEditFocus");
    const noteBox = document.getElementById("wrongEditNote");

    if (!questionBox || !focusBox || !noteBox) return;

    const question = questionBox.value.trim();

    if (!question) {
        window.alert("题目内容不能为空。");
        return;
    }

    const duplicate = learningState.wrongQuestions.find(
        item => (
            item.id !== entry.id
            && wrongQuestionFingerprint(item.question)
                === wrongQuestionFingerprint(question)
        )
    );

    if (duplicate) {
        window.alert("错题本里已经有这道题了，请不要重复保存。");
        return;
    }

    const focusPoints = focusBox.value
        .split(/[、,，;；]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 2);

    entry.question = question.slice(0, 3000);
    entry.focusPoints = focusPoints;
    entry.note = noteBox.value.trim().slice(0, 1500);

    if (focusPoints.length) {
        entry.knowledgePoints = [
            ...new Set([
                ...focusPoints,
                ...(entry.knowledgePoints || [])
            ])
        ].slice(0, 4);
    }

    entry.updatedAt = Date.now();

    saveLearningState();
    closeWrongEdit();
    renderLearningSummary();
    renderWrongBook();
}

function buildRetestPrompt(entry) {
    const target = wrongBookLearningPoints(entry);
    const targetText = target.length
        ? target.join("、")
        : (
            entry.category
            || "这道题涉及的核心知识点"
        );

    return [
        "【错题复测】",
        `请围绕知识点“${targetText}”生成 1 道新的离散数学复测题。`,
        "要求：",
        "1. 与下面原错题考查同一核心能力，但题面、数字或结构必须明显不同；",
        "2. 难度与原题大致相当，不要故意变难；",
        "3. 只给复测题目，不给答案、提示、解析或解题步骤；",
        "4. 题目必须信息完整、可独立作答；",
        "",
        "原错题：",
        entry.question
    ].join("\n");
}

function startWrongQuestionRetest(id) {
    if (typingTimer || requestBusy) {
        return;
    }

    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    if (!entry.corrected && !entry.retestPassed) {
        window.alert("请先完成这道错题的订正，再进行复测。");
        return;
    }

    const targetPoints = wrongBookLearningPoints(entry);
    const idValue = makeSessionId();
    const targetName = targetPoints.length
        ? targetPoints[0]
        : "错题";

    const visiblePrompt =
        `给我一道“${targetName}”的同知识点复测题。`;

    const session = {
        id: idValue,
        name: `复测：${targetName}`.slice(0, 22),
        messages: [{
            role: "user",
            text: visiblePrompt,
            apiText: buildRetestPrompt(entry),
            isRetestPrompt: true
        }],
        teaching: null,
        learningQuestion: null,
        retest: {
            wrongQuestionId: entry.id,
            stage: "generating",
            targetPoints,
            generatedQuestion: "",
            startedAt: Date.now(),
            result: ""
        }
    };

    sessions.push(session);
    currentId = session.id;

    entry.lastRetestSessionId = session.id;
    entry.updatedAt = Date.now();

    saveLearningState();
    saveState();
    closeWrongBook();
    renderAll();

    requestAiReply(session);
}

function processWrongQuestionRetestReply(session, reply) {
    const retest = normalizeRetestSession(session?.retest);

    if (!session || !retest || !retest.wrongQuestionId) {
        return false;
    }

    const entry = learningState.wrongQuestions.find(
        item => item.id === retest.wrongQuestionId
    );

    if (!entry) {
        session.retest = null;
        saveState();
        return false;
    }

    if (retest.stage === "generating") {
        retest.generatedQuestion = String(reply || "")
            .trim()
            .slice(0, 3000);
        retest.stage = "awaiting_answer";
        session.retest = retest;

        saveState();
        return true;
    }

    if (retest.stage !== "checking") {
        return false;
    }

    const assessment = inferAnswerAssessment(reply);
    const now = Date.now();

    entry.lastRetestAt = now;
    entry.lastRetestSessionId = session.id;
    entry.lastRetestQuestion = (
        retest.generatedQuestion
        || entry.lastRetestQuestion
        || ""
    ).slice(0, 3000);
    entry.lastRetestFeedback = compactFeedback(reply);
    entry.lastRetestResult = assessment;

    if (assessment === "correct") {
        entry.retestCount += 1;
        entry.retestPassCount += 1;
        entry.retestPassed = true;
        entry.retestPassedAt = now;
        entry.corrected = true;
        entry.correctedAt = entry.correctedAt || now;

        updateKnowledge(
            retest.targetPoints.length
                ? retest.targetPoints
                : wrongBookLearningPoints(entry),
            "correct",
            session.id
        );
    } else if (assessment === "wrong") {
        entry.retestCount += 1;
        entry.retestFailCount += 1;
        entry.retestPassed = false;
        entry.retestPassedAt = null;
        entry.corrected = false;
        entry.correctedAt = null;

        updateKnowledge(
            retest.targetPoints.length
                ? retest.targetPoints
                : wrongBookLearningPoints(entry),
            "wrong",
            session.id
        );
    }

    entry.updatedAt = now;

    retest.result = assessment;
    retest.stage = assessment === "unknown"
        ? "awaiting_answer"
        : "finished";
    session.retest = retest;

    saveState();
    saveLearningState();
    renderLearningSummary();
    renderWrongBook();

    return true;
}

function rollbackRetestAfterRequestFailure(session) {
    const retest = normalizeRetestSession(session?.retest);
    if (!retest) return;

    if (retest.stage === "checking") {
        retest.stage = "awaiting_answer";
        session.retest = retest;
    } else if (retest.stage === "generating") {
        session.retest = null;
    }

    saveState();
}

function buildWrongBookPdfExportElement(items) {
    const container = document.createElement("div");
    container.className = "wrong-pdf-export";
    container.style.position = "fixed";
    container.style.left = "-100000px";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.padding = "34px 40px";
    container.style.background = "#ffffff";
    container.style.color = "#111827";
    container.style.fontFamily = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif';
    container.style.lineHeight = "1.65";
    container.style.zIndex = "-1";

    const title = document.createElement("div");
    title.style.fontSize = "28px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    title.textContent = "离散数学错题本";
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.style.fontSize = "13px";
    subtitle.style.color = "#64748b";
    subtitle.style.marginBottom = "22px";
    subtitle.textContent = (
        `共 ${items.length} 道 · 导出时间：${new Date().toLocaleString("zh-CN")}`
    );
    container.appendChild(subtitle);

    items.forEach((item, index) => {
        const status = wrongBookStatus(item);
        const card = document.createElement("section");
        card.className = "wrong-pdf-card";
        card.style.padding = "18px 0 20px";
        card.style.borderTop = (
            index === 0
                ? "0"
                : "1px solid #e2e8f0"
        );

        const statusLine = document.createElement("div");
        statusLine.style.fontSize = "15px";
        statusLine.style.fontWeight = "700";
        statusLine.style.marginBottom = "10px";
        statusLine.textContent = `${index + 1}. ${status.text}`;
        card.appendChild(statusLine);

        const question = document.createElement("div");
        question.className = "wrong-pdf-question";
        question.style.fontSize = "15px";
        question.style.whiteSpace = "pre-wrap";
        question.style.wordBreak = "break-word";
        question.innerHTML = markdownToHtml(item.question);
        card.appendChild(question);

        const metaParts = [];

        if (item.focusPoints?.length) {
            metaParts.push(
                `本次主要卡在：${item.focusPoints.join("、")}`
            );
        }

        if (item.knowledgePoints?.length) {
            metaParts.push(
                `整题涉及：${item.knowledgePoints.join("、")}`
            );
        }

        metaParts.push(
            `累计记录错误：${item.mistakeCount || 1} 次`
        );

        if (item.retestCount) {
            metaParts.push(
                `复测 ${item.retestCount} 次，通过 ${item.retestPassCount || 0} 次`
            );
        }

        const meta = document.createElement("div");
        meta.style.marginTop = "10px";
        meta.style.fontSize = "12px";
        meta.style.color = "#64748b";
        meta.textContent = metaParts.join(" · ");
        card.appendChild(meta);

        if (shouldShowWrongBookFeedback(item)) {
            const block = document.createElement("div");
            block.style.marginTop = "12px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "最近反馈";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.feedback);
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.referenceAnswer) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "参考答案";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.referenceAnswer);
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.solution) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "答案与解析";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(
                normalizeWrongSolutionMarkdown(item.solution)
            );
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.note) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "我的笔记";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.note);
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.lastRetestQuestion) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.border = "1px solid #e2e8f0";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "最近复测题";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.lastRetestQuestion);
            block.appendChild(body);

            card.appendChild(block);
        }

        container.appendChild(card);
    });

    document.body.appendChild(container);
    return container;
}

async function typesetWrongBookPdfElement(container) {
    if (
        window.MathJax
        && MathJax.typesetPromise
    ) {
        try {
            await MathJax.typesetPromise([container]);
        } catch (error) {
            console.warn("导出 PDF 时公式渲染失败：", error);
        }
    }

    if (document.fonts?.ready) {
        try {
            await document.fonts.ready;
        } catch (_error) {
            // 字体等待失败不阻止导出。
        }
    }
}

function canvasSlice(sourceCanvas, startY, sliceHeight) {
    const slice = document.createElement("canvas");
    slice.width = sourceCanvas.width;
    slice.height = sliceHeight;

    const context = slice.getContext("2d");
    context.drawImage(
        sourceCanvas,
        0,
        startY,
        sourceCanvas.width,
        sliceHeight,
        0,
        0,
        sourceCanvas.width,
        sliceHeight
    );

    return slice;
}

async function exportWrongBookPdf() {
    const items = getFilteredWrongBookItems();

    if (!items.length) {
        window.alert("当前没有可以导出的错题。");
        return;
    }

    if (
        typeof window.html2canvas !== "function"
        || !window.jspdf?.jsPDF
    ) {
        window.alert(
            "PDF 组件加载失败，请刷新页面后重试。"
        );
        return;
    }

    const button = document.getElementById(
        "wrongPdfBtn"
    );
    const originalText = button?.textContent || "";

    if (button) {
        button.disabled = true;
        button.textContent = "正在生成 PDF…";
    }

    let exportElement = null;

    try {
        exportElement = buildWrongBookPdfExportElement(
            items
        );

        await typesetWrongBookPdfElement(
            exportElement
        );

        const {
            jsPDF
        } = window.jspdf;

        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const marginX = 12;
        const marginY = 12;
        const usableWidth = pageWidth - marginX * 2;
        const usableHeight = pageHeight - marginY * 2;

        const sections = [
            ...exportElement.children
        ];

        let currentY = marginY;
        let hasContent = false;

        for (const section of sections) {
            const canvas = await window.html2canvas(
                section,
                {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    useCORS: true,
                    logging: false
                }
            );

            if (!canvas.width || !canvas.height) {
                continue;
            }

            const renderedHeight = (
                canvas.height
                * usableWidth
                / canvas.width
            );

            const remaining = (
                usableHeight
                - (currentY - marginY)
            );

            if (
                hasContent
                && renderedHeight > remaining
            ) {
                pdf.addPage();
                currentY = marginY;
            }

            if (renderedHeight <= usableHeight) {
                const image = canvas.toDataURL(
                    "image/jpeg",
                    0.92
                );

                pdf.addImage(
                    image,
                    "JPEG",
                    marginX,
                    currentY,
                    usableWidth,
                    renderedHeight,
                    undefined,
                    "FAST"
                );

                currentY += renderedHeight + 4;
                hasContent = true;
                continue;
            }

            // 单个内容块超过一页时，按像素切片，避免被截断。
            const pixelsPerMm = canvas.width / usableWidth;
            const fullPagePixels = Math.max(
                1,
                Math.floor(
                    usableHeight * pixelsPerMm
                )
            );

            let startY = 0;

            while (startY < canvas.height) {
                if (hasContent) {
                    pdf.addPage();
                }

                const sliceHeight = Math.min(
                    fullPagePixels,
                    canvas.height - startY
                );

                const slice = canvasSlice(
                    canvas,
                    startY,
                    sliceHeight
                );

                const sliceHeightMm = (
                    sliceHeight
                    * usableWidth
                    / canvas.width
                );

                pdf.addImage(
                    slice.toDataURL(
                        "image/jpeg",
                        0.92
                    ),
                    "JPEG",
                    marginX,
                    marginY,
                    usableWidth,
                    sliceHeightMm,
                    undefined,
                    "FAST"
                );

                hasContent = true;
                currentY = marginY + sliceHeightMm + 4;
                startY += sliceHeight;
            }
        }

        const date = new Date()
            .toISOString()
            .slice(0, 10);

        pdf.save(
            `离散数学错题本-${date}.pdf`
        );
    } catch (error) {
        console.error("错题本 PDF 导出失败：", error);

        window.alert(
            "PDF 生成失败，请刷新页面后重试。"
        );
    } finally {
        exportElement?.remove();

        if (button) {
            button.disabled = false;
            button.textContent = originalText || "导出 PDF";
        }
    }
}


function normalizeWrongSolutionMarkdown(text) {
    let source = String(text || "").trim();

    if (!source) return "";

    // 裸 \begin{...} 环境统一放进块级公式。
    source = source.replace(
        /\\begin\{(bmatrix|pmatrix|matrix|cases|aligned|array)\}[\s\S]*?\\end\{\1\}/g,
        (match, _env, offset, fullText) => {
            const before = fullText.slice(
                Math.max(0, offset - 4),
                offset
            );

            const after = fullText.slice(
                offset + match.length,
                offset + match.length + 4
            );

            if (
                /\$\$\s*$/.test(before)
                && /^\s*\$\$/.test(after)
            ) {
                return match;
            }

            return `$$\n${match}\n$$`;
        }
    );

    const lines = source.split(/\r?\n/);
    let inBlockMath = false;

    const normalized = lines.map(line => {
        const trimmed = line.trim();

        if (trimmed === "$$") {
            inBlockMath = !inBlockMath;
            return line;
        }

        if (
            inBlockMath
            || !trimmed
            || trimmed.includes("$")
        ) {
            return line;
        }

        const hasChinese = /[\u3400-\u9fff]/.test(
            trimmed
        );

        const looksLikePureMath = (
            !hasChinese
            && (
                /\\(?:to|rightarrow|Rightarrow|xrightarrow|in|notin|neq|leq|geq|le|ge|cdot|times|cup|cap)\b/.test(trimmed)
                || /[A-Za-z]_\{?[A-Za-z0-9]+\}?/.test(trimmed)
                || /[A-Za-z]\^\{?[0-9A-Za-z]+\}?/.test(trimmed)
            )
        );

        if (looksLikePureMath) {
            return `$${trimmed}$`;
        }

        return line;
    });

    return normalized.join("\n");
}

function queueWrongQuestionSolution(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (
        !entry
        || entry.solution
        || wrongSolutionLoadingIds.has(id)
        || wrongSolutionQueue.includes(id)
    ) {
        return;
    }

    wrongSolutionQueue.push(id);
    runWrongSolutionQueue();
}

async function runWrongSolutionQueue() {
    if (wrongSolutionQueueBusy) {
        return;
    }

    wrongSolutionQueueBusy = true;

    try {
        while (wrongSolutionQueue.length) {
            const id = wrongSolutionQueue.shift();

            await generateWrongQuestionSolution(
                id,
                {
                    expand: false,
                    silent: true
                }
            );
        }
    } finally {
        wrongSolutionQueueBusy = false;
    }
}


function toggleWrongSolution(id) {
    if (wrongSolutionExpandedIds.has(id)) {
        wrongSolutionExpandedIds.delete(id);
    } else {
        wrongSolutionExpandedIds.add(id);
    }

    renderWrongBook();
}

async function generateWrongQuestionSolution(
    id,
    {
        expand = false,
        silent = false
    } = {}
) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) {
        return false;
    }

    if (entry.solution) {
        if (expand) {
            wrongSolutionExpandedIds.add(id);
            renderWrongBook();
        }

        return true;
    }

    if (wrongSolutionLoadingIds.has(id)) {
        return false;
    }

    wrongSolutionLoadingIds.add(id);
    renderWrongBook();

    const knownAnswer = entry.referenceAnswer
        ? [
            "",
            `题库提供的参考答案：${entry.referenceAnswer}`,
            "请先核对该答案。若参考答案有误，请在解析中明确指出并给出正确答案。"
        ].join("\n")
        : "";

    const prompt = [
        "请直接为下面这道离散数学错题生成“答案与解析”。",
        "不要反问学生，也不要只给提示。",
        "",
        "输出要求：",
        "1. 第一部分标题写“## 答案”，直接给最终答案；",
        "2. 第二部分标题写“## 解析”，给出清晰、不过度冗长的分步推理；",
        "3. 最后可补一行“易错点”；",
        "4. 所有行内数学表达式必须写在 $...$ 中；",
        "5. 所有矩阵、cases、多行推导必须写在 $$...$$ 中；",
        "6. 绝对不要输出裸露的 \\\\begin{bmatrix}、\\\\to、v_1 这类未被数学定界符包裹的 LaTeX；",
        "7. 使用 Markdown，但不要使用 HTML。",
        "",
        "【错题】",
        entry.question,
        knownAnswer
    ].join("\n");

    try {
        const response = await fetch(
            "/chat",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                })
            }
        );

        const data = await parseResponseJson(
            response
        );

        if (
            !response.ok
            || data.error
            || typeof data.reply !== "string"
            || !data.reply.trim()
        ) {
            if (!silent) {
                window.alert(
                    data.error
                    || "答案与解析生成失败，请稍后重试。"
                );
            }

            return false;
        }

        entry.solution = normalizeWrongSolutionMarkdown(
            data.reply.trim()
        ).slice(0, 8000);

        entry.solutionUpdatedAt = Date.now();
        entry.updatedAt = Date.now();

        if (expand) {
            wrongSolutionExpandedIds.add(id);
        }

        saveLearningState();
        renderWrongBook();

        return true;

    } catch (error) {
        console.error(
            "错题答案与解析生成失败：",
            error
        );

        if (!silent) {
            window.alert(
                "网络连接失败，暂时无法生成答案与解析。"
            );
        }

        return false;

    } finally {
        wrongSolutionLoadingIds.delete(id);
        renderWrongBook();
    }
}

async function requestWrongQuestionSolution(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    if (entry.solution) {
        toggleWrongSolution(id);
        return;
    }

    await generateWrongQuestionSolution(
        id,
        {
            expand: true,
            silent: false
        }
    );
}


function shouldShowWrongBookFeedback(item) {
    const text = String(item?.feedback || "").trim();

    if (!text) return false;

    if (
        item?.source === "manual"
        && (
            text.includes("加入错题本")
            || text.includes("完成订正后")
            || text.includes("手动加入")
        )
    ) {
        return false;
    }

    return true;
}

function renderWrongBook() {
    const list = document.getElementById("wrongBookList");
    if (!list) return;

    list.innerHTML = "";

    const allItems = [...learningState.wrongQuestions];
    const items = getFilteredWrongBookItems();

    updateWrongBookToolbar(allItems, items);

    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "wrong-empty";

        if (!allItems.length) {
            empty.textContent = "错题本还是空的。";
        } else if (wrongBookSearch) {
            empty.textContent = "没有找到匹配的错题。";
        } else if (wrongBookFilter === "pending") {
            empty.textContent = "目前没有待处理的错题。";
        } else if (wrongBookFilter === "corrected") {
            empty.textContent = "目前没有已完成订正但未通过复测的错题。";
        } else {
            empty.textContent = "目前还没有已通过复测的错题。";
        }

        list.appendChild(empty);
        return;
    }

    for (const item of items) {
        const card = document.createElement("div");
        card.className = "wrong-card";

        const top = document.createElement("div");
        top.className = "wrong-card-top";

        const statusInfo = wrongBookStatus(item);
        const status = document.createElement("span");
        status.className = [
            "wrong-status",
            statusInfo.className
        ]
            .filter(Boolean)
            .join(" ");
        status.textContent = statusInfo.text;

        const date = document.createElement("span");
        date.className = "wrong-date";
        date.textContent = formatLearningDate(item.updatedAt);

        top.appendChild(status);
        top.appendChild(date);

        const question = document.createElement("div");
        question.className = "wrong-question";
        question.innerHTML = markdownToHtml(item.question);

        const meta = document.createElement("div");
        meta.className = "wrong-meta";

        const appendMetaRow = (
            label,
            value,
            className = ""
        ) => {
            if (!value) return;

            const row = document.createElement("div");
            row.className = [
                "wrong-meta-row",
                className
            ]
                .filter(Boolean)
                .join(" ");

            const labelNode = document.createElement("span");
            labelNode.className = "wrong-meta-label";
            labelNode.textContent = label;

            const valueNode = document.createElement("span");
            valueNode.className = "wrong-meta-value";
            valueNode.textContent = value;

            row.appendChild(labelNode);
            row.appendChild(valueNode);
            meta.appendChild(row);
        };

        if (item.focusPoints.length) {
            appendMetaRow(
                "本次主要卡在",
                item.focusPoints.join("、"),
                "focus"
            );
        }

        if (item.knowledgePoints.length) {
            appendMetaRow(
                "整题涉及",
                item.knowledgePoints.join("、")
            );
        }

        if (item.mistakeCount > 1) {
            appendMetaRow(
                "错误记录",
                `${item.mistakeCount} 次`
            );
        }

        if (item.retestCount) {
            appendMetaRow(
                "复测情况",
                `${item.retestCount} 次，通过 ${item.retestPassCount} 次`
            );
        }

        const feedback = document.createElement("div");
        feedback.className = "wrong-feedback";

        if (shouldShowWrongBookFeedback(item)) {
            const prefixNode = document.createElement("strong");
            prefixNode.textContent = "最近反馈";

            const feedbackBody = document.createElement("div");
            feedbackBody.className = "wrong-feedback-body";
            feedbackBody.innerHTML = markdownToHtml(item.feedback);

            feedback.appendChild(prefixNode);
            feedback.appendChild(feedbackBody);
        }

        const note = document.createElement("div");
        note.className = "wrong-note";

        if (item.note) {
            const noteTitle = document.createElement("strong");
            noteTitle.textContent = "我的笔记：";

            const noteBody = document.createElement("div");
            noteBody.className = "wrong-note-body";
            noteBody.innerHTML = markdownToHtml(item.note);

            note.appendChild(noteTitle);
            note.appendChild(noteBody);
        }

        const retest = document.createElement("div");
        retest.className = "wrong-retest";

        if (item.lastRetestAt) {
            const resultText = item.lastRetestResult === "correct"
                ? "最近复测：通过"
                : (
                    item.lastRetestResult === "wrong"
                        ? "最近复测：未通过"
                        : "最近复测：尚未确认"
                );

            retest.textContent = resultText;
        }

        const solutionDetails = document.createElement("details");
        solutionDetails.className = "wrong-solution-details";
        solutionDetails.open = wrongSolutionExpandedIds.has(
            item.id
        );

        const solutionSummary = document.createElement("summary");
        solutionSummary.className = "wrong-solution-summary";

        if (wrongSolutionLoadingIds.has(item.id)) {
            solutionSummary.textContent = "答案与解析 · 正在生成";
        } else if (item.solution) {
            solutionSummary.textContent = "答案与解析";
        } else {
            solutionSummary.textContent = "答案与解析 · 点击生成";
        }

        const solutionInner = document.createElement("div");
        solutionInner.className = "wrong-solution-inner";

        if (item.referenceAnswer) {
            const answerBlock = document.createElement("div");
            answerBlock.className = "wrong-answer-hidden";

            const answerTitle = document.createElement("strong");
            answerTitle.textContent = "参考答案";

            const answerBody = document.createElement("div");
            answerBody.className = "wrong-answer-body";
            answerBody.innerHTML = markdownToHtml(
                item.referenceAnswer
            );

            answerBlock.appendChild(answerTitle);
            answerBlock.appendChild(answerBody);
            solutionInner.appendChild(answerBlock);
        }

        if (item.solution) {
            const solutionBlock = document.createElement("div");
            solutionBlock.className = "wrong-solution-body";
            solutionBlock.innerHTML = markdownToHtml(
                normalizeWrongSolutionMarkdown(
                    item.solution
                )
            );

            solutionInner.appendChild(solutionBlock);
        } else {
            const waiting = document.createElement("div");
            waiting.className = "wrong-solution-waiting";
            waiting.textContent = wrongSolutionLoadingIds.has(item.id)
                ? "正在后台生成答案与解析…"
                : "展开后会自动生成答案与解析。";

            solutionInner.appendChild(waiting);
        }

        solutionDetails.appendChild(solutionSummary);
        solutionDetails.appendChild(solutionInner);

        solutionDetails.addEventListener(
            "toggle",
            () => {
                if (solutionDetails.open) {
                    wrongSolutionExpandedIds.add(item.id);

                    if (
                        !item.solution
                        && !wrongSolutionLoadingIds.has(item.id)
                    ) {
                        queueWrongQuestionSolution(
                            item.id
                        );
                    }
                } else {
                    wrongSolutionExpandedIds.delete(item.id);
                }
            }
        );

        const actions = document.createElement("div");
        actions.className = "wrong-actions";

        if (!item.corrected) {
            const correctedButton = document.createElement("button");
            correctedButton.type = "button";
            correctedButton.textContent = "完成订正";
            correctedButton.onclick = () => (
                markWrongQuestionCorrected(item.id)
            );
            actions.appendChild(correctedButton);
        }

        const retestButton = document.createElement("button");
        retestButton.type = "button";
        retestButton.className = item.corrected || item.retestPassed
            ? ""
            : "secondary";
        retestButton.textContent = item.retestPassed
            ? "再测一次"
            : "再测一道";
        retestButton.disabled = !item.corrected && !item.retestPassed;
        retestButton.title = retestButton.disabled
            ? "先完成订正，再进行同知识点复测"
            : "生成一道同知识点、难度相近的新题进行验证";
        retestButton.onclick = () => (
            startWrongQuestionRetest(item.id)
        );
        actions.appendChild(retestButton);

        const hasOriginalSession = (
            item.sessionId !== null
            && sessions.some(
                session => String(session.id) === String(item.sessionId)
            )
        );

        if (hasOriginalSession) {
            const backButton = document.createElement("button");
            backButton.type = "button";
            backButton.className = "secondary";
            backButton.textContent = "回到原题";
            backButton.onclick = () => (
                openWrongQuestionSession(item.id)
            );
            actions.appendChild(backButton);
        }

        const hasRetestSession = (
            item.lastRetestSessionId !== null
            && sessions.some(
                session => String(session.id) === String(item.lastRetestSessionId)
            )
        );

        if (hasRetestSession) {
            const retestHistoryButton = document.createElement("button");
            retestHistoryButton.type = "button";
            retestHistoryButton.className = "secondary";
            retestHistoryButton.textContent = "查看最近复测";
            retestHistoryButton.onclick = () => (
                openWrongRetestSession(item.id)
            );
            actions.appendChild(retestHistoryButton);
        }

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary";
        editButton.textContent = "编辑/笔记";
        editButton.onclick = () => openWrongEdit(item.id);
        actions.appendChild(editButton);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "secondary danger";
        removeButton.textContent = "移出错题本";
        removeButton.onclick = () => (
            removeWrongQuestion(item.id)
        );
        actions.appendChild(removeButton);

        card.appendChild(top);
        card.appendChild(question);

        if (meta.textContent) {
            card.appendChild(meta);
        }

        if (feedback.textContent.trim()) {
            card.appendChild(feedback);
        }

        if (item.note) {
            card.appendChild(note);
        }

        if (retest.textContent) {
            card.appendChild(retest);
        }

        card.appendChild(solutionDetails);

        card.appendChild(actions);
        list.appendChild(card);

        renderMath(question);
        renderMath(feedback);
        renderMath(note);
        renderMath(solutionDetails);
    }
}


function getFriendlyCategory(value) {
    const text = String(value || "").trim();

    if (!text || text === "待识别") {
        return "暂时没判断出来";
    }

    return text;
}

function getFriendlyQuestionType(value) {
    const text = String(value || "").trim();

    if (!text) {
        return "综合问题";
    }

    if (text === "综合题") {
        return "综合问题";
    }

    if (text === "出题请求") {
        return "练习题需求";
    }

    if (text === "答案检查") {
        return "答案检查";
    }

    return text;
}

function getFriendlyMode(value) {
    const text = String(value || "").trim();

    if (!text || text === "提示引导") {
        return "先给思路和提示";
    }

    if (text === "完整解析") {
        return "直接讲完整解法";
    }

    if (text === "概念讲解") {
        return "先解释概念";
    }

    if (text === "练习出题") {
        return "给你出练习题";
    }

    if (text === "答案诊断") {
        return "帮你检查答案";
    }

    return text;
}

function getFriendlyConfidence(value) {
    const text = String(value || "").trim();

    if (!text || text === "低") {
        return "不太确定";
    }

    if (text === "中") {
        return "比较确定";
    }

    if (text === "高") {
        return "较确定";
    }

    return text;
}

function getFriendlyInputSource(value) {
    const text = String(value || "").trim();

    if (!text || text === "文本输入") {
        return "手动输入";
    }

    if (text === "图片识题") {
        return "图片识题";
    }

    return text;
}


// -----------------------------
// 本地持久化
// -----------------------------
function saveState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                sessions,
                currentId
            })
        );
    } catch (error) {
        console.warn("本地会话保存失败：", error);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.sessions)) {
            return false;
        }

        const loadedSessions = [];

        for (const session of data.sessions) {
            if (
                !session
                || typeof session !== "object"
                || !Array.isArray(session.messages)
            ) {
                continue;
            }

            const messages = [];

            for (const message of session.messages) {
                if (
                    !message
                    || typeof message !== "object"
                    || !["user", "ai"].includes(message.role)
                ) {
                    continue;
                }

                const text = typeof message.text === "string"
                    ? message.text
                    : String(message.text ?? "");

                if (!text.trim()) continue;

                messages.push({
                    role: message.role,
                    text,
                    source: message.source === "ocr" ? "ocr" : undefined,
                    apiText: typeof message.apiText === "string"
                        ? message.apiText
                        : undefined,
                    isRetestPrompt: Boolean(message.isRetestPrompt),
                    isRetestAnswer: Boolean(message.isRetestAnswer),
                    isError: Boolean(message.isError),
                    isNotice: Boolean(message.isNotice)
                });
            }

            loadedSessions.push({
                id: session.id,
                name: typeof session.name === "string" && session.name.trim()
                    ? session.name
                    : "新对话",
                messages,
                teaching: normalizeTeaching(session.teaching),
                learningQuestion: normalizeLearningQuestion(
                    session.learningQuestion
                ),
                retest: normalizeRetestSession(session.retest)
            });
        }

        sessions = loadedSessions;

        // 允许“零会话”作为一个合法的持久化状态。
        // 这样用户删除最后一个对话后，刷新页面也不会自动长回来。
        if (!sessions.length) {
            currentId = null;
            return true;
        }

        const savedIdExists = sessions.some(
            session => session.id === data.currentId
        );

        currentId = savedIdExists
            ? data.currentId
            : sessions[0].id;

        return true;

    } catch (error) {
        console.warn("本地会话读取失败：", error);
        return false;
    }
}


// -----------------------------
// Markdown / MathJax
// -----------------------------
function escapeRawHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function protectMathForMarkdown(source) {
    const mathSegments = [];

    const stash = match => {
        const index = mathSegments.length;
        mathSegments.push(match);
        return `MATHPROTECTTOKEN${index}ENDTOKEN`;
    };

    let protectedText = String(source ?? "");

    // 在 marked 解析 Markdown 之前先藏起公式。
    // 否则 _、*、\begin{cases} 等可能被 Markdown 当成强调语法。
    protectedText = protectedText.replace(
        /\$\$[\s\S]*?\$\$/g,
        stash
    );

    protectedText = protectedText.replace(
        /\\\[[\s\S]*?\\\]/g,
        stash
    );

    protectedText = protectedText.replace(
        /\\\([\s\S]*?\\\)/g,
        stash
    );

    protectedText = protectedText.replace(
        /\$(?!\$)(?:\\.|[^$\n])+\$/g,
        stash
    );

    return {
        protectedText,
        mathSegments
    };
}

function restoreMathAfterMarkdown(html, mathSegments) {
    let restored = String(html ?? "");

    for (let index = 0; index < mathSegments.length; index += 1) {
        const token = `MATHPROTECTTOKEN${index}ENDTOKEN`;
        const safeMath = escapeRawHtml(mathSegments[index]);

        restored = restored
            .split(token)
            .join(safeMath);
    }

    return restored;
}

function markdownToHtml(text) {
    const source = String(text ?? "");

    const {
        protectedText,
        mathSegments
    } = protectMathForMarkdown(source);

    const rawHtml = marked.parse(protectedText);

    const safeHtml = window.DOMPurify
        ? window.DOMPurify.sanitize(rawHtml)
        : marked.parse(escapeRawHtml(protectedText));

    return restoreMathAfterMarkdown(
        safeHtml,
        mathSegments
    );
}

function renderMath(target) {
    if (!window.MathJax || !MathJax.typesetPromise) {
        return;
    }

    MathJax.typesetPromise(
        target ? [target] : undefined
    ).catch(error => {
        console.warn("MathJax 渲染失败：", error);
    });
}

function isChatNearBottom(chat, threshold = 90) {
    if (!chat) return true;

    const distance = (
        chat.scrollHeight
        - chat.scrollTop
        - chat.clientHeight
    );

    return distance <= threshold;
}

function scrollChatToBottom() {
    const chat = document.getElementById("chat");

    if (chat) {
        chat.scrollTop = chat.scrollHeight;
    }
}

function handleChatScrollWhileTyping() {
    if (!typingTimer) return;

    const chat = document.getElementById("chat");
    if (!chat) return;

    typingAutoFollow = isChatNearBottom(
        chat,
        90
    );
}


function deriveSessionName(text, source = "text") {
    let value = String(text || "")
        .replace(/【题目文字】/g, "")
        .replace(/【图形信息】/g, "")
        .replace(/\[图片识题\]/g, "")
        .replace(/[#*_`>]/g, "")
        .trim();

    const firstUsefulLine = value
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(line => (
            line
            && !/^[-—=]{2,}$/.test(line)
        ));

    value = firstUsefulLine || value;

    if (!value) {
        return source === "ocr"
            ? "图片识题"
            : "新对话";
    }

    value = value
        .replace(/\s+/g, " ")
        .replace(/^题目[:：]\s*/, "")
        .trim();

    const maxLength = 15;

    return value.length > maxLength
        ? `${value.slice(0, maxLength)}…`
        : value;
}

function maybeAutoNameSession(
    session,
    text,
    source = "text"
) {
    if (
        !session
        || session.name !== "新对话"
    ) {
        return false;
    }

    const name = deriveSessionName(
        text,
        source
    );

    if (!name || name === "新对话") {
        return false;
    }

    session.name = name;
    return true;
}

function refreshUnnamedSessionNames() {
    let changed = false;

    for (const session of sessions) {
        if (
            session.name !== "新对话"
            || !Array.isArray(session.messages)
        ) {
            continue;
        }

        const firstUser = session.messages.find(
            message => (
                message
                && message.role === "user"
                && typeof message.text === "string"
                && message.text.trim()
            )
        );

        if (
            firstUser
            && maybeAutoNameSession(
                session,
                firstUser.text,
                firstUser.source || "text"
            )
        ) {
            changed = true;
        }
    }

    if (changed) {
        saveState();
    }
}


// -----------------------------
// 新对话
// -----------------------------
function newChat() {
    if (typingTimer) {
        forceCompleteTyping();
    }

    const id = makeSessionId();

    sessions.push({
        id,
        name: "新对话",
        messages: [],
        teaching: null,
        learningQuestion: null,
        retest: null
    });

    currentId = id;

    saveState();
    renderAll();
}


// -----------------------------
// 发送聊天
// -----------------------------
function buildApiMessages(session) {
    return session.messages
        .filter(message => !message.isError && !message.isNotice)
        .slice(-16)
        .map(message => {
            let content = (
                message.role === "user"
                && typeof message.apiText === "string"
                && message.apiText.trim()
            )
                ? message.apiText
                : message.text;

            if (
                message.role === "user"
                && message.source === "ocr"
            ) {
                content = `[图片识题]\n${content}`;
            }

            return {
                role: message.role === "user"
                    ? "user"
                    : "assistant",
                content
            };
        });
}

async function parseResponseJson(response) {
    try {
        return await response.json();
    } catch (_error) {
        return {};
    }
}

function fallbackHttpError(status) {
    if (status === 400) {
        return "请求内容有误，请检查后重新发送。";
    }
    if (status === 413) {
        return "上传内容过大，请重新选择。";
    }
    if (status === 429) {
        return "当前请求过于频繁，请稍后再试。";
    }
    if (status >= 500) {
        return "服务暂时不可用，请稍后重试。";
    }

    return "请求失败，请稍后重试。";
}

async function requestAiReply(session) {
    if (!session) return;

    setBusy(true);

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: buildApiMessages(session)
            })
        });

        const data = await parseResponseJson(response);

        if (data.teaching) {
            session.teaching = normalizeTeaching(data.teaching);
            saveState();
            renderInfo();
        }

        if (!response.ok || data.error) {
            const message = data.error
                || fallbackHttpError(response.status);

            rollbackRetestAfterRequestFailure(session);

            showAssistantMessage(
                session,
                message,
                { isError: true }
            );
            return;
        }

        if (
            typeof data.reply !== "string"
            || !data.reply.trim()
        ) {
            rollbackRetestAfterRequestFailure(session);

            showAssistantMessage(
                session,
                "AI 服务没有返回有效内容，请重新发送。",
                { isError: true }
            );
            return;
        }

        const retestHandled = processWrongQuestionRetestReply(
            session,
            data.reply
        );

        if (!retestHandled) {
            processLearningFromReply(
                session,
                session.teaching,
                data.reply
            );
        }

        if (currentId === session.id) {
            startTyping(
                data.reply,
                session
            );
        } else {
            addAssistantMessage(
                session,
                data.reply
            );
            saveState();
            renderSessions();
            renderInfo();
        }

    } catch (error) {
        console.error("聊天请求失败：", error);

        rollbackRetestAfterRequestFailure(session);

        showAssistantMessage(
            session,
            "网络连接失败，请检查网络后重试。",
            { isError: true }
        );

    } finally {
        setBusy(false);
    }
}

function send() {
    if (typingTimer || requestBusy) {
        return;
    }

    const input = document.getElementById("text");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!currentId) {
        newChat();
    }

    const session = getCurrent();
    if (!session) return;

    const message = {
        role: "user",
        text
    };

    const retest = normalizeRetestSession(session.retest);

    if (retest && retest.stage === "awaiting_answer") {
        message.apiText = [
            "【错题复测回答】",
            "这是我的答案，请严格检查是否正确。",
            "如果全部正确，请明确说“这次作答正确”；",
            "如果存在任何实质错误，请明确说“这次作答有错误”。",
            "",
            text
        ].join("\n");
        message.isRetestAnswer = true;

        retest.stage = "checking";
        session.retest = retest;
    }

    session.messages.push(message);

    maybeAutoNameSession(
        session,
        text,
        "text"
    );

    input.value = "";

    saveState();
    renderChat();
    renderSessions();
    renderInfo();

    requestAiReply(session);
}


// -----------------------------
// 图片题文字清理
// -----------------------------
function cleanOcrTextForVisual(rawText, hasVisualStructure) {
    const source = String(rawText ?? "").trim();

    // 没有图形结构识别结果时，保留 OCR 原文，避免误删。
    if (!source || !hasVisualStructure) {
        return source;
    }

    // 找第一道小题的编号，例如 (1)、（1）、1.、1、
    const questionMatch = source.match(
        /(?:\(\s*1\s*\)|（\s*1\s*）|(?:^|\s)1\s*[.．、])/m
    );

    if (!questionMatch || typeof questionMatch.index !== "number") {
        return source;
    }

    const questionIndex = questionMatch.index;
    const beforeQuestions = source.slice(0, questionIndex);
    const questions = source.slice(questionIndex).trim();

    // 这类提示语后面通常紧跟题图。OCR 会把图中的 v1、e1、e2……
    // 当成普通文字塞进题干。既然视觉模型已经单独识别了图形结构，
    // 就把“提示语 → 第(1)问”之间的图形 OCR 噪声去掉。
    const cues = [
        "回答下列问题",
        "回答以下问题",
        "完成下列问题",
        "解答下列问题",
        "求解下列问题",
        "回答问题"
    ];

    let bestEnd = -1;

    for (const cue of cues) {
        const index = beforeQuestions.lastIndexOf(cue);

        if (index >= 0) {
            bestEnd = Math.max(bestEnd, index + cue.length);
        }
    }

    if (bestEnd < 0) {
        return source;
    }

    const heading = beforeQuestions
        .slice(0, bestEnd)
        .trim()
        .replace(/[：:]\s*$/, "");

    if (!heading || !questions) {
        return source;
    }

    return `${heading}\n${questions}`;
}


// -----------------------------
// OCR 图片识题
// -----------------------------
function openImagePicker() {
    if (typingTimer || requestBusy) {
        return;
    }

    const imageInput = document.getElementById("imageInput");
    if (imageInput) {
        imageInput.click();
    }
}

async function handleImageSelected(event) {
    const input = event && event.target;
    const file = input && input.files
        ? input.files[0]
        : null;

    if (input) {
        // 允许连续选择同一张图片。
        input.value = "";
    }

    if (!file || typingTimer || requestBusy) {
        return;
    }

    if (
        file.type
        && !file.type.startsWith("image/")
    ) {
        showCurrentError(
            "请选择有效的图片文件。"
        );
        return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
        showCurrentError(
            "图片过大，请上传 8MB 以内的图片。"
        );
        return;
    }

    if (!currentId) {
        newChat();
    }

    const session = getCurrent();
    if (!session) return;

    setBusy(true);

    try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/ocr", {
            method: "POST",
            body: formData
        });

        const data = await parseResponseJson(response);

        if (!response.ok || data.error) {
            showAssistantMessage(
                session,
                data.error
                    || fallbackHttpError(response.status),
                { isError: true }
            );
            return;
        }

        const rawText = typeof data.text === "string"
            ? data.text.trim()
            : "";

        const visualText = typeof data.visual_text === "string"
            ? data.visual_text.trim()
            : "";

        const text = cleanOcrTextForVisual(
            rawText,
            Boolean(visualText)
        );

        if (!text && !visualText) {
            showAssistantMessage(
                session,
                "没有识别到有效的题目内容，请重新拍摄或裁剪图片。",
                { isError: true }
            );
            return;
        }

        const parts = [];

        if (text) {
            parts.push(`【题目文字】\n${text}`);
        }

        if (visualText) {
            parts.push(`【图形信息】\n${visualText}`);
        }

        const combinedText = parts.join("\n\n");

        session.messages.push({
            role: "user",
            text: combinedText,
            source: "ocr"
        });

        maybeAutoNameSession(
            session,
            text || visualText || "图片识题",
            "ocr"
        );

        if (
            typeof data.warning === "string"
            && data.warning.trim()
        ) {
            session.messages.push({
                role: "ai",
                text: `识别提示：${data.warning.trim()}`,
                isNotice: true
            });
        }

        saveState();
        renderChat();
        renderSessions();
        renderInfo();

    } catch (error) {
        console.error("OCR 请求失败：", error);

        showAssistantMessage(
            session,
            "图片识别请求失败，请检查网络后重试。",
            { isError: true }
        );
        return;

    } finally {
        setBusy(false);
    }

    // OCR 完成后自动把识别结果交给 AI。
    // 后端 SYSTEM_PROMPT 会把“图片识题”默认处理为提示优先。
    await requestAiReply(session);
}


function looksLikeChatQuestionText(text) {
    const value = String(text || "").trim();

    if (!value) return false;

    if (
        /【题目文字】|\[图片识题\]|【图形信息】/.test(value)
    ) {
        return true;
    }

    if (splitQuestionBankText(value).length) {
        return true;
    }

    if (isShortLearningFollowUp(value)) {
        return false;
    }

    const strongSignals = [
        "已知",
        "给定",
        "设",
        "求",
        "求解",
        "证明",
        "计算",
        "判断",
        "写出",
        "列出",
        "下列",
        "回答下列",
        "选择题",
        "填空题",
        "证明题",
        "计算题"
    ];

    if (
        strongSignals.some(signal => value.includes(signal))
        && value.length >= 8
    ) {
        return true;
    }

    if (
        /[（(]\s*\d+\s*[)）]/.test(value)
        && value.length >= 20
    ) {
        return true;
    }

    if (
        /[？?]\s*$/.test(value)
        && /(命题|公式|集合|关系|函数|图|矩阵|树|通路|回路|欧拉|哈密顿|递推|组合|群|环|域)/.test(value)
    ) {
        return true;
    }

    return false;
}

function looksLikeAiGeneratedQuestion(
    text,
    previousUserText = ""
) {
    const value = String(text || "").trim();

    if (!value) return false;

    const explicitHeading = /【题目】|【练习题】/.test(
        value
    );

    const metaOnlyPatterns = [
        /我可以帮你出题/,
        /我先确认一下/,
        /先确认一下/,
        /告诉我.*(?:方向|章节|知识点)/,
        /你(?:希望|想要).*(?:方向|章节|知识点)/,
        /你选哪个/,
        /可以从以下.*选/,
        /从以下.*选择/
    ];

    if (
        !explicitHeading
        && metaOnlyPatterns.some(pattern => pattern.test(value))
    ) {
        return false;
    }

    if (
        !explicitHeading
        && !isExerciseRequestText(previousUserText)
    ) {
        return false;
    }

    const extracted = extractAiGeneratedExerciseText(
        value
    );

    return Boolean(
        explicitHeading
        || looksLikeChatQuestionText(extracted)
    );
}


function previousUserMessageBefore(session, messageIndex) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    for (let index = messageIndex - 1; index >= 0; index -= 1) {
        const message = session.messages[index];

        if (
            message
            && message.role === "user"
            && typeof message.text === "string"
            && message.text.trim()
        ) {
            return message;
        }
    }

    return null;
}

function canMessageBeWrongQuestion(session, messageIndex, message) {
    if (
        !session
        || !message
        || message.isError
        || message.isNotice
        || typeof message.text !== "string"
        || !message.text.trim()
    ) {
        return false;
    }

    if (message.role === "user") {
        return Boolean(
            message.source === "ocr"
            || looksLikeChatQuestionText(message.text)
        );
    }

    if (message.role === "ai") {
        const previousUser = previousUserMessageBefore(
            session,
            messageIndex
        );

        return looksLikeAiGeneratedQuestion(
            message.text,
            previousUser?.text || ""
        );
    }

    return false;
}

function questionInfoFromChatMessage(session, messageIndex) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    const message = session.messages[messageIndex];

    if (
        !message
        || !canMessageBeWrongQuestion(
            session,
            messageIndex,
            message
        )
    ) {
        return null;
    }

    const teaching = normalizeTeaching(session.teaching);
    const saved = normalizeLearningQuestion(
        session.learningQuestion
    );

    let text = message.text.trim();
    let source = message.source === "ocr"
        ? "ocr"
        : "text";

    if (message.role === "ai") {
        text = extractAiGeneratedExerciseText(
            message.text
        ) || message.text.trim();

        source = "ai";
    }

    const savedMatches = Boolean(
        saved
        && (
            wrongQuestionFingerprint(saved.text)
            === wrongQuestionFingerprint(text)
        )
    );

    const isRecent = (
        messageIndex >= session.messages.length - 2
    );

    return {
        text,
        knowledgePoints: savedMatches
            ? saved.knowledgePoints
            : (
                isRecent
                    ? (teaching?.knowledge_points || []).slice(0, 4)
                    : []
            ),
        focusPoints: savedMatches
            ? saved.focusPoints
            : (
                isRecent
                    ? (teaching?.focus_points || []).slice(0, 2)
                    : []
            ),
        category: savedMatches
            ? saved.category
            : (
                isRecent
                    ? (teaching?.category || "")
                    : ""
            ),
        source,
        referenceAnswer: savedMatches
            ? saved.referenceAnswer
            : "",
        sessionId: session.id,
        updatedAt: Date.now()
    };
}

function markChatMessageAsWrong(sessionId, messageIndex) {
    const session = sessions.find(
        item => String(item.id) === String(sessionId)
    );

    if (!session) return;

    const questionInfo = questionInfoFromChatMessage(
        session,
        messageIndex
    );

    if (!questionInfo) {
        window.alert("这条消息不像一道可记录的题目。");
        return;
    }

    const choices = splitQuestionBankText(
        questionInfo.text
    );

    if (
        choices.length
        && openWrongQuestionPicker(
            questionInfo,
            choices
        )
    ) {
        return;
    }

    addQuestionInfoToWrongBook(questionInfo);
    renderLearningSummary();
}

function deleteChatMessage(sessionId, messageIndex) {
    const session = sessions.find(
        item => String(item.id) === String(sessionId)
    );

    if (
        !session
        || !Array.isArray(session.messages)
        || !session.messages[messageIndex]
    ) {
        return;
    }

    const confirmed = window.confirm(
        "删除这条消息吗？\n\n只删除聊天中的这条消息；已经加入错题本的内容不会被删除。"
    );

    if (!confirmed) return;

    const chat = document.getElementById("chat");

    if (chat) {
        preserveChatScrollOnce = chat.scrollTop;
    }

    const removed = session.messages[messageIndex];

    session.messages.splice(
        messageIndex,
        1
    );

    const learningQuestion = normalizeLearningQuestion(
        session.learningQuestion
    );

    if (learningQuestion) {
        const removedText = removed.role === "ai"
            ? (
                extractAiGeneratedExerciseText(
                    removed.text
                ) || removed.text
            )
            : removed.text;

        if (
            wrongQuestionFingerprint(learningQuestion.text)
            === wrongQuestionFingerprint(removedText)
        ) {
            session.learningQuestion = null;
        }
    }

    saveState();
    renderChat();
    renderSessions();
    renderInfo();
    renderLearningSummary();
}


// -----------------------------
// AI 消息与打字效果
// -----------------------------
function addAssistantMessage(
    session,
    text,
    meta = {}
) {
    if (!session || !text) return;

    session.messages.push({
        role: "ai",
        text,
        isError: Boolean(meta.isError),
        isNotice: Boolean(meta.isNotice)
    });
}

function showAssistantMessage(
    session,
    text,
    meta = {}
) {
    if (!session) return;

    if (currentId === session.id && !typingTimer) {
        startTyping(text, session, meta);
        return;
    }

    addAssistantMessage(
        session,
        text,
        meta
    );

    saveState();
    renderAll();
}

function showCurrentError(text) {
    let session = getCurrent();

    if (!session) {
        newChat();
        session = getCurrent();
    }

    showAssistantMessage(
        session,
        text,
        { isError: true }
    );
}

function startTyping(
    text,
    session,
    meta = {}
) {
    if (!session || !text) return;

    if (currentId !== session.id) {
        addAssistantMessage(
            session,
            text,
            meta
        );
        saveState();
        return;
    }

    if (typingTimer) {
        forceCompleteTyping();
    }

    typingFullText = text;
    typingSessionId = session.id;
    typingMeta = {
        isError: Boolean(meta.isError),
        isNotice: Boolean(meta.isNotice)
    };

    const chat = document.getElementById("chat");
    if (!chat) return;

    typingAutoFollow = isChatNearBottom(
        chat,
        90
    );

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    typingDiv = div;

    enableInput(false);

    let index = 0;

    typingTimer = setInterval(() => {
        if (!typingDiv) {
            clearInterval(typingTimer);
            typingTimer = null;
            return;
        }

        if (index < text.length) {
            typingDiv.textContent += text[index];
            index += 1;

            if (typingAutoFollow) {
                scrollChatToBottom();
            }

            return;
        }

        clearInterval(typingTimer);

        // 修复旧版核心 Bug：
        // 正常打字结束后必须清空 typingTimer，
        // 否则 send() 会永远认为仍在打字。
        typingTimer = null;

        finishTyping();
    }, 10);
}

function finishTyping() {
    const session = sessions.find(
        item => item.id === typingSessionId
    );

    if (typingDiv) {
        typingDiv.innerHTML =
            `<div class="ai-content">${markdownToHtml(typingFullText)}</div>`;
    }

    if (session) {
        addAssistantMessage(
            session,
            typingFullText,
            typingMeta || {}
        );
    }

    const finishedDiv = typingDiv;

    typingFullText = "";
    typingDiv = null;
    typingSessionId = null;
    typingMeta = null;

    saveState();

    renderSessions();
    renderInfo();

    if (!requestBusy) {
        enableInput(true);
    }

    if (finishedDiv) {
        renderMath(finishedDiv);
    }

    if (typingAutoFollow) {
        scrollChatToBottom();
    }

    typingAutoFollow = true;
}

// 强制完成当前打字动画
function forceCompleteTyping() {
    if (!typingTimer) {
        return;
    }

    clearInterval(typingTimer);
    typingTimer = null;

    const session = sessions.find(
        item => item.id === typingSessionId
    );

    if (typingDiv) {
        typingDiv.innerHTML =
            `<div class="ai-content">${markdownToHtml(typingFullText)}</div>`;
    }

    if (session) {
        addAssistantMessage(
            session,
            typingFullText,
            typingMeta || {}
        );
    }

    const finishedDiv = typingDiv;

    typingFullText = "";
    typingDiv = null;
    typingSessionId = null;
    typingMeta = null;

    saveState();

    renderSessions();
    renderInfo();

    if (!requestBusy) {
        enableInput(true);
    }

    if (finishedDiv) {
        renderMath(finishedDiv);
    }

    if (typingAutoFollow) {
        scrollChatToBottom();
    }

    typingAutoFollow = true;
}


// -----------------------------
// 渲染聊天
// -----------------------------
function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) return;

    if (
        window.MathJax
        && typeof MathJax.typesetClear === "function"
    ) {
        try {
            MathJax.typesetClear([chat]);
        } catch (error) {
            console.warn("MathJax 清理旧公式失败：", error);
        }
    }

    chat.innerHTML = "";

    const session = getCurrent();

    if (!session) {
        chat.innerHTML =
            '<div class="empty-tip">暂无对话</div>';
        return;
    }

    for (
        let messageIndex = 0;
        messageIndex < session.messages.length;
        messageIndex += 1
    ) {
        const message = session.messages[messageIndex];

        const div = document.createElement("div");
        div.className =
            "msg " + (
                message.role === "user"
                    ? "user"
                    : "ai"
            );

        const content = document.createElement("div");
        content.className = "msg-content";

        if (message.role === "user") {
            content.textContent = message.text;
            content.style.whiteSpace = "pre-wrap";
        } else {
            content.innerHTML =
                `<div class="ai-content">${markdownToHtml(message.text)}</div>`;
        }

        div.appendChild(content);

        const actions = document.createElement("div");
        actions.className = "msg-actions";

        if (
            canMessageBeWrongQuestion(
                session,
                messageIndex,
                message
            )
        ) {
            const wrongButton = document.createElement("button");
            wrongButton.type = "button";
            wrongButton.textContent = "记为错题";
            wrongButton.title = "把这一条题目加入错题本";
            wrongButton.onclick = () => (
                markChatMessageAsWrong(
                    session.id,
                    messageIndex
                )
            );

            actions.appendChild(wrongButton);
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger";
        deleteButton.textContent = "删除";
        deleteButton.title = "删除这一条聊天消息";
        deleteButton.onclick = () => (
            deleteChatMessage(
                session.id,
                messageIndex
            )
        );

        actions.appendChild(deleteButton);

        div.appendChild(actions);
        chat.appendChild(div);
    }

    if (
        preserveChatScrollOnce !== null
        && Number.isFinite(preserveChatScrollOnce)
    ) {
        chat.scrollTop = preserveChatScrollOnce;
        preserveChatScrollOnce = null;
    } else {
        scrollChatToBottom();
    }

    renderMath(chat);
}


// -----------------------------
// 会话列表
// -----------------------------
function renderSessions() {
    const box = document.getElementById("sessions");
    if (!box) return;

    refreshUnnamedSessionNames();
    box.innerHTML = "";

    for (const session of sessions) {
        const isCurrent = (
            String(session.id) === String(currentId)
        );

        const div = document.createElement("div");
        div.className = isCurrent
            ? "session active"
            : "session";

        if (isCurrent) {
            div.setAttribute(
                "aria-current",
                "true"
            );
        }

        const span = document.createElement("span");
        span.innerText = session.name;
        span.title = session.name;

        span.onclick = () => {
            if (typingTimer) {
                forceCompleteTyping();
            }

            currentId = session.id;
            saveState();
            renderAll();
        };

        span.ondblclick = () => {
            if (typingTimer) {
                forceCompleteTyping();
            }

            const name = prompt(
                "修改名称：",
                session.name
            );

            if (
                typeof name === "string"
                && name.trim()
            ) {
                session.name = name.trim();
                saveState();
                renderSessions();
                renderInfo();
            }
        };

        const currentBadge = document.createElement("small");
        currentBadge.className = "session-current";
        currentBadge.textContent = "当前";

        const del = document.createElement("button");
        del.className = "del";
        del.type = "button";
        del.textContent = "×";
        del.title = "删除这个对话";

        del.onclick = event => {
            event.stopPropagation();

            const confirmed = window.confirm(
                "确定删除这段对话吗？\n\n这段对话产生的学习统计会同步删除；已经加入错题本的题目仍会保留。"
            );

            if (!confirmed) {
                return;
            }

            if (typingTimer) {
                forceCompleteTyping();
            }

            removeLearningEventsForSession(
                session.id
            );

            sessions = sessions.filter(
                item => item.id !== session.id
            );

            if (currentId === session.id) {
                currentId = sessions.length
                    ? sessions[0].id
                    : null;
            }

            // 删除最后一个会话时保持空列表，不自动补一个“新对话”。
            // 下一次真正发送文字或上传图片时，send()/handleImageSelected()
            // 会按需调用 newChat() 创建会话。
            if (!sessions.length) {
                currentId = null;
            }

            saveState();
            renderAll();
        };

        div.appendChild(span);

        if (isCurrent) {
            div.appendChild(currentBadge);
        }

        div.appendChild(del);
        box.appendChild(div);
    }
}


function uniqueTextList(list, limit = 6) {
    return [
        ...new Set(
            (Array.isArray(list) ? list : [])
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
        )
    ].slice(0, limit);
}

function normalizeKnowledgeGraphData(data) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const nodes = Array.isArray(data.nodes)
        ? data.nodes
            .filter(node => node && typeof node === "object")
            .map(node => ({
                id: typeof node.id === "string" && node.id.trim()
                    ? node.id.trim()
                    : "",
                name: typeof node.name === "string" && node.name.trim()
                    ? node.name.trim()
                    : "",
                category: typeof node.category === "string" && node.category.trim()
                    ? node.category.trim()
                    : "未分类",
                prerequisites: uniqueTextList(node.prerequisites, 8)
            }))
            .filter(node => node.id && node.name)
        : [];

    return {
        version: Number.isFinite(data.version)
            ? data.version
            : 1,
        title: typeof data.title === "string" && data.title.trim()
            ? data.title.trim()
            : "离散数学知识图谱",
        description: typeof data.description === "string"
            ? data.description.trim()
            : "",
        nodes
    };
}

function readInitialKnowledgeGraphData() {
    const element = document.getElementById(
        "knowledgeGraphData"
    );

    if (!element) {
        return null;
    }

    try {
        return JSON.parse(
            element.textContent || "{}"
        );
    } catch (error) {
        console.warn(
            "知识图谱初始数据解析失败：",
            error
        );
        return null;
    }
}

async function ensureKnowledgeGraphData() {
    if (knowledgeGraphData) {
        return knowledgeGraphData;
    }

    if (knowledgeGraphLoading) {
        return null;
    }

    knowledgeGraphLoading = true;

    try {
        // 唯一数据源是 knowledge_graph.json。
        // Flask 在首页渲染时把同一份数据注入页面，
        // 无额外 fetch，也不会出现前后端两份图谱不同步。
        knowledgeGraphData = normalizeKnowledgeGraphData(
            readInitialKnowledgeGraphData()
        );

        if (
            !knowledgeGraphData
            || !knowledgeGraphData.nodes.length
        ) {
            throw new Error("知识图谱数据为空。");
        }

        return knowledgeGraphData;
    } catch (error) {
        console.warn("知识图谱加载失败：", error);
        knowledgeGraphData = null;
        throw error;
    } finally {
        knowledgeGraphLoading = false;
    }
}

function getKnowledgeGraphCategories() {
    if (!knowledgeGraphData) return [];

    return [
        ...new Set(
            knowledgeGraphData.nodes.map(
                node => node.category
            )
        )
    ].sort((a, b) => a.localeCompare(
        b,
        "zh-Hans-CN"
    ));
}

function getCurrentKnowledgeContext() {
    const session = getCurrent();
    const teaching = normalizeTeaching(
        session?.teaching
    );
    const learningQuestion = currentLearningQuestion(
        session,
        teaching
    );

    const focusPoints = uniqueTextList([
        ...(teaching?.focus_points || []),
        ...(learningQuestion?.focusPoints || [])
    ], 2);

    const knowledgePoints = uniqueTextList([
        ...(teaching?.knowledge_points || []),
        ...(learningQuestion?.knowledgePoints || [])
    ], 6);

    const prerequisitePoints = uniqueTextList(
        teaching?.prerequisite_points || [],
        6
    );

    const knowledgePath = uniqueTextList(
        teaching?.knowledge_path || [],
        10
    );

    return {
        category: teaching?.category
            || learningQuestion?.category
            || "",
        focusPoints,
        knowledgePoints,
        prerequisitePoints,
        knowledgePath
    };
}

function fillKnowledgeGraphCategoryOptions() {
    const select = document.getElementById(
        "knowledgeGraphCategory"
    );

    if (!select || !knowledgeGraphData) return;

    const categories = getKnowledgeGraphCategories();

    if (
        !knowledgeGraphFilter
        || !categories.includes(knowledgeGraphFilter)
    ) {
        knowledgeGraphFilter = categories[0] || "";
    }

    select.innerHTML = "";

    for (const value of categories) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = value === knowledgeGraphFilter;
        select.appendChild(option);
    }
}

function findKnowledgeGraphNodeById(nodeId) {
    if (
        !knowledgeGraphData
        || !Array.isArray(knowledgeGraphData.nodes)
    ) {
        return null;
    }

    return knowledgeGraphData.nodes.find(
        node => node.id === nodeId
    ) || null;
}

function findKnowledgeGraphNodeByName(name) {
    if (
        !knowledgeGraphData
        || !Array.isArray(knowledgeGraphData.nodes)
    ) {
        return null;
    }

    return knowledgeGraphData.nodes.find(
        node => node.name === name
    ) || null;
}

function ensureKnowledgeGraphSelection(visibleNodes, context) {
    const ids = new Set(
        (Array.isArray(visibleNodes) ? visibleNodes : [])
            .map(node => node.id)
    );

    if (
        knowledgeGraphSelectedNodeId
        && ids.has(knowledgeGraphSelectedNodeId)
    ) {
        return;
    }

    const preferredNames = [
        ...(context?.focusPoints || []),
        ...(context?.knowledgePath || []),
        ...(context?.knowledgePoints || []),
        ...(context?.prerequisitePoints || [])
    ];

    for (const name of preferredNames) {
        const node = (visibleNodes || []).find(
            item => item.name === name
        );

        if (node) {
            knowledgeGraphSelectedNodeId = node.id;
            return;
        }
    }

    knowledgeGraphSelectedNodeId = visibleNodes?.[0]?.id || "";
}

function openKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (!modal) return;

    modal.classList.remove("hidden");
    renderKnowledgeGraphLoading(
        "知识图谱加载中…"
    );

    ensureKnowledgeGraphData()
        .then(() => {
            const context = getCurrentKnowledgeContext();
            const categories = getKnowledgeGraphCategories();

            if (
                context.category
                && categories.includes(context.category)
            ) {
                knowledgeGraphFilter = context.category;
                knowledgeGraphViewMode = "focus";
            } else if (
                !knowledgeGraphFilter
                || !categories.includes(knowledgeGraphFilter)
            ) {
                knowledgeGraphFilter = categories[0] || "";
                knowledgeGraphViewMode = "full";
            }

            fillKnowledgeGraphCategoryOptions();
            updateKnowledgeGraphModeButton();
            renderKnowledgeGraph();
        })
        .catch(() => {
            renderKnowledgeGraphLoading(
                "知识图谱暂时加载失败，请稍后重试。"
            );
        });
}

function closeKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (modal) {
        modal.classList.add("hidden");
    }
}

function renderKnowledgeGraphLoading(message) {
    const summary = document.getElementById(
        "knowledgeGraphSummary"
    );
    const canvas = document.getElementById(
        "knowledgeGraphCanvas"
    );
    const detailTitle = document.getElementById(
        "knowledgeGraphDetailTitle"
    );
    const detail = document.getElementById(
        "knowledgeGraphDetail"
    );

    if (summary) {
        summary.textContent = (
            "这里会把当前题目的知识点关系和学习记录画成可视化图谱。"
        );
    }

    if (canvas) {
        canvas.innerHTML = `<div class="kg-empty">${message}</div>`;
    }

    if (detailTitle) {
        detailTitle.textContent = "节点详情";
    }

    if (detail) {
        detail.textContent = (
            "点击左侧节点后，这里会显示相关知识和你的学习记录。"
        );
    }
}

function setKnowledgeGraphFilter(value) {
    const next = String(value || "").trim();

    if (!next) return;

    knowledgeGraphFilter = next;

    const context = getCurrentKnowledgeContext();

    // 用户主动切换到别的模块时，默认展示这个模块的完整结构。
    // 切回当前题目所在模块，则仍保持当前视图模式。
    if (next !== context.category) {
        knowledgeGraphViewMode = "full";
    }

    updateKnowledgeGraphModeButton();
    renderKnowledgeGraph();
}

function updateKnowledgeGraphModeButton() {
    const button = document.getElementById(
        "knowledgeGraphFocusBtn"
    );

    if (!button) return;

    if (knowledgeGraphViewMode === "focus") {
        button.textContent = "查看完整模块";
        button.title = "展开当前模块的全部知识点";
    } else {
        button.textContent = "聚焦当前题目";
        button.title = "只显示与当前题目直接相关的知识点";
    }
}

function focusKnowledgeGraphOnCurrent() {
    if (!knowledgeGraphData) return;

    const context = getCurrentKnowledgeContext();
    const categories = getKnowledgeGraphCategories();

    if (knowledgeGraphViewMode === "focus") {
        knowledgeGraphViewMode = "full";
        updateKnowledgeGraphModeButton();
        renderKnowledgeGraph();
        return;
    }

    if (
        context.category
        && categories.includes(context.category)
    ) {
        knowledgeGraphFilter = context.category;
    } else {
        const relatedName = (
            context.focusPoints[0]
            || context.knowledgePoints[0]
            || context.prerequisitePoints[0]
            || ""
        );

        const relatedNode = relatedName
            ? findKnowledgeGraphNodeByName(relatedName)
            : null;

        if (relatedNode) {
            knowledgeGraphFilter = relatedNode.category;
        }
    }

    const currentNodeName = (
        context.focusPoints[0]
        || context.knowledgePoints[0]
        || context.prerequisitePoints[0]
        || ""
    );

    if (currentNodeName) {
        const node = findKnowledgeGraphNodeByName(
            currentNodeName
        );

        if (node) {
            knowledgeGraphSelectedNodeId = node.id;
        }
    }

    knowledgeGraphViewMode = "focus";
    fillKnowledgeGraphCategoryOptions();
    updateKnowledgeGraphModeButton();
    renderKnowledgeGraph();
}


function knowledgeGraphNodeState(nodeName, context) {
    if (context?.focusPoints?.includes(nodeName)) {
        return {
            key: "focus",
            label: "当前卡点",
            fill: "#1d4ed8",
            stroke: "#93c5fd",
            text: "#ffffff",
            badge: "卡点"
        };
    }

    if (context?.knowledgePoints?.includes(nodeName)) {
        return {
            key: "current",
            label: "本题相关",
            fill: "#5b21b6",
            stroke: "#c4b5fd",
            text: "#ffffff",
            badge: "本题"
        };
    }

    return {
        key: "neutral",
        label: "",
        fill: "#111827",
        stroke: "#475569",
        text: "#ffffff",
        badge: ""
    };
}


function splitKnowledgeGraphLabel(text, maxChars = 7) {
    const value = String(text || "").trim();

    if (!value) return [""];

    const lines = [];

    for (let index = 0; index < value.length; index += maxChars) {
        lines.push(
            value.slice(index, index + maxChars)
        );
    }

    return lines.slice(0, 2);
}

function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        tag
    );

    for (const [key, value] of Object.entries(attrs)) {
        if (
            value !== undefined
            && value !== null
        ) {
            element.setAttribute(
                key,
                String(value)
            );
        }
    }

    return element;
}

function knowledgeGraphFocusedNodes(category, context) {
    const categoryNodes = knowledgeGraphVisibleNodes(
        category
    );

    if (!categoryNodes.length) {
        return [];
    }

    const byName = new Map(
        categoryNodes.map(node => [node.name, node])
    );

    const currentNames = uniqueTextList([
        ...(context?.focusPoints || []),
        ...(context?.knowledgePoints || []),
        ...(context?.prerequisitePoints || []),
        ...(context?.knowledgePath || [])
    ], 10)
        .filter(name => byName.has(name));

    if (!currentNames.length) {
        return categoryNodes;
    }

    const included = new Set(currentNames);

    // 所有当前相关节点补一层直接前置。
    for (const name of currentNames) {
        const node = byName.get(name);

        for (const prerequisite of node?.prerequisites || []) {
            if (byName.has(prerequisite)) {
                included.add(prerequisite);
            }
        }
    }

    // 当前“主要卡点”再补一层直接后续，帮助学生知道学会后会接到哪里。
    const focusNames = (
        context?.focusPoints?.length
            ? context.focusPoints
            : context?.knowledgePoints?.slice(0, 1) || []
    );

    for (const focusName of focusNames) {
        if (!byName.has(focusName)) continue;

        for (const node of categoryNodes) {
            if (node.prerequisites.includes(focusName)) {
                included.add(node.name);
            }
        }
    }

    return categoryNodes.filter(
        node => included.has(node.name)
    );
}

function knowledgeGraphVisibleNodes(category) {
    if (!knowledgeGraphData) return [];

    const allNodes = knowledgeGraphData.nodes;

    if (!category || category === "全部") {
        return allNodes.slice();
    }

    return allNodes.filter(
        node => node.category === category
    );
}

function computeKnowledgeGraphLevels(nodes) {
    const byName = new Map(
        nodes.map(node => [node.name, node])
    );
    const memo = new Map();
    const visiting = new Set();

    function depth(node) {
        if (memo.has(node.id)) {
            return memo.get(node.id);
        }

        if (visiting.has(node.id)) {
            return 0;
        }

        visiting.add(node.id);

        let value = 0;

        for (const prerequisite of node.prerequisites) {
            const previous = byName.get(prerequisite);

            if (previous) {
                value = Math.max(
                    value,
                    depth(previous) + 1
                );
            }
        }

        visiting.delete(node.id);
        memo.set(node.id, value);

        return value;
    }

    for (const node of nodes) {
        depth(node);
    }

    return memo;
}

function renderKnowledgeGraphSection(container, nodes, title, description, context) {
    const section = document.createElement("div");
    section.className = "kg-section";

    const heading = document.createElement("div");
    heading.className = "kg-section-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (description) {
        const desc = document.createElement("div");
        desc.className = "kg-section-desc";
        desc.textContent = description;
        section.appendChild(desc);
    }

    if (!nodes.length) {
        const empty = document.createElement("div");
        empty.className = "kg-empty";
        empty.textContent = "这个分类下暂时没有可显示的节点。";
        section.appendChild(empty);
        container.appendChild(section);
        return;
    }

    const levels = computeKnowledgeGraphLevels(nodes);
    const orderedNodes = nodes.slice();
    const orderMap = new Map(
        orderedNodes.map(
            (node, index) => [node.id, index]
        )
    );

    const columns = new Map();

    for (const node of orderedNodes) {
        const level = levels.get(node.id) || 0;
        if (!columns.has(level)) {
            columns.set(level, []);
        }
        columns.get(level).push(node);
    }

    const columnKeys = [...columns.keys()].sort((a, b) => a - b);

    for (const key of columnKeys) {
        columns.get(key).sort(
            (a, b) => (
                orderMap.get(a.id)
                - orderMap.get(b.id)
            )
        );
    }

    const nodeWidth = 132;
    const nodeHeight = 58;
    const horizontalGap = 74;
    const verticalGap = 26;
    const margin = 24;

    const maxRows = Math.max(
        ...columnKeys.map(
            key => columns.get(key).length
        ),
        1
    );

    const svgWidth = (
        margin * 2
        + columnKeys.length * nodeWidth
        + Math.max(columnKeys.length - 1, 0) * horizontalGap
    );

    const svgHeight = (
        margin * 2
        + maxRows * nodeHeight
        + Math.max(maxRows - 1, 0) * verticalGap
    );

    const svg = createSvgElement("svg", {
        class: "kg-svg",
        viewBox: `0 0 ${svgWidth} ${svgHeight}`
    });

    const positions = new Map();

    for (let columnIndex = 0; columnIndex < columnKeys.length; columnIndex += 1) {
        const level = columnKeys[columnIndex];
        const group = columns.get(level);
        const x = margin + columnIndex * (nodeWidth + horizontalGap);
        const totalHeight = (
            group.length * nodeHeight
            + Math.max(group.length - 1, 0) * verticalGap
        );
        const startY = margin + (svgHeight - margin * 2 - totalHeight) / 2;

        for (let rowIndex = 0; rowIndex < group.length; rowIndex += 1) {
            const node = group[rowIndex];
            const y = startY + rowIndex * (nodeHeight + verticalGap);
            positions.set(node.id, { x, y });
        }
    }

    const byName = new Map(
        nodes.map(node => [node.name, node])
    );

    for (const node of orderedNodes) {
        const current = positions.get(node.id);

        if (!current) continue;

        for (const prerequisiteName of node.prerequisites) {
            const previousNode = byName.get(prerequisiteName);

            if (!previousNode) continue;

            const previous = positions.get(previousNode.id);

            if (!previous) continue;

            const x1 = previous.x + nodeWidth;
            const y1 = previous.y + nodeHeight / 2;
            const x2 = current.x;
            const y2 = current.y + nodeHeight / 2;
            const midX = (x1 + x2) / 2;

            const path = createSvgElement("path", {
                class: "kg-edge",
                d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
            });

            svg.appendChild(path);
        }
    }

    for (const node of orderedNodes) {
        const position = positions.get(node.id);

        if (!position) continue;

        const state = knowledgeGraphNodeState(
            node.name,
            context
        );
        const group = createSvgElement("g", {
            class: (
                "kg-node-group"
                + (node.id === knowledgeGraphSelectedNodeId ? " selected" : "")
            ),
            transform: `translate(${position.x}, ${position.y})`
        });

        group.addEventListener(
            "click",
            () => {
                knowledgeGraphSelectedNodeId = node.id;
                renderKnowledgeGraphDetail();
                renderKnowledgeGraph();
            }
        );

        const rect = createSvgElement("rect", {
            x: 0,
            y: 0,
            width: nodeWidth,
            height: nodeHeight,
            rx: 12,
            fill: state.fill,
            stroke: state.stroke,
            "stroke-width": node.id === knowledgeGraphSelectedNodeId ? 3 : 2
        });

        group.appendChild(rect);

        const lines = splitKnowledgeGraphLabel(
            node.name
        );
        const text = createSvgElement("text", {
            class: "kg-node-label",
            x: nodeWidth / 2,
            y: 22,
            "text-anchor": "middle"
        });

        if (lines.length === 1) {
            const tspan = createSvgElement("tspan", {
                x: nodeWidth / 2,
                dy: 0
            });
            tspan.textContent = lines[0];
            text.appendChild(tspan);
        } else {
            lines.forEach((line, index) => {
                const tspan = createSvgElement("tspan", {
                    x: nodeWidth / 2,
                    dy: index === 0 ? 0 : 14
                });
                tspan.textContent = line;
                text.appendChild(tspan);
            });
        }

        group.appendChild(text);

        if (state.badge) {
            const badge = createSvgElement("text", {
                class: "kg-node-badge",
                x: nodeWidth / 2,
                y: nodeHeight - 10,
                "text-anchor": "middle"
            });
            badge.textContent = state.badge;
            group.appendChild(badge);
        }

        svg.appendChild(group);
    }

    section.appendChild(svg);
    container.appendChild(section);
}

function renderKnowledgeGraphSummary(context) {
    const summary = document.getElementById(
        "knowledgeGraphSummary"
    );

    if (!summary) return;

    summary.innerHTML = "";

    const addItem = (
        label,
        value,
        className = ""
    ) => {
        if (!value) return;

        const item = document.createElement("div");
        item.className = [
            "graph-summary-item",
            className
        ]
            .filter(Boolean)
            .join(" ");

        const labelNode = document.createElement("span");
        labelNode.className = "graph-summary-label";
        labelNode.textContent = label;

        const valueNode = document.createElement("span");
        valueNode.className = "graph-summary-value";
        valueNode.textContent = value;

        item.appendChild(labelNode);
        item.appendChild(valueNode);
        summary.appendChild(item);
    };

    addItem(
        "当前模块",
        context.category || knowledgeGraphFilter || "暂未识别"
    );

    if (context.focusPoints.length) {
        addItem(
            "主要卡点",
            context.focusPoints.join("、"),
            "focus"
        );
    }

    const related = context.knowledgePoints
        .filter(
            point => !context.focusPoints.includes(point)
        )
        .slice(0, 4);

    if (related.length) {
        addItem(
            "本题相关",
            related.join("、")
        );
    }

    if (
        !context.focusPoints.length
        && !related.length
    ) {
        addItem(
            "当前视图",
            knowledgeGraphViewMode === "focus"
                ? "与当前题目直接相关的知识"
                : "完整模块"
        );
    }
}


function renderKnowledgeGraphDetail() {
    const title = document.getElementById(
        "knowledgeGraphDetailTitle"
    );
    const detail = document.getElementById(
        "knowledgeGraphDetail"
    );

    if (!title || !detail || !knowledgeGraphData) return;

    const node = findKnowledgeGraphNodeById(
        knowledgeGraphSelectedNodeId
    );

    if (!node) {
        title.textContent = "节点详情";
        detail.innerHTML = (
            '<div class="graph-detail-empty">点击左侧知识点查看关系。</div>'
        );
        return;
    }

    const context = getCurrentKnowledgeContext();
    const state = knowledgeGraphNodeState(
        node.name,
        context
    );

    const nextNodes = knowledgeGraphData.nodes
        .filter(item => item.prerequisites.includes(node.name))
        .map(item => item.name);

    const relatedNodes = [
        ...new Set([
            ...node.prerequisites,
            ...nextNodes
        ])
    ];

    title.textContent = node.name;
    detail.innerHTML = "";

    const subline = document.createElement("div");
    subline.className = "graph-detail-subline";

    const category = document.createElement("span");
    category.textContent = node.category;
    subline.appendChild(category);

    if (state.label) {
        const pill = document.createElement("span");
        pill.className = `graph-status-pill ${state.key}`;
        pill.textContent = state.label;
        subline.appendChild(pill);
    }

    detail.appendChild(subline);

    const field = document.createElement("div");
    field.className = "graph-detail-field";

    const label = document.createElement("div");
    label.className = "graph-detail-field-label";
    label.textContent = "直接相关知识";

    const value = document.createElement("div");
    value.className = "graph-detail-field-value";
    value.textContent = relatedNodes.length
        ? relatedNodes.join("、")
        : "暂无直接关联";

    field.appendChild(label);
    field.appendChild(value);
    detail.appendChild(field);
}



function renderKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (!modal || modal.classList.contains("hidden")) {
        return;
    }

    if (!knowledgeGraphData) {
        renderKnowledgeGraphLoading(
            "知识图谱加载中…"
        );
        return;
    }

    fillKnowledgeGraphCategoryOptions();
    updateKnowledgeGraphModeButton();

    const context = getCurrentKnowledgeContext();
    const canvas = document.getElementById(
        "knowledgeGraphCanvas"
    );

    if (!canvas) return;

    renderKnowledgeGraphSummary(context);
    canvas.innerHTML = "";

    if (!knowledgeGraphData.nodes.length) {
        canvas.innerHTML = (
            '<div class="kg-empty">知识图谱目前还是空的。</div>'
        );
        renderKnowledgeGraphDetail();
        return;
    }

    const fullNodes = knowledgeGraphVisibleNodes(
        knowledgeGraphFilter
    );

    const visibleNodes = (
        knowledgeGraphViewMode === "focus"
            ? knowledgeGraphFocusedNodes(
                knowledgeGraphFilter,
                context
            )
            : fullNodes
    );

    ensureKnowledgeGraphSelection(
        visibleNodes,
        context
    );

    const description = (
        knowledgeGraphViewMode === "focus"
            ? (
                visibleNodes.length < fullNodes.length
                    ? `已聚焦当前题目，只显示 ${visibleNodes.length} 个直接相关知识点。`
                    : "当前没有可进一步收缩的题目上下文，显示当前模块。"
            )
            : `完整模块，共 ${fullNodes.length} 个知识点。`
    );

    renderKnowledgeGraphSection(
        canvas,
        visibleNodes,
        knowledgeGraphFilter || "知识图谱",
        description,
        context
    );

    renderKnowledgeGraphDetail();
}


// -----------------------------
// 右侧会话信息
// -----------------------------
function renderInfo() {
    const info = document.getElementById("info");
    if (!info) return;

    const session = getCurrent();

    if (!session) {
        info.innerText = "暂无对话";
        return;
    }

    const lines = [
        `当前对话：${session.name}`,
        `消息数：${session.messages.length}`
    ];

    const teaching = normalizeTeaching(session.teaching);

    if (teaching) {
        lines.push(
            "",
            `学习内容：${getFriendlyCategory(teaching.category)}`
        );

        if (teaching.focus_points.length) {
            lines.push(
                `本次重点：${teaching.focus_points.join("、")}`
            );
        }

        if (teaching.knowledge_path.length >= 2) {
            lines.push(
                `知识脉络：${teaching.knowledge_path.join(" → ")}`
            );
        }
    }

    info.innerText = lines.join("\n");
}


// -----------------------------
// 全刷新
// -----------------------------
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
    renderLearningSummary();
    renderKnowledgeGraph();
}


// -----------------------------
// 初始化
// -----------------------------
document.addEventListener(
    "DOMContentLoaded",
    () => {
        const input = document.getElementById("text");
        const chat = document.getElementById("chat");
        const imageBtn = document.getElementById("imageBtn");
        const imageInput = document.getElementById("imageInput");
        const markWrongBtn = document.getElementById("markWrongBtn");
        const wrongBookBtn = document.getElementById("wrongBookBtn");
        const wrongBookClose = document.getElementById("wrongBookClose");
        const wrongBookModal = document.getElementById("wrongBookModal");
        const wrongBookSearchBox = document.getElementById("wrongBookSearch");
        const wrongBookSortBox = document.getElementById("wrongBookSort");
        const wrongPdfBtn = document.getElementById("wrongPdfBtn");
        const wrongClearCompletedBtn = document.getElementById("wrongClearCompletedBtn");
        const wrongEditClose = document.getElementById("wrongEditClose");
        const wrongEditCancel = document.getElementById("wrongEditCancel");
        const wrongEditSave = document.getElementById("wrongEditSave");
        const wrongEditModal = document.getElementById("wrongEditModal");
        const wrongQuestionPickerClose = document.getElementById("wrongQuestionPickerClose");
        const wrongQuestionPickerCancel = document.getElementById("wrongQuestionPickerCancel");
        const wrongQuestionPickerConfirm = document.getElementById("wrongQuestionPickerConfirm");
        const wrongQuestionPickerModal = document.getElementById("wrongQuestionPickerModal");
        const knowledgeGraphBtn = document.getElementById("knowledgeGraphBtn");
        const knowledgeGraphClose = document.getElementById("knowledgeGraphClose");
        const knowledgeGraphModal = document.getElementById("knowledgeGraphModal");
        const knowledgeGraphCategory = document.getElementById("knowledgeGraphCategory");
        const knowledgeGraphFocusBtn = document.getElementById("knowledgeGraphFocusBtn");
        const wrongFilterButtons = document.querySelectorAll(
            "[data-wrong-filter]"
        );

        if (chat) {
            chat.addEventListener(
                "scroll",
                handleChatScrollWhileTyping,
                { passive: true }
            );
        }

        if (input) {
            input.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key === "Enter"
                        && !event.shiftKey
                    ) {
                        event.preventDefault();
                        send();
                    }
                }
            );
        }

        if (imageBtn) {
            imageBtn.addEventListener(
                "click",
                openImagePicker
            );
        }

        if (imageInput) {
            imageInput.addEventListener(
                "change",
                handleImageSelected
            );
        }

        if (markWrongBtn) {
            markWrongBtn.addEventListener(
                "click",
                manualMarkCurrentWrong
            );
        }

        if (wrongBookBtn) {
            wrongBookBtn.addEventListener(
                "click",
                openWrongBook
            );
        }

        if (wrongBookClose) {
            wrongBookClose.addEventListener(
                "click",
                closeWrongBook
            );
        }

        if (wrongBookModal) {
            wrongBookModal.addEventListener(
                "click",
                event => {
                    if (event.target === wrongBookModal) {
                        closeWrongBook();
                    }
                }
            );
        }

        if (wrongBookSearchBox) {
            wrongBookSearchBox.addEventListener(
                "input",
                event => setWrongBookSearch(event.target.value)
            );
        }

        if (wrongBookSortBox) {
            wrongBookSortBox.addEventListener(
                "change",
                event => setWrongBookSort(event.target.value)
            );
        }

        if (wrongPdfBtn) {
            wrongPdfBtn.addEventListener(
                "click",
                exportWrongBookPdf
            );
        }

        if (wrongClearCompletedBtn) {
            wrongClearCompletedBtn.addEventListener(
                "click",
                clearCompletedWrongQuestions
            );
        }

        if (wrongEditClose) {
            wrongEditClose.addEventListener(
                "click",
                closeWrongEdit
            );
        }

        if (wrongEditCancel) {
            wrongEditCancel.addEventListener(
                "click",
                closeWrongEdit
            );
        }

        if (wrongEditSave) {
            wrongEditSave.addEventListener(
                "click",
                saveWrongEdit
            );
        }

        if (wrongEditModal) {
            wrongEditModal.addEventListener(
                "click",
                event => {
                    if (event.target === wrongEditModal) {
                        closeWrongEdit();
                    }
                }
            );
        }

        if (wrongQuestionPickerClose) {
            wrongQuestionPickerClose.addEventListener(
                "click",
                closeWrongQuestionPicker
            );
        }

        if (wrongQuestionPickerCancel) {
            wrongQuestionPickerCancel.addEventListener(
                "click",
                closeWrongQuestionPicker
            );
        }

        if (wrongQuestionPickerConfirm) {
            wrongQuestionPickerConfirm.addEventListener(
                "click",
                confirmWrongQuestionPicker
            );
        }

        if (wrongQuestionPickerModal) {
            wrongQuestionPickerModal.addEventListener(
                "click",
                event => {
                    if (event.target === wrongQuestionPickerModal) {
                        closeWrongQuestionPicker();
                    }
                }
            );
        }

        if (knowledgeGraphBtn) {
            knowledgeGraphBtn.addEventListener(
                "click",
                openKnowledgeGraph
            );
        }

        if (knowledgeGraphClose) {
            knowledgeGraphClose.addEventListener(
                "click",
                closeKnowledgeGraph
            );
        }

        if (knowledgeGraphModal) {
            knowledgeGraphModal.addEventListener(
                "click",
                event => {
                    if (event.target === knowledgeGraphModal) {
                        closeKnowledgeGraph();
                    }
                }
            );
        }

        if (knowledgeGraphCategory) {
            knowledgeGraphCategory.addEventListener(
                "change",
                event => setKnowledgeGraphFilter(event.target.value)
            );
        }

        if (knowledgeGraphFocusBtn) {
            knowledgeGraphFocusBtn.addEventListener(
                "click",
                focusKnowledgeGraphOnCurrent
            );
        }

        for (const button of wrongFilterButtons) {
            button.addEventListener(
                "click",
                () => {
                    setWrongBookFilter(
                        button.getAttribute("data-wrong-filter")
                    );
                }
            );
        }

        loadLearningState();

        const restored = loadState();

        if (!restored) {
            const id = makeSessionId();

            sessions.push({
                id,
                name: "新对话",
                messages: [],
                teaching: null,
                learningQuestion: null,
                retest: null
            });

            currentId = id;
            saveState();
        }

        renderAll();
        enableInput(true);
    }
);
