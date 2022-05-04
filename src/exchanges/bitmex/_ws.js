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
  eventData.symbol = data.symbol;
  eventData.event = 'creations-updates';
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.orderQty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'executions';
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.lastPx;
  eventData.quantity = +data.lastQty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'cancelations';
  eventData.id = data.clOrdID;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const signedHeaders = getSignedHeaders(apiKey, apiSecret);
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url, { headers: signedHeaders });
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.info && messageParse.info === 'Welcome to the BitMEX Realtime API.') {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    }
    webSocket.addOnMessage(connectOnMessageFunction, false);
  });
};
/**
 * 
 * @param {string} topic 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(topic, webSocket) {
  return new Promise((resolve) => {
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${topic}`) }, 60000);
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.success && messageParse.subscribe === topic) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
  });
};
/**
 * 
 * @param {import('../../../typings/_ws').orderBooksData[]} orderBooksData
 */
function desynchronizeOrderBooks(orderBooksData) {
  orderBooksData.forEach(orderBookData => {
    orderBookData.asks.length = 0;
    orderBookData.bids.length = 0;
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
  wsSettings.URL = wsSettings.URL || 'wss://ws.bitmex.com/realtime';
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
   * WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocket = WebSocket('bitmex', wsSettings);
  webSocket.addOnClose(() => connectWebSocket(webSocket, wsSettings));
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
  };
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.table !== `execution` || messageParse.action !== 'insert' || !messageParse.data) { return };
    const creationOrders = [];
    const executionOrders = [];
    const cancelationOrders = [];
    messageParse.data.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
      if (orderEvent.execType === 'New' || orderEvent.execType === 'Replaced') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.execType === 'Trade') {
        executionOrders.push(createExecution(orderEvent));
      }
      if (orderEvent.execType === 'Canceled') {
        cancelationOrders.push(createCancelation(orderEvent))
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
      ordersWsObject.subscriptions.push(Object.assign({}, params));
      await confirmSubscription(`execution:${params.symbol}`, webSocket);
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
    const messageParse = JSON.parse(message);
    if (messageParse.table !== 'position' || !messageParse.data) { return };
    messageParse.data.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!positionData) { return };
      if (isNaN(+positionEvent.currentQty)) { return };
      positionData.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : positionData.pxS) : 0;
      positionData.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : positionData.pxB) : 0;
      positionData.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
      positionData.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
    });
  };
  /** @type {import('../../../typings/_ws').positionsWsObject} */
  const positionsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(positionsOnMessage)) { webSocket.addOnMessage(positionsOnMessage) };
      positionsWsObject.subscriptions.push(Object.assign({}, params));
      const position = (await rest.getPosition(params)).data;
      positionsWsObject.data.push(Object.assign({}, params, position));
      await confirmSubscription(`position:${params.symbol}`, webSocket);
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
  const liquidationsOnMessageInstrument = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.table !== 'instrument' || !messageParse.data) { return };
    messageParse.data.forEach(instrumentEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === instrumentEvent.symbol);
      if (!liquidationData) { return };
      liquidationData.markPx = +instrumentEvent.markPrice ? +instrumentEvent.markPrice : liquidationData.markPx;
    });
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.table !== 'position' || !messageParse.data) { return };
    messageParse.data.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!liquidationData) { return };
      if (isNaN(+positionEvent.currentQty)) { return };
      liquidationData.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidationData.pxS) : 0;
      liquidationData.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidationData.pxB) : 0;
      liquidationData.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
      liquidationData.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
      liquidationData.liqPxS = +positionEvent.currentQty < 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidationData.liqPxS) : 0;
      liquidationData.liqPxB = +positionEvent.currentQty > 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidationData.liqPxB) : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageInstrument)) { webSocket.addOnMessage(liquidationsOnMessageInstrument) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePosition)) { webSocket.addOnMessage(liquidationsOnMessagePosition) };
      liquidationsWsObject.subscriptions.push(Object.assign({}, params));
      const position = (await rest.getPosition(params)).data;
      const liquidation = (await rest.getLiquidation(params)).data;
      liquidationsWsObject.data.push(Object.assign({}, params, position, liquidation));
      await confirmSubscription(`instrument:${params.symbol}`, webSocket);
      await confirmSubscription(`position:${params.symbol}`, webSocket);
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
    const messageParse = JSON.parse(message);
    if (messageParse.table !== 'trade' || !messageParse.data) { return };
    const trades = [];
    messageParse.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.symbol);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.side === 'Sell' ? 'sell' : 'buy';
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.size;
      tradeData.timestamp = moment(tradeEvent.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
      trades.push(Object.assign({}, tradeData));
    });
    if (trades.length) { tradesWsObject.events.emit('trades', trades) };
  };
  /** @type {import('../../../typings/_ws').tradesWsObject} */
  const tradesWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(tradesOnMessage)) { webSocket.addOnMessage(tradesOnMessage) };
      tradesWsObject.subscriptions.push(Object.assign({}, params));
      const lastPrice = (await rest.getLastPrice(params)).data;
      tradesWsObject.data.push({ symbol: params.symbol, side: 'buy', price: lastPrice, quantity: 0, timestamp: '' });
      await confirmSubscription(`trade:${params.symbol}`, webSocket);
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
    const messageParse = JSON.parse(message);
    if (messageParse.table !== 'orderBookL2' || !messageParse.data) { return };
    if (messageParse.action === 'partial' || messageParse.action === 'insert') {
      messageParse.data.forEach(orderBookEvent => {
        const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.symbol);
        if (!orderBookData) { return };
        if (orderBookEvent.side === 'Sell') {
          orderBookData.updateOrderByPriceAsk({ id: +orderBookEvent.id, price: +orderBookEvent.price, quantity: +orderBookEvent.size });
        }
        if (orderBookEvent.side === 'Buy') {
          orderBookData.updateOrderByPriceBid({ id: +orderBookEvent.id, price: +orderBookEvent.price, quantity: +orderBookEvent.size });
        }
      });
    }
    if (messageParse.action === 'update') {
      messageParse.data.forEach(orderBookEvent => {
        const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.symbol);
        if (!orderBookData) { return };
        if (orderBookEvent.side === 'Sell') {
          orderBookData.updateOrderByIdAsk({ id: +orderBookEvent.id, price: null, quantity: +orderBookEvent.size });
        }
        if (orderBookEvent.side === 'Buy') {
          orderBookData.updateOrderByIdBid({ id: +orderBookEvent.id, price: null, quantity: +orderBookEvent.size });
        }
      });
    }
    if (messageParse.action === 'delete') {
      messageParse.data.forEach(orderBookEvent => {
        const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.symbol);
        if (!orderBookData) { return };
        if (orderBookEvent.side === 'Sell') {
          orderBookData.deleteOrderByIdAsk({ id: +orderBookEvent.id, price: null, quantity: null });
        }
        if (orderBookEvent.side === 'Buy') {
          orderBookData.deleteOrderByIdBid({ id: +orderBookEvent.id, price: null, quantity: null });
        }
      });
    }
  };
  const orderBooksOnClose = () => desynchronizeOrderBooks(orderBooksWsObject.data);
  /** @type {import('../../../typings/_ws').orderBooksWsObject} */
  const orderBooksWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(orderBooksOnMessage)) { webSocket.addOnMessage(orderBooksOnMessage) };
      if (!webSocket.findOnClose(orderBooksOnClose)) { webSocket.addOnClose(orderBooksOnClose) };
      orderBooksWsObject.subscriptions.push(Object.assign({}, params));
      orderBooksWsObject.data.push(OrderBookData({
        SYMBOL: params.symbol,
        FROZEN_CHECK_INTERVAL: params.frozenCheckInterval,
        PRICE_OVERLAPS_CHECK_INTERVAL: params.priceOverlapsCheckInterval,
      }));
      await confirmSubscription(`orderBookL2:${params.symbol}`, webSocket);
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
  };
  return ws;
}
module.exports = Ws;
