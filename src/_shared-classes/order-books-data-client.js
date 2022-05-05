const WebSocket = require('./websocket');

/** @param {import('../../typings/_ws').orderBooksWsObject} orderBooksWs */
function OrderBooksDataClient(orderBooksWs) {
  /** @type {import('../../typings/_ws').orderBooksClientWsObject} */
  const orderBooksDataClient = {
    connect: (params) => {
      const webSocket = WebSocket('order-book-client');
      webSocket.connect(`ws://${params.host}:${params.port}`);
      webSocket.addOnMessage((message) => {
        orderBooksWs.data = JSON.parse(message);
      });
      webSocket.addOnClose(() => { webSocket.connect(`ws://${params.host}:${params.port}`) });
    },
  };
  return orderBooksDataClient;
};
module.exports = OrderBooksDataClient;
