const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBookData = require('../../_shared-classes/order-books-data');
const OrderBooksDataClient = require('../../_shared-classes/order-books-data-client');
const OrderBooksDataServer = require('../../_shared-classes/order-books-data-server');

// Phemex Exclusive Settings Scale

const priceScale = 10000;
const ratioScale = 100000000;
const valueScale = 100000000;

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
  eventData.symbol = data.symbol;
  eventData.event = 'creations-updates';
  eventData.id = data.orderID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.priceEp / priceScale;
  eventData.quantity = +data.orderQty;
  eventData.timestamp = moment(+data.transactTimeNs/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'executions';
  eventData.id = data.orderID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.execPriceEp / priceScale;
  eventData.quantity = +data.execQty;
  eventData.timestamp = moment(+data.transactTimeNs/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'cancelations';
  eventData.id = data.orderID;
  eventData.timestamp = moment(+data.transactTimeNs/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const expiry = (Math.round(Date.now() / 1000) + 60);
  const signatureString = apiKey + expiry;
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureString).digest('hex');
  const id = 1000;
  const method = 'user.auth';
  const params = ["API", apiKey, signature, expiry]
  return { method, params, id };
};
/**
 * 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}`);
    function connnectOnOpenFunction() {
      const signedRequest = getSignedRequest(apiKey, apiSecret);
      if (signedRequest) {
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
      if (messageParse.id === 1000 && messageParse.result.status === 'success') {
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
 * @param {string} method
 * @param {Array} params
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(method, params, webSocket) {
  return new Promise((resolve) => {
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const subscribeId = +`${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${method}|${params}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.id === subscribeId && messageParse.result.status === 'success') {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ id: subscribeId, method, params, }));  
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
  wsSettings.URL = wsSettings.URL || 'wss://phemex.com/ws';
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
  });
  /** 
   * 
   * 
   * WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
   const webSocket = WebSocket('phemex', wsSettings);
   webSocket.addOnClose(async () => {
     await connectWebSocket(webSocket, wsSettings);
     for (const params of ordersWsObject.subscriptions) await ordersWsObject.subscribe(params);
     for (const params of positionsWsObject.subscriptions) await positionsWsObject.subscribe(params);
     for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
     for (const params of tradesWsObject.subscriptions) await tradesWsObject.subscribe(params);
     for (const params of orderBooksWsObject.subscriptions) await orderBooksWsObject.subscribe(params);
   });
   if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocket.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
   async function connectWebSockets() {
    await connectWebSocket(webSocket, wsSettings);
    // Subscribe to Account-Order-Poisition Stream
    await confirmSubscription('aop.subscribe', [], webSocket);
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
    // if (messageParse && messageParse.type === 'snapshot') { return };
    if (!messageParse.orders) { return };
    if (!messageParse.orders.length) { return };
    const creationOrders = [];
    const executionOrders = [];
    const cancelationOrders = [];
    messageParse.orders = messageParse.orders.sort((a, b) => parseFloat(a.transactTimeNs) - parseFloat(b.transactTimeNs));
    messageParse.orders.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
      if (orderEvent.execStatus === 'New' || orderEvent.execStatus === 'ReAdded' || orderEvent.execStatus === 'Replaced') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.execStatus === 'Canceled' || orderEvent.execStatus === 'Aborted' || orderEvent.execStatus === 'Expired' || orderEvent.execStatus === 'ReplaceRejected' || orderEvent.execStatus === 'CancelRejected') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
      if (orderEvent.execStatus === 'MakerFill' || orderEvent.execStatus === 'TakerFill') {
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
      if (!webSocket.findOnMessage(ordersOnMessage)) { webSocket.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription('aop.subscribe', [], webSocket);
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
    if (!messageParse.positions) { return };
    if (!messageParse.positions.length) { return };
    messageParse.positions.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!positionData) { return };
      positionData.pxS = positionEvent && positionEvent.side == 'Sell' ? +positionEvent.avgEntryPriceEp / priceScale : 0;
      positionData.pxB = positionEvent && positionEvent.side == 'Buy' ? +positionEvent.avgEntryPriceEp / priceScale : 0;
      positionData.qtyS = positionEvent && positionEvent.side == 'Sell' ? Math.abs(+positionEvent.size) : 0;
      positionData.qtyB = positionEvent && positionEvent.side == 'Buy' ? Math.abs(+positionEvent.size) : 0;
    });
    positionsWsObject.events.emit('update', positionsWsObject.data);
  };
  /** @type {import('../../../typings/_ws').positionsWsObject} */
  const positionsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(positionsOnMessage)) { webSocket.addOnMessage(positionsOnMessage) };
      const positionData = (await rest.getPosition(params)).data;
      if (!positionsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        positionsWsObject.subscriptions.push(Object.assign({}, params));
        positionsWsObject.data.push(Object.assign({}, params, positionData));
      } else {
        Object.assign(positionsWsObject.data.find(v => v.symbol === params.symbol), positionData);
      }
      await confirmSubscription('aop.subscribe', [], webSocket);
    },
    data: [],
    events: new Events.EventEmitter(),
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
    if (!messageParse.market24h) { return };
    const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === messageParse.market24h.symbol);
    if (!liquidationsData) { return };
    liquidationsData.markPx = +messageParse.market24h.markPrice / priceScale;
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.positions) { return };
    if (!messageParse.positions.length) { return };
    messageParse.positions.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!liquidationData) { return };
      liquidationData.pxS = positionEvent && positionEvent.side == 'Sell' ? Math.abs(+positionEvent.size) : 0;
      liquidationData.pxB = positionEvent && positionEvent.side == 'Buy' ? Math.abs(+positionEvent.size) : 0;
      liquidationData.qtyS = positionEvent && positionEvent.side == 'Sell' ? +positionEvent.avgEntryPriceEp / priceScale : 0;
      liquidationData.qtyB = positionEvent && positionEvent.side == 'Buy' ? +positionEvent.avgEntryPriceEp / priceScale : 0;
      liquidationData.liqPxS = positionEvent && positionEvent.side == 'Sell' ? +positionEvent.liquidationPriceEp / priceScale  : 0;
      liquidationData.liqPxB = positionEvent && positionEvent.side == 'Buy' ? +positionEvent.liquidationPriceEp / priceScale  : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageMarkPrice)) { webSocket.addOnMessage(liquidationsOnMessageMarkPrice) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePosition)) { webSocket.addOnMessage(liquidationsOnMessagePosition) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription('market24h.subscribe', [], webSocket);
      await confirmSubscription('aop.subscribe', [], webSocket);
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
    if (!messageParse.trades) { return };
    if (!messageParse.trades.length) {return};
    const trades = [];
    messageParse.trades.forEach(tradeEvent => {
      const tradeData = {};
      if (!tradeEvent.length) { return };
      tradeData.side = tradeEvent[1];
      tradeData.price = +tradeEvent[2] / priceScale;
      tradeData.quantity = +tradeEvent[3];
      tradeData.timestamp = moment(+tradeEvent[0]/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
      trades.push(Object.assign({}, tradeData));
    });
    if (trades.length) { tradesWsObject.events.emit('trades', trades) };
  };
  /** @type {import('../../../typings/_ws').tradesWsObject} */
  const tradesWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(tradesOnMessage)) { webSocket.addOnMessage(tradesOnMessage) };
      const lastPriceData = (await rest.getLastPrice(params)).data;
      if (!tradesWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        tradesWsObject.subscriptions.push(Object.assign({}, params));
        tradesWsObject.data.push({ symbol: params.symbol, side: 'buy', price: lastPriceData, quantity: 0, timestamp: '' });
      } else {
        Object.assign(tradesWsObject.data.find(v => v.symbol === params.symbol), { price: lastPriceData });
      }
      await confirmSubscription('trade.subscribe', [params.symbol], webSocket);
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
    if (!messageParse.book) { return };
    if (messageParse.type !== 'snapshot' && messageParse.type !== 'incremental') { return };
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.symbol);
    if (!orderBookData) { return };
    const orderBookEvent = messageParse;
    if ((Date.now() - +orderBookEvent.timestamp / 1000000) > 5000) { return webSocket.close(); }
    orderBookEvent.book.asks.forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask[0] / priceScale, price: +ask[0] / priceScale, quantity: +ask[1] });
    });
    orderBookEvent.book.bids.forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid[0] / priceScale, price: +bid[0] / priceScale, quantity: +bid[1] });
    });
  };
  /** @type {import('../../../typings/_ws').orderBooksWsObject} */
  const orderBooksWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(orderBooksOnMessage)) { webSocket.addOnMessage(orderBooksOnMessage) };
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
      await confirmSubscription('orderbook.subscribe', [params.symbol], webSocket);
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
