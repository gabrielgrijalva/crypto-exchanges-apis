const WebSocket = require('./websocket');


function OrderBookClient() {
  /** @type {import('../../typings/_ws').orderBooksClientWsObject} */
  const orderBookClient = {
    connect: (params) => {
      const webSocket = WebSocket('order-book-client');
      webSocket.connect(`ws://${params.host}:${params.port}`);
      webSocket.addOnMessage((message) => {
        params.orderBookWs.data = JSON.parse(message);
      });
      webSocket.addOnClose(() => { webSocket.connect(`ws://${params.host}:${params.port}`) });
    },
  };
  return orderBookClient;
};
module.exports = OrderBookClient;