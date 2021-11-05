const crypto = require('crypto');
const WebSocket = require('../../_shared-classes/websocket');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedHeaders(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return {} };
  const nonce = Date.now() * 1000;
  const digest = `GET/realtime${nonce}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(digest).digest('hex');
  const signedHeaders = {
    'api-nonce': nonce,
    'api-key': apiKey,
    'api-signature': signature,
  };
  return signedHeaders;
};
/**
 * 
 * 
 * 
 * =================================
 * BITMEX WEBSOCKET
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {string} topic
 * @param {WsN.wsOptions} wsOptions
 */
function BitmexWebSocket(topic, wsOptions) {
  const webSocket = WebSocket();
  const bitmexWebSocket = {
    connect: () => {
      return new Promise(resolve => {
        const url = wsOptions.url;
        const apiKey = wsOptions.apiKey;
        const apiSecret = wsOptions.apiSecret;
        const signedHeaders = getSignedHeaders(apiKey, apiSecret);
        const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
        webSocket.connect(`${url}?subscribe=${topic}`, { headers: signedHeaders });
        webSocket.addOnMessage(function onMessageConnectFunction(message) {
          const messageParsed = JSON.parse(message);
          if (messageParsed.success && messageParsed.subscribe === topic) {
            resolve(webSocket);
            clearTimeout(connectTimeout);
            webSocket.removeOnMessage(onMessageConnectFunction);
          }
        });
      })
    },
    addOnOpen: webSocket.addOnOpen,
    addOnClose: webSocket.addOnClose,
    addOnError: webSocket.addOnError,
    addOnMessage: webSocket.addOnMessage,
    removeOnOpen: webSocket.removeOnOpen,
    removeOnClose: webSocket.removeOnClose,
    removeOnError: webSocket.removeOnError,
    removeOnMessage: webSocket.removeOnMessage,
  };
  bitmexWebSocket.addOnClose(() => {
    bitmexWebSocket.connect();
  });
  return bitmexWebSocket;
};
module.exports = BitmexWebSocket;
