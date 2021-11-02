const ws = require('ws');

function WebSocket() {
  /** @type {ws.WebSocket} */
  let wsInstance = null;
  let wsInstanceTimeout = null;
  let wsInstanceInterval = null;
  const onOpenFunctions = [];
  const onCloseFunctions = [];
  const onErrorFunctions = [];
  const onMessageFunctions = [];
  /**
   * @type {WsApi.WebSocket}
   */
  const webSocket = {
    // Util functions
    send: (data) => {
      wsInstance ? wsInstance.send(data) : null;
    },
    connect: (url, options) => {
      if (wsInstance) { webSocket.disconnect() };
      wsInstance = new ws(url, options);
      wsInstance.on('pong', () => clearTimeout(wsInstanceTimeout));
      wsInstanceInterval = setInterval(() => {
        wsInstance.ping();
        wsInstanceTimeout = setTimeout(webSocket.disconnect, 5000);
      });
    },
    disconnect: () => {
      clearTimeout(wsInstanceTimeout);
      clearInterval(wsInstanceInterval);
      if (wsInstance && wsInstance.readyState === wsInstance.OPEN) {
        wsInstance.close();
      }
      wsInstance = null;
      wsInstanceTimeout = null;
      wsInstanceInterval = null;
    },
    // Add function listener
    addOnOpen: (listener) => {
      onOpenFunctions.push(listener);
      wsInstance ? wsInstance.on('open', listener) : null;
    },
    addOnClose: (listener) => {
      onCloseFunctions.push(listener);
      wsInstance ? wsInstance.on('close', listener) : null;
    },
    addOnError: (listener) => {
      onErrorFunctions.push(listener);
      wsInstance ? wsInstance.on('error', listener) : null;
    },
    addOnMessage: (listener) => {
      onMessageFunctions.push(listener);
      wsInstance ? wsInstance.on('message', listener) : null;
    },
    // Remove function listener
    removeOnOpen: (listener) => {
      const index = onOpenFunctions.findIndex(v => v === listener);
      onOpenFunctions.splice(index, 1);
      wsInstance ? wsInstance.removeListener('open', listener) : null;
    },
    removeOnClose: (listener) => {
      const index = onCloseFunctions.findIndex(v => v === listener);
      onCloseFunctions.splice(index, 1);
      wsInstance ? wsInstance.removeListener('close', listener) : null;
    },
    removeOnError: (listener) => {
      const index = onErrorFunctions.findIndex(v => v === listener);
      onErrorFunctions.splice(index, 1);
      wsInstance ? wsInstance.removeListener('error', listener) : null;
    },
    removeOnMessage: (listener) => {
      const index = onMessageFunctions.findIndex(v => v === listener);
      onMessageFunctions.splice(index, 1);
      wsInstance ? wsInstance.removeListener('message', listener) : null;
    },
  };
  return webSocket;
}
module.exports = WebSocket;
