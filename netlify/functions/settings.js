const { getStore } = require("@netlify/blobs");

const STORE_NAME = "chatbot-settings";
const KEY = "default";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getSettingsStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

exports.handler = async (event) => {
  let store;
  try {
    store = getSettingsStore();
  } catch (e) {
    return jsonResponse(500, {
      error: `설정 저장소 초기화 실패: ${e.message}. Netlify Blobs가 활성화되어 있는지 확인하세요.`,
    });
  }

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(KEY, { type: "json" });
      return jsonResponse(200, data || { instructions: "", folderId: "" });
    } catch (e) {
      return jsonResponse(500, { error: `설정 읽기 실패: ${e.message}` });
    }
  }

  if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return jsonResponse(400, { error: "요청 본문이 올바른 JSON이 아닙니다." });
    }

    const next = {
      instructions: typeof payload.instructions === "string" ? payload.instructions : "",
      folderId: typeof payload.folderId === "string" ? payload.folderId.trim() : "",
      updatedAt: new Date().toISOString(),
    };

    try {
      await store.setJSON(KEY, next);
      return jsonResponse(200, next);
    } catch (e) {
      return jsonResponse(500, { error: `설정 저장 실패: ${e.message}` });
    }
  }

  return jsonResponse(405, { error: "GET, PUT, POST만 허용됩니다." });
};
