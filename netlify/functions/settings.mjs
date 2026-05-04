import { getStore } from "@netlify/blobs";

export const config = {
  path: "/api/settings",
};

const STORE_NAME = "chatbot-settings";
const KEY = "default";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async (req) => {
  let store;
  try {
    store = getStore({ name: STORE_NAME, consistency: "strong" });
  } catch (e) {
    return jsonResponse(500, {
      error: `Netlify Blobs 초기화 실패: ${e.message}`,
    });
  }

  if (req.method === "GET") {
    try {
      const data = await store.get(KEY, { type: "json" });
      return jsonResponse(200, data || { instructions: "", folderId: "" });
    } catch (e) {
      return jsonResponse(500, { error: `설정 읽기 실패: ${e.message}` });
    }
  }

  if (req.method === "PUT" || req.method === "POST") {
    let payload;
    try {
      payload = await req.json();
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
