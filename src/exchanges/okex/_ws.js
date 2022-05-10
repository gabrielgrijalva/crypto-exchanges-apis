const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBookData = require('../../_shared-classes/order-books-data');
const OrderBooksDataClient = require('../../_shared-classes/order-books-data-client');
const OrderBooksDataServer = require('../../_shared-classes/order-books-data-server');
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
  eventData.symbol = data.instId;
  eventData.event = 'creations-updates';
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.px;
  eventData.quantity = +data.sz;
  eventData.timestamp = moment(+data.uTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.instId;
  eventData.event = 'executions';
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.fillPx;
  eventData.quantity = +data.fillSz;
  eventData.timestamp = moment(+data.fillTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.instId;
  eventData.event = 'cancelations';
  eventData.id = data.clOrdId;
  eventData.timestamp = moment(+data.uTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 * @param {string} apiPassphrase
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
 * @param {'public' | 'private'} type
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(type, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const apiPassphrase = wsSettings.API_PASSPHRASE;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/${type}`);
    function connnectOnOpenFunction() {
      if (type === 'private') {
        const signedRequest = getSignedRequest(apiKey, apiSecret, apiPassphrase);
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.event === 'login' && messageParse.code === '0') {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction, false);
    webSocket.addOnMessage(connectOnMessageFunction, false);
  });
};
/**
 * 
 * @param {string} symbol
 * @param {string} channel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(symbol, channel, webSocket) {
  return new Promise((resolve) => {
    const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${symbol}|${channel}`) }, 60000);
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.event === 'subscribe' && messageParse.arg.channel === channel) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }] }));
  });
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
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function Ws(wsSettings = {}) {
  /**
   * 
   * 
   * DEFAULT WS SETTINGS VALUES
   * 
   * 
   */
  wsSettings.URL = wsSettings.URL || 'wss://ws.okex.com:8443/ws/v5';
  /** 
   * 
   * 
   * REST
   * 
   * 
   * @type {import('../../../typings/_rest').Rest} */
  const rest = Rest({
    API_KEY: wsSettings.API_KEY,
    API_SECRET: wsSettings.API_SECRET,
    API_PASSPHRASE: wsSettings.API_PASSPHRASE,
  });
  /** 
   * 
   * 
   * WEBSOCKET PUBLIC
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPublic = WebSocket('okex:public', wsSettings);
  webSocketPublic.addOnClose(async () => {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    liquidationsWsObject.subscriptions.forEach(params => liquidationsWsObject.subscribe(params));
    tradesWsObject.subscriptions.forEach(params => tradesWsObject.subscribe(params));
    orderBooksWsObject.subscriptions.forEach(params => orderBooksWsObject.subscribe(params));
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPublic.addOnMessage((message) => console.log(JSON.parse(message))) };
  /** 
   * 
   * 
   * WEBSOCKET PRIVATE
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPrivate = WebSocket('okex:private', wsSettings);
  webSocketPrivate.addOnClose(async () => {
    await connectWebSocket('private', webSocketPrivate, wsSettings)
    ordersWsObject.subscriptions.forEach(params => ordersWsObject.subscribe(params));
    positionsWsObject.subscriptions.forEach(params => positionsWsObject.subscribe(params));
    liquidationsWsObject.subscriptions.forEach(params => liquidationsWsObject.subscribe(params));
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPrivate.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    if (wsSettings.API_KEY && wsSettings.API_SECRET && wsSettings.API_PASSPHRASE) {
      await connectWebSocket('private', webSocketPrivate, wsSettings);
    }
  };
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessage = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'orders' || !messageParse.data) { return };
    const creationOrders = [];
    const executionOrders = [];
    const cancelationOrders = [];
    messageParse.data.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.instId)) { return };
      if (orderEvent.state === 'live' || orderEvent.amendResult === '0') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.state === 'canceled' || orderEvent.amendResult === '-1') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
      if (orderEvent.fillPx || orderEvent.fillTime || +orderEvent.fillSz) {
        executionOrders.push(createExecution(orderEvent));
      }
    });
    if (creationOrders.length) { ordersWsObject.events.emit('creations-updates', creationOrders) };
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
    if (cancelationOrders.length) { ordersWsObject.events.emit('cancelations', cancelationOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(ordersOnMessage)) { webSocketPrivate.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription(params.symbol, 'orders', webSocketPrivate);
    },
    data: null,
    events: new Events.EventEmitter(),
    subscriptions: [],
  };
  /** 
   * 
   * 
   * POSITIONS
   * 
   * 
   */
  const positionsOnMessage = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'positions' || !messageParse.data) { return };
    messageParse.data.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.instId);
      if (!positionData) { return };
      positionData.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
      positionData.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
      positionData.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
      positionData.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
    });
  };
  /** @type {import('../../../typings/_ws').positionsWsObject} */
  const positionsWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(positionsOnMessage)) { webSocketPrivate.addOnMessage(positionsOnMessage) };
      const positionData = (await rest.getPosition(params)).data;
      if (!positionsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        positionsWsObject.subscriptions.push(Object.assign({}, params));
        positionsWsObject.data.push(Object.assign({}, params, positionData));
      } else {
        Object.assign(positionsWsObject.data.find(v => v.symbol === params.symbol), positionData);
      }
      await confirmSubscription(params.symbol, 'positions', webSocketPrivate);
    },
    data: [],
    events: null,
    subscriptions: [],
  };
  /** 
   * 
   * 
   * LIQUIDATIONS
   * 
   * 
   */
  const liquidationsOnMessageMarkPrice = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'mark-price' || !messageParse.data) { return };
    messageParse.data.forEach(markPriceEvent => {
      const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === markPriceEvent.instId);
      if (!liquidationsData) { return };
      liquidationsData.markPx = +markPriceEvent.markPx;
    });
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'positions' || !messageParse.data) { return };
    messageParse.data.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.instId);
      if (!liquidationData) { return };
      liquidationData.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
      liquidationData.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
      liquidationData.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
      liquidationData.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
      liquidationData.liqPxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.liqPx : 0;
      liquidationData.liqPxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.liqPx : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketPublic.findOnMessage(liquidationsOnMessageMarkPrice)) { webSocketPublic.addOnMessage(liquidationsOnMessageMarkPrice) };
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessagePosition)) { webSocketPrivate.addOnMessage(liquidationsOnMessagePosition) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(params.symbol, 'mark-price', webSocketPublic);
      await confirmSubscription(params.symbol, 'positions', webSocketPrivate);
    },
    data: [],
    events: null,
    subscriptions: [],
  };
  /** 
   * 
   * 
   * TRADES
   * 
   * 
   */
  const tradesOnMessage = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'trades' || !messageParse.data) { return };
    const trades = [];
    messageParse.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.instId);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.side;
      tradeData.price = +tradeEvent.px;
      tradeData.quantity = +tradeEvent.sz;
      tradeData.timestamp = moment(+tradeEvent.ts).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
      trades.push(Object.assign({}, tradeData));
    });
    if (trades.length) { tradesWsObject.events.emit('trades', trades) };
  };
  /** @type {import('../../../typings/_ws').tradesWsObject} */
  const tradesWsObject = {
    subscribe: async (params) => {
      if (!webSocketPublic.findOnMessage(tradesOnMessage)) { webSocketPublic.addOnMessage(tradesOnMessage) };
      const lastPriceData = (await rest.getLastPrice(params)).data;
      if (!tradesWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        tradesWsObject.subscriptions.push(Object.assign({}, params));
        tradesWsObject.data.push({ symbol: params.symbol, side: 'buy', price: lastPriceData, quantity: 0, timestamp: '' });
      } else {
        Object.assign(tradesWsObject.data.find(v => v.symbol === params.symbol), { price: lastPriceData });
      }
      await confirmSubscription(params.symbol, 'trades', webSocketPublic);
    },
    data: [],
    events: new Events.EventEmitter(),
    subscriptions: [],
  };
  /** 
   * 
   * 
   * ORDER BOOKS
   * 
   * 
   */
  const orderBooksOnMessage = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'books') { return };
    if (messageParse.action !== 'snapshot' && messageParse.action !== 'update') { return };
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.arg.instId);
    if (!orderBookData) { return };
    const orderBookEvent = messageParse.data[0];
    if ((Date.now() - +orderBookEvent.ts) > 5000) { return webSocketPublic.close(); }
    orderBookEvent.asks.forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask[0], price: +ask[0], quantity: +ask[1] });
    });
    orderBookEvent.bids.forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid[0], price: +bid[0], quantity: +bid[1] });
    });
  };
  /** @type {import('../../../typings/_ws').orderBooksWsObject} */
  const orderBooksWsObject = {
    subscribe: async (params) => {
      if (!webSocketPublic.findOnMessage(orderBooksOnMessage)) { webSocketPublic.addOnMessage(orderBooksOnMessage) };
      if (!orderBooksWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        orderBooksWsObject.subscriptions.push(Object.assign({}, params));
        orderBooksWsObject.data.push(OrderBookData({
          SYMBOL: params.symbol,
          FROZEN_CHECK_INTERVAL: params.frozenCheckInterval,
          PRICE_OVERLAPS_CHECK_INTERVAL: params.priceOverlapsCheckInterval,
        }));
      }
      const orderBookData = orderBooksWsObject.data.find(v => v.symbol === params.symbol);
      orderBookData.asks.length = 0;
      orderBookData.bids.length = 0;
      await confirmSubscription(params.symbol, 'books', webSocketPublic);
    },
    data: [],
    events: null,
    subscriptions: [],
  };
  /** 
   * 
   * 
   * WS IMPLEMENTATION
   * 
   * 
   * @type {import('../../../typings/_ws').Ws} */
  const ws = {
    connect: connectWebSockets,
    orders: ordersWsObject,
    positions: positionsWsObject,
    positionsOptions: null,
    liquidations: liquidationsWsObject,
    trades: tradesWsObject,
    orderBooks: orderBooksWsObject,
    orderBooksClient: OrderBooksDataClient(orderBooksWsObject),
    orderBooksServer: OrderBooksDataServer(orderBooksWsObject),
    markPricesOptions: null,
  };
  return ws;
}
module.exports = Ws;
