const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBook = require('../../_shared-classes/order-book');
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
function createCreationUpdate(data) {
  const eventData = {};
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.px;
  eventData.quantity = +data.sz;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.fillPx;
  eventData.quantity = +data.fillSz;
  eventData.timestamp = moment(+data.fillTime).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.clOrdId;
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret, apiPassphrase) {
  if (!apiKey || !apiSecret || !apiPassphrase) { return };
  const path = '/users/self/verify';
  const method = 'GET';
  const timestamp = Date.now() / 1000;
  const digest = `${timestamp}${method}${path}`;
  const sign = crypto.createHmac('sha256', apiSecret).update(digest).digest('base64');
  const passphrase = apiPassphrase;
  return { op: 'login', args: [{ apiKey, passphrase, timestamp, sign }] };
};
/**
 * 
 * @param {string} type
 * @param {string} symbol
 * @param {string} channel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsOptions} wsOptions 
 */
function connectWebSocket(type, symbol, channel, webSocket, wsOptions) {
  console.log(`Connecting websocket: ${wsOptions.url}`);
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const apiPassphrase = wsOptions.apiPassphrase;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/${type}`);
    function connnectOnOpenFunction() {
      if (type === 'private') {
        const signedRequest = getSignedRequest(apiKey, apiSecret, apiPassphrase);
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
        const request = { op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }], };
        webSocket.send(JSON.stringify(request));
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.event === 'login' && messageParse.code === '0') {
        const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
        const request = { op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }], };
        webSocket.send(JSON.stringify(request));
      }
      if (messageParse.event === 'subscribe' && messageParse.arg.channel === channel) {
        console.log('Connected websocket');
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction);
    webSocket.addOnMessage(connectOnMessageFunction);
  });
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order
 */
function removeOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) { return };
  openOrders.splice(index, 1);
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order 
 */
function addUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) {
    openOrders.push(order);
  } else {
    openOrders[index] = order;
  }
};
function getFillAndUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) { throw 'Could not get past order event.' };
  const openOrder = openOrders[index];
  const fill = order.accFillSz !== openOrder.accFillSz;
  const update = order.px !== openOrder.px || order.sz !== openOrder.sz;
  openOrders[index] = order;
  return { fill, update };
};
/**
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/** 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  orderBook._insertSnapshotAsks(snapshot.data[0].asks.map(v => {
    return { id: +v[0], price: +v[0], quantity: +v[1] };
  }));
  orderBook._insertSnapshotBids(snapshot.data[0].bids.map(v => {
    return { id: +v[0], price: +v[0], quantity: +v[1] };
  }));
};
/**
 * 
 * 
 * 
 * =================================
 * WS DEFINITION
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../../typings/_ws').wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://ws.okex.com:8443/ws/v5';
  wsOptions.apiKey = wsOptions.apiKey || '';
  wsOptions.apiSecret = wsOptions.apiSecret || '';
  wsOptions.apiPassphrase = wsOptions.apiPassphrase || '';
  // Rest creation
  const rest = Rest({ apiKey: wsOptions.apiKey, apiSecret: wsOptions.apiSecret, apiPassphrase: wsOptions.apiPassphrase });
  // Websocket creation
  /** 
   * 
   * 
   * @type {import('../../../typings/_ws').Ws} 
   * 
   * 
   */
  const ws = {
    /**
     * 
     * 
     * 
     * WS ORDERS
     * 
     * 
     * 
     */
    orders: {
      info: null,
      events: null,
      connect: async (ordersParams) => {
        /** @type {import('../../../typings/_ws').ordersEventEmitter} */
        ws.orders.events = new Events.EventEmitter();
        const openOrders = [];
        // Orders websocket
        const symbol = ordersParams.symbol;
        const channel = 'orders';
        const webSocket = WebSocket();
        await connectWebSocket('private', symbol, channel, webSocket, wsOptions);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message.toString());
          console.log(messageParse);
          if (!messageParse.arg || messageParse.arg.channel !== channel) { return };
          const creationOrders = [];
          const executionOrders = [];
          const cancelationOrders = [];
          for (let i = 0; messageParse.data[i]; i += 1) {
            const order = messageParse.data[i];
            if (order.instId === ordersParams.symbol) {
              if (order.state === 'live') {
                if (order.amendResult === '-1') {
                  removeOpenOrders(openOrders, order);
                  cancelationOrders.push(createCancelation(order));
                } else {
                  addUpdateOpenOrders(openOrders, order);
                  creationOrders.push(createCreationUpdate(order));
                }
              }
              if (order.state === 'partially_filled' || order.state === 'filled') {
                if (order.amendResult === '-1') {
                  removeOpenOrders(openOrders, order);
                  cancelationOrders.push(createCancelation(order));
                } else {
                  const fillAndUpdate = getFillAndUpdateOpenOrders(openOrders, order);
                  if (fillAndUpdate.update) {
                    creationOrders.push(createCreationUpdate(order));
                  }
                  if (fillAndUpdate.fill) {
                    executionOrders.push(createExecution(order));
                  }
                }
              }
              if (order.state === 'canceled') {
                removeOpenOrders(openOrders, order);
                cancelationOrders.push(createCancelation(order));
              }
            }
          }
          if (creationOrders.length) {
            ws.orders.events.emit('creations-updates', creationOrders);
          }
          if (executionOrders.length) {
            ws.orders.events.emit('executions', executionOrders);
          }
          if (cancelationOrders.length) {
            ws.orders.events.emit('cancelations', cancelationOrders);
          }
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsOptions));
      }
    },
    /**
     * 
     * 
     * 
     * WS POSITION
     * 
     * 
     * 
     */
    position: {
      info: null,
      events: null,
      connect: async (positionParams) => {
        /** @type {import('../../../typings/_ws').positionEventEmitter} */
        ws.position.events = new Events.EventEmitter();
        const symbol = positionParams.symbol;
        const channel = 'positions';
        const webSocket = WebSocket();
        await connectWebSocket('private', symbol, channel, webSocket, wsOptions);
        // Load rest info
        const positionRestParams = { symbol: symbol };
        const positionRestData = (await rest.getPosition(positionRestParams)).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message.toString());
          console.log(messageParse);
          if (!messageParse.arg || messageParse.arg.channel !== channel) { return };
          const positionEvent = messageParse.data.find(v => v.instId === symbol);
          if (!positionEvent) { return };
          ws.position.info.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
          ws.position.info.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
          ws.position.info.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
          ws.position.info.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsOptions));
      }
    },
    /**
     * 
     * 
     * 
     * WS LIQUIDATION
     * 
     * 
     * 
     */
    liquidation: {
      info: null,
      events: null,
      connect: async (liquidationParams) => {
        /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
        ws.liquidation.events = new Events.EventEmitter();
        const symbol = liquidationParams.symbol;
        // Instrument websocket
        const channelMark = 'mark-price';
        const webSocketMark = WebSocket();
        // Position websocket
        const channelPosition = 'positions';
        const webSocketPosition = WebSocket();
        await Promise.all([
          connectWebSocket('public', symbol, channelMark, webSocketMark, wsOptions),
          connectWebSocket('private', symbol, channelPosition, webSocketPosition, wsOptions),
        ]);
        // Load rest info
        const positionRestParams = { symbol: liquidationParams.symbol };
        const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
        const positionRestData = (await rest.getPosition(positionRestParams)).data;
        const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketMark.addOnMessage((message) => {
          const messageParse = JSON.parse(message.toString());
          console.log(messageParse);
          if (!messageParse.arg || messageParse.arg.channel !== channelMark) { return };
          const instrumentEvent = messageParse.data.find(v => v.instId === symbol);
          if (!instrumentEvent) { return };
          ws.liquidation.info.markPx = +instrumentEvent.markPx;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParse = JSON.parse(message.toString());
          console.log(messageParse);
          if (!messageParse.arg || messageParse.arg.channel !== channelPosition) { return };
          const positionEvent = messageParse.data.find(v => v.instId === symbol);
          if (!positionEvent) { return };
          ws.liquidation.info.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
          ws.liquidation.info.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
          ws.liquidation.info.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
          ws.liquidation.info.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
          ws.liquidation.info.liqPxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.liqPx : 0;
          ws.liquidation.info.liqPxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.liqPx : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketMark.addOnError(() => console.log('Websocket connection error.'));
        webSocketMark.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketMark.addOnClose(() => connectWebSocket('public', symbol, channelMark, webSocketMark, wsOptions));
        webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
        webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketPosition.addOnClose(() => connectWebSocket('private', symbol, channelPosition, webSocketPosition, wsOptions));
      }
    },
    /**
     * 
     * 
     * 
     * WS ORDER BOOK
     * 
     * 
     * 
     */
    orderBook: {
      info: null,
      events: null,
      connect: async (orderBookParams) => {
        // Connect websocket
        const channel = 'books-l2-tbt';
        const symbol = orderBookParams.symbol;
        const webSocket = WebSocket();
        await connectWebSocket('public', symbol, channel, webSocket, wsOptions);
        // Order book functionality
        ws.orderBook.info = OrderBook();
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message.toString());
          if (!messageParse.arg || messageParse.arg.channel !== channel) { return };
          if (messageParse.action === 'snapshot') {
            return synchronizeOrderBookSnapshot(messageParse, ws.orderBook.info);
          }
          if (messageParse.action === 'update') {
            const timestamp = Date.now();
            const orderBookTimestamp = +messageParse.data[0].ts;
            if (timestamp - orderBookTimestamp > 5000) {
              return webSocket.disconnect();
            }
            messageParse.data[0].asks.forEach(v => {
              ws.orderBook.info._updateOrderByPriceAsk({ id: +v[0], price: +v[0], quantity: +v[1] });
            });
            messageParse.data[0].bids.forEach(v => {
              ws.orderBook.info._updateOrderByPriceBid({ id: +v[0], price: +v[0], quantity: +v[1] });
            });
          }
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket('public', symbol, channel, webSocket, wsOptions);
        });
      }
    },
  };
  return ws;
}
module.exports = Ws;
