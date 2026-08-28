import assert from "node:assert/strict";
import test from "node:test";

import {
  CdpTransportError,
  operationTimeout,
  sendCdpCommand,
} from "./cdp-client.mjs";

class FakeSocket extends EventTarget {
  sent = [];

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  reply(message) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
}

test("caps each CDP operation inside the overall deadline", () => {
  assert.ok(operationTimeout(Date.now() + 60_000) <= 5_000);
  assert.ok(operationTimeout(Date.now() + 50) <= 50);
});

test("resolves the matching CDP response", async () => {
  const socket = new FakeSocket();
  const resultPromise = sendCdpCommand(
    socket,
    7,
    "Runtime.evaluate",
    { expression: "1" },
    Date.now() + 1_000,
  );
  socket.reply({ id: 6, result: { value: "wrong" } });
  socket.reply({ id: 7, result: { value: "right" } });

  assert.deepEqual(await resultPromise, { value: "right" });
  assert.deepEqual(socket.sent, [
    {
      id: 7,
      method: "Runtime.evaluate",
      params: { expression: "1" },
    },
  ]);
});

test("rejects a CDP command that does not reply", async () => {
  const socket = new FakeSocket();
  await assert.rejects(
    sendCdpCommand(
      socket,
      1,
      "Runtime.evaluate",
      {},
      Date.now() + 10,
    ),
    (error) =>
      error instanceof CdpTransportError &&
      /did not reply/.test(error.message),
  );
});
