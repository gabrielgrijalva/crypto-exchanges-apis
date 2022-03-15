const ws = require('ws');
const moment = require('moment');
const wait = require('../_utils/wait');

function WebSocket() {
  /** @type {ws.WebSocket} */
  let wsInstance = null;
  let webSocketErrors = 0;
  let websocketErrorsInterval = null;
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
      wsInstance.on('open', errorResetFunction);
      wsInstance.on('open', pingPongFunction(wsInstance));
      wsInstance.on('open', wsEventLogFunction(url, 'open'));
      wsInstance.on('close', closeFunction);
      wsInstance.on('close', wsEventLogFunction(url, 'close'));
      wsInstance.on('error', errorHandlerFunction);
      wsInstance.on('error', wsEventLogFunction(url, 'error'));
    },
    close: closeFunction,
    disconnect: disconnectFunction,
    // Add function listener
    addOnOpen: (listener) => {
      wsInstance ? wsInstance.on('open', listener) : null;
    },
    addOnClose: (listener) => {
      wsInstance ? wsInstance.on('close', listener) : null;
    },
    addOnError: (listener) => {
      wsInstance ? wsInstance.on('error', listener) : null;
    },
    addOnMessage: (listener) => {
      wsInstance ? wsInstance.on('message', listener) : null;
    },
    // Remove function listener
    removeOnOpen: (listener) => {
      wsInstance ? wsInstance.removeListener('open', listener) : null;
    },
    removeOnClose: (listener) => {
      wsInstance ? wsInstance.removeListener('close', listener) : null;
    },
    removeOnError: (listener) => {
      wsInstance ? wsInstance.removeListener('error', listener) : null;
    },
    removeOnMessage: (listener) => {
      wsInstance ? wsInstance.removeListener('message', listener) : null;
    },
  };
  return webSocket;
}
module.exports = WebSocket;
