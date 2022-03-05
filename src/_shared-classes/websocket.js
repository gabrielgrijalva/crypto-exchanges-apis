const ws = require('ws');
const moment = require('moment');
const wait = require('../_utils/wait');

function WebSocket() {
  /** @type {ws.WebSocket} */
  let wsInstance = null;
  let wsInstanceErrors = 0;
  let wsInstanceTimeout = null;
  let wsInstanceInterval = null;
  let wsInstanceErrorInterval = null;
  /**
   * 
   * 
   * 
   * Default functions
   * 
   * 
   * 
   */
  const pingPongFunction = () => {
    wsInstance.ping();
    wsInstance.on('pong', async () => {
      clearTimeout(wsInstanceTimeout);
      await wait(1000);
      wsInstance.ping();
      wsInstanceTimeout = setTimeout(disconnectFunction, 1000);
    });
    wsInstanceTimeout = setTimeout(disconnectFunction, 1000);
  };
  const disconnectFunction = () => {
    clearTimeout(wsInstanceTimeout);
    clearInterval(wsInstanceInterval);
    clearInterval(wsInstanceErrorInterval);
    if (wsInstance && wsInstance.readyState === wsInstance.OPEN) {
      wsInstance.terminate();
    }
    wsInstance = null;
    wsInstanceTimeout = null;
    wsInstanceInterval = null;
    wsInstanceErrorInterval = null;
  };
  const errorResetFunction = () => {
    wsInstanceErrorInterval = setInterval(() => {
      wsInstanceErrors = 0;
    }, 120000);
  };
  const errorHandlerFunction = () => {
    wsInstanceErrors += 1;
    if (wsInstanceErrors <= 4) { return };
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
      wsInstance.on('open', pingPongFunction);
      wsInstance.on('open', errorResetFunction);
      wsInstance.on('open', wsEventLogFunction(url, 'open'));
      wsInstance.on('close', disconnectFunction);
      wsInstance.on('close', wsEventLogFunction(url, 'close'));
      wsInstance.on('error', errorHandlerFunction);
      wsInstance.on('error', wsEventLogFunction(url, 'error'));
    },
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
