import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { server } from "./server.mjs";

let endpoint;
before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${server.address().port}/api/triage`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function post(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { status: response.status, data: await response.json() };
}

test("отклоняет битый JSON и некорректный текст", async () => {
  for (const body of ["{", "null", "{}", '{"text":5}', '{"text":""}', '{"text":"   "}']) {
    assert.deepEqual(await post(body), { status: 400, data: { status: "invalid_input" } });
  }
});

test("возвращает тему и черновик", async () => {
  for (const [text, topic] of [["Доставка", "delivery"], ["Цена", "pricing"], ["Здравствуйте", "other"]]) {
    const { status, data } = await post(JSON.stringify({ text }));
    assert.equal(status, 200);
    assert.equal(data.status, "ready");
    assert.equal(data.topic, topic);
    assert.ok(data.draft.trim());
  }
});

for (const marker of ["error", "bad-json", "bad-topic", "empty-draft", "timeout"]) {
  test(`ручной разбор без черновика при [${marker}]`, async () => {
    const start = performance.now();
    const result = await post(JSON.stringify({ text: `[${marker}]` }));
    assert.deepEqual(result, {
      status: 200,
      data: { status: "manual_review", topic: null, draft: null },
    });
    // Include HTTP overhead, but fail if the full 1200 ms mock delay elapses.
    if (marker === "timeout") assert.ok(performance.now() - start < 1000);
  });
}
