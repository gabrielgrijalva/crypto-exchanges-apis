const ws = require('ws');
const moment = require('moment');
const wait = require('../_utils/wait');

function WebSocket() {
  /** @type {ws.WebSocket} */
  let wsInstance = null;
  let webSocketErrors = 0;
  let websocketErrorsInterval = null;
  const onOpenFunctions = [];
  const onCloseFunctions = [];
  const onErrorFunctions = [];
  const onMessageFunctions = [];
  /**
   * 
   * 
   * 
   * Default functions
   * 
   * 
   * 
   */
  /**
   * @param {ws.WebSocket} localWsInstance 
   */
  const pingPongFunction = (localWsInstance) => () => {
    let timeout = null;
    localWsInstance.ping();
    localWsInstance.on('pong', async () => {
      clearTimeout(timeout);
      await wait(1000);
      if (localWsInstance.readyState === localWsInstance.OPEN) {
        localWsInstance.ping();
        timeout = setTimeout(disconnect, 1000);
      }
    });
    const disconnect = () => {
      if (localWsInstance.readyState === localWsInstance.OPEN) {
        localWsInstance.terminate();
      }
    };
    timeout = setTimeout(disconnect, 1000);
  };
  const closeFunction = () => {
    clearInterval(websocketErrorsInterval);
    if (!wsInstance) { return };
    if (wsInstance.readyState === wsInstance.OPEN) {
      wsInstance.terminate();
    }
  };
  const disconnectFunction = () => {
    clearInterval(websocketErrorsInterval);
    if (!wsInstance) { return };
    wsInstance.removeAllListeners('open');
    wsInstance.removeAllListeners('close');
    wsInstance.removeAllListeners('error');
    wsInstance.removeAllListeners('message');
    if (wsInstance.readyState === wsInstance.OPEN) {
      wsInstance.terminate();
    }
  }
  const errorResetFunction = () => {
    websocketErrorsInterval = setInterval(() => {
      webSocketErrors = 0;
    }, 120000);
  };
  const errorHandlerFunction = () => {
    webSocketErrors += 1;
    if (webSocketErrors <= 4) { return };
    throw new Error('Too many websocket errors in a short period of time.');
  };
  const wsEventLogFunction = (url, eventType) => (err) => {
    const timestamp = moment.utc().format('YYYY-MM-DD HH:mm:ss');
    console.log(`Websocket ${eventType} event: ${timestamp} (${url})`);
    if (err) console.log(err);
  }
  /**
   * 
   * 
   * 
   * @type {import('../../typings/_ws').WebSocket}
   * 
   * 
   * 
   */
  const webSocket = {
    // Util functions
    send: (data) => {
      wsInstance ? wsInstance.send(data) : null;
    },
    connect: (url, options) => {
      if (wsInstance) { webSocket.disconnect() };
      wsInstance = new ws(url, options);
      // Default Functions
      wsInstance.on('open', errorResetFunction);
      wsInstance.on('open', pingPongFunction(wsInstance));
      wsInstance.on('open', wsEventLogFunction(url, 'open'));
      wsInstance.on('close', closeFunction);
      wsInstance.on('close', wsEventLogFunction(url, 'close'));
      wsInstance.on('error', errorHandlerFunction);
      wsInstance.on('error', wsEventLogFunction(url, 'error'));
      // WebSocket added functions
      onOpenFunctions.forEach(v => wsInstance.on('open', v));
      onCloseFunctions.forEach(v => wsInstance.on('close', v));
      onErrorFunctions.forEach(v => wsInstance.on('error', v));
      onMessageFunctions.forEach(v => wsInstance.on('message', v));
    },
    close: closeFunction,
    disconnect: disconnectFunction,
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
      onOpenFunctions.splice(index, index !== -1 ? 1 : 0);
      wsInstance ? wsInstance.removeListener('open', listener) : null;
    },
    removeOnClose: (listener) => {
      const index = onCloseFunctions.findIndex(v => v === listener);
      onCloseFunctions.splice(index, index !== -1 ? 1 : 0);
      wsInstance ? wsInstance.removeListener('close', listener) : null;
    },
    removeOnError: (listener) => {
      const index = onErrorFunctions.findIndex(v => v === listener);
      onErrorFunctions.splice(index, index !== -1 ? 1 : 0);
      wsInstance ? wsInstance.removeListener('error', listener) : null;
    },
    removeOnMessage: (listener) => {
      const index = onMessageFunctions.findIndex(v => v === listener);
      onMessageFunctions.splice(index, index !== -1 ? 1 : 0);
      wsInstance ? wsInstance.removeListener('message', listener) : null;
    },
  };
  return webSocket;
}
module.exports = WebSocket;
