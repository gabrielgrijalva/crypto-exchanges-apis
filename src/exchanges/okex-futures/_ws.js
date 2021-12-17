const zlib = require('zlib');
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
  const signature = crypto.createHmac('sha256', apiSecret).update(digest).digest('base64');
  return { op: 'login', args: [apiKey, apiPassphrase, timestamp, signature] };
};
/**
 * 
 * @param {string} type
 * @param {string} symbol
 * @param {string} channel
 * @param {WsN.WebSocket} webSocket 
 * @param {WsN.wsOptions} wsOptions 
 */
function connectWebSocket(type, symbol, channel, webSocket, wsOptions) {
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const apiPassphrase = wsOptions.apiPassphrase;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}${type}`);
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
      const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
      if (messageParse.event === 'login' && messageParse.code === '0') {
        const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
        const request = { op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }], };
        webSocket.send(JSON.stringify(request));
      }
      if (messageParse.event === 'subscribe' && messageParse.arg.channel === channel) {
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
 * @param {WsN.dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/** 
 * @param {Object} snapshot 
 * @param {WsN.dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  orderBook._insertSnapshotAsks(snapshot.data.asks.map(v => {
    return { id: +v[0], price: +v[0], quantity: +v[1] };
  }));
  orderBook._insertSnapshotBids(snapshot.data.bids.map(v => {
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
 * @param {WsN.wsOptions} [wsOptions]
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
   * @type {WsN.Ws} 
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
    orders: async (ordersParams) => {
      /** @type {WsN.ordersEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const openOrders = [];
      // Orders websocket
      const symbol = ordersParams.symbol;
      const channel = 'order';
      const webSocket = WebSocket();
      await connectWebSocket('private', symbol, channel, webSocket, wsOptions);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.arg.channel !== channel) { return };
        const creationOrders = [];
        const executionOrders = [];
        const cancelationOrders = [];
        for (let i = 0; messageParse.data[i]; i += 1) {
          const order = messageParse.data[i];
          if (order.instrument_id === ordersParams.symbol) {
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
                const fillAndUpdate = getFillAndUpdateOpenOrders(order);
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
          eventEmitter.emit('creations-updates', creationOrders);
        }
        if (executionOrders.length) {
          eventEmitter.emit('executions', executionOrders);
        }
        if (cancelationOrders.length) {
          eventEmitter.emit('cancelations', cancelationOrders);
        }
      });
      webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsOptions));
      return { events: eventEmitter };
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
    position: async (positionParams) => {
      /** @type {WsN.positionEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const symbol = positionParams.symbol;
      const channel = 'positions';
      const webSocket = WebSocket();
      await connectWebSocket('private', symbol, channel, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.arg.channel !== channel) { return };
        const positionEvent = messageParse.data.find(v => v.instId === symbol);
        if (!positionEvent) { return };
        position.pxS = positionEvent && positionEvent.posSide === 'short' ? +positionEvent.avgPx : 0;
        position.pxB = positionEvent && positionEvent.posSide === 'long' ? +positionEvent.avgPx : 0;
        position.qtyS = positionEvent && positionEvent.posSide === 'short' ? +positionEvent.pos : 0;
        position.qtyB = positionEvent && positionEvent.posSide === 'long' ? +positionEvent.pos : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsOptions));
      return { info: position, events: eventEmitter };
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
    liquidation: async (liquidationParams) => {
      /** @type {WsN.liquidationEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const symbol = liquidationParams.symbol;
      // Instrument websocket
      const channelMark = 'mark-price';
      const webSocketMark = WebSocket();
      // Position websocket
      const channelPosition = 'position';
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
      /** @type {WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketMark.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.arg.channel !== channelMark) { return };
        const instrumentEvent = messageParse.data.find(v => v.instId === symbol);
        if (!instrumentEvent) { return };
        liquidation.markPx = +instrumentEvent.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.arg.channel !== channelPosition) { return };
        const positionEvent = messageParse.data.find(v => v.instId === symbol);
        if (!positionEvent) { return };
        liquidation.pxS = positionEvent && positionEvent.posSide === 'short' ? +positionEvent.avgPx : 0;
        liquidation.pxB = positionEvent && positionEvent.posSide === 'long' ? +positionEvent.avgPx : 0;
        liquidation.qtyS = positionEvent && positionEvent.posSide === 'short' ? +positionEvent.pos : 0;
        liquidation.qtyB = positionEvent && positionEvent.posSide === 'long' ? +positionEvent.pos : 0;
        liquidation.liqPxS = positionEvent && positionEvent.posSide === 'short' ? +positionEvent.liqPx : 0;
        liquidation.liqPxB = positionEvent && positionEvent.posSide === 'long' ? +positionEvent.liqPx : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketMark.addOnClose(() => connectWebSocket('public', symbol, channelMark, webSocketMark, wsOptions));
      webSocketPosition.addOnClose(() => connectWebSocket('private', symbol, channelPosition, webSocketPosition, wsOptions));
      return { info: liquidation, events: eventEmitter };
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
    orderBook: async (orderBookParams) => {
      // Connect websocket
      const channel = 'books-l2-tbt';
      const symbol = orderBookParams.symbol;
      const webSocket = WebSocket();
      await connectWebSocket('public', symbol, channel, webSocket, wsOptions);
      // Order book functionality
      const orderBook = OrderBook();
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.arg.channel !== channel) { return };
        if (messageParse.action === 'snapshot') {
          return synchronizeOrderBookSnapshot(messageParse, orderBook);
        }
        if (messageParse.action === 'update') {
          const timestamp = Date.now();
          const orderBookTimestamp = +messageParse.data[0].ts;
          if (timestamp - orderBookTimestamp > 5000) {
            return webSocket.disconnect();
          }
          messageParse.data[0].asks.forEach(v => {
            orderBook._updateOrderByPriceAsk({ id: +v[0], price: +v[0], quantity: +v[1] });
          });
          messageParse.data[0].bids.forEach(v => {
            orderBook._updateOrderByPriceBid({ id: +v[0], price: +v[0], quantity: +v[1] });
          });
        }
      });
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(orderBook);
        connectWebSocket('public', symbol, channel, webSocket, wsOptions);
      });
      return { info: orderBook };
    },
  };
  return ws;
}
module.exports = Ws;
