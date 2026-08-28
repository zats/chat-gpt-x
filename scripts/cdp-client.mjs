export class CdpTransportError extends Error {}
export class CdpProtocolError extends Error {}

const maximumOperationTimeoutMs = 5_000;

export function operationTimeout(deadline, maximum = maximumOperationTimeoutMs) {
  return Math.max(1, Math.min(maximum, deadline - Date.now()));
}

export async function connectCdpPage(port, pageUrl, deadline) {
  const controller = new AbortController();
  const fetchTimeout = operationTimeout(deadline);
  const fetchTimer = setTimeout(() => controller.abort(), fetchTimeout);
  let targets;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CdpTransportError(
        `CDP target request returned HTTP ${response.status}`,
      );
    }
    targets = await response.json();
  } catch (error) {
    if (error instanceof CdpTransportError) throw error;
    throw new CdpTransportError(
      `CDP target request failed: ${error.message}`,
    );
  } finally {
    clearTimeout(fetchTimer);
  }

  if (!Array.isArray(targets)) {
    throw new CdpTransportError("CDP target response is not an array");
  }
  const page = targets.find(
    (target) => target.type === "page" && target.url === pageUrl,
  );
  if (!page) {
    throw new CdpTransportError(`No ChatGPT page target on CDP port ${port}`);
  }

  let socket;
  try {
    socket = new WebSocket(page.webSocketDebuggerUrl);
  } catch (error) {
    throw new CdpTransportError(
      `CDP WebSocket could not be created: ${error.message}`,
    );
  }
  const openTimeout = operationTimeout(deadline);
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
    };
    const fail = (message) => {
      cleanup();
      try {
        socket.close();
      } catch {}
      reject(new CdpTransportError(message));
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => fail("CDP WebSocket failed before it opened");
    const onClose = () => fail("CDP WebSocket closed before it opened");
    const timer = setTimeout(
      () => fail(`CDP WebSocket did not open within ${openTimeout}ms`),
      openTimeout,
    );
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
  });
  return socket;
}

export function sendCdpCommand(socket, id, method, params, deadline) {
  const timeout = operationTimeout(deadline);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        fail(new CdpProtocolError(`CDP returned invalid JSON: ${error.message}`));
        return;
      }
      if (message.id !== id) return;
      cleanup();
      if (message.error) {
        reject(new CdpProtocolError(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    };
    const onError = () =>
      fail(new CdpTransportError(`CDP ${method} failed on the WebSocket`));
    const onClose = () =>
      fail(new CdpTransportError(`CDP WebSocket closed during ${method}`));
    const timer = setTimeout(
      () =>
        fail(
          new CdpTransportError(
            `CDP ${method} did not reply within ${timeout}ms`,
          ),
        ),
      timeout,
    );

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      fail(new CdpTransportError(`CDP ${method} send failed: ${error.message}`));
    }
  });
}

export function closeCdpSocket(socket) {
  if (!socket || socket.readyState > 1) return;
  try {
    socket.close();
  } catch {}
}
