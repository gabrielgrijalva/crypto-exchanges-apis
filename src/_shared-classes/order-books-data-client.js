const WebSocket = require('./websocket');

function OrderBooksDataClient() {
  /** @type {import('../../typings/_ws').orderBooksClientWsObject} */
  const orderBooksDataClient = {
    connect: (params) => {
      const webSocket = WebSocket('order-book-client');
      webSocket.connect(`ws://${params.host}:${params.port}`);
      webSocket.addOnMessage((message) => {
        params.orderBookWs.data = JSON.parse(message);
      });
      webSocket.addOnClose(() => { webSocket.connect(`ws://${params.host}:${params.port}`) });
    },
  };
  return orderBooksDataClient;
};
module.exports = OrderBooksDataClient;
