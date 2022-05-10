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
  eventData.symbol = data.instrument;
  eventData.event = 'creations-updates';
  eventData.id = data.cli_ord_id;
  eventData.side = !data.direction ? 'buy' : 'sell';
  eventData.price = +data.limit_price;
  eventData.quantity = +data.qty + +data.filled;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.instrument;
  eventData.event = 'executions';
  eventData.id = data.cli_ord_id;
  eventData.side = data.buy ? 'buy' : 'sell';
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.cli_ord_id.split('-')[0];
  eventData.event = 'cancelations';
  eventData.id = data.cli_ord_id;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} challenge
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSingatureParams(challenge, apiKey, apiSecret) {
  const hash = crypto.createHash('sha256').update(challenge).digest();
  const decoded = Buffer.from(apiSecret, 'base64');
  const signed = crypto.createHmac('sha512', decoded).update(hash).digest('base64');
  return { api_key: apiKey, original_challenge: challenge, signed_challenge: signed };
};
/**
 * 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = !wsSettings.API_KEY || !wsSettings.API_SECRET ? wsSettings.URL : wsSettings.URL.replace('api.', '');
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connectOnOpenFunction() {
      resolve();
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connectOnOpenFunction);
    };
    webSocket.addOnOpen(connectOnOpenFunction, false);
  });
};
/**
 * 
 * @param {string} feed
 * @param {string} symbol 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function confirmSubscription(feed, symbol, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const requestParams = !symbol ? { feed, event: 'subscribe' } : { feed, event: 'subscribe', product_ids: [symbol] };
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${feed}|${symbol}`) }, 60000);
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.event === 'challenge' && messageParse.message) {
        const signatureParams = getSingatureParams(messageParse.message, apiKey, apiSecret);
        webSocket.send(JSON.stringify(Object.assign({}, requestParams, signatureParams)));
      }
      if ((messageParse.event === 'subscribed' && messageParse.feed === feed)
        || (messageParse.event === 'alert' && messageParse.message === 'Already subscribed to feed, re-requesting')) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(!apiKey || !apiSecret
      ? JSON.stringify(requestParams)
      : JSON.stringify({ event: 'challenge', api_key: apiKey }));
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
  wsSettings.URL = wsSettings.URL || 'wss://api.futures.kraken.com/ws/v1';
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
  const webSocket = WebSocket('kraken', wsSettings);
  webSocket.addOnClose(async () => {
    await connectWebSocket(webSocket, wsSettings);
    ordersWsObject.subscriptions.forEach(params => ordersWsObject.subscribe(params));
    positionsWsObject.subscriptions.forEach(params => positionsWsObject.subscribe(params));
    liquidationsWsObject.subscriptions.forEach(params => liquidationsWsObject.subscribe(params));
    tradesWsObject.subscriptions.forEach(params => tradesWsObject.subscribe(params));
    orderBooksWsObject.subscriptions.forEach(params => orderBooksWsObject.subscribe(params));
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
  };
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessageOpenOrders = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.feed !== 'open_orders') { return };
    if (messageParse.reason === 'edited_by_user'
      || messageParse.reason === 'new_placed_order_by_user') {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === messageParse.order.instrument)) { return };
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(messageParse.order)]);
    }
    if (messageParse.reason === 'cancelled_by_user'
      || messageParse.reason === 'market_inactive'
      || messageParse.reason === 'post_order_failed_because_it_would_filled'
      || messageParse.reason === 'ioc_order_failed_because_it_would_not_be_executed') {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === messageParse.cli_ord_id.split('-')[0])) { return };
      ordersWsObject.events.emit('cancelations', [createCancelation(messageParse)]);
    }
  };
  const ordersOnMessageFills = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.feed !== 'fills' || !messageParse.fills) { return };
    const executionOrders = [];
    messageParse.fills.forEach(fillEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === fillEvent.instrument)) { return };
      executionOrders.push(createExecution(fillEvent));
    });
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(ordersOnMessageOpenOrders)) { webSocket.addOnMessage(ordersOnMessageOpenOrders) };
      if (!webSocket.findOnMessage(ordersOnMessageFills)) { webSocket.addOnMessage(ordersOnMessageFills) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription('open_orders', '', webSocket, wsSettings);
      await confirmSubscription('fills', '', webSocket, wsSettings);
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
    if (messageParse.feed !== 'open_positions') { return };
    positionsWsObject.data.forEach(positionData => {
      const positionEvent = (messageParse.positions || []).find(v => v.instrument === positionData.symbol);
      positionData.pxS = positionEvent && positionEvent.balance < 0 ? positionEvent.entry_price : 0;
      positionData.qtyS = positionEvent && positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
      positionData.pxB = positionEvent && positionEvent.balance > 0 ? positionEvent.entry_price : 0;
      positionData.qtyB = positionEvent && positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
    });
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
      await confirmSubscription('open_positions', '', webSocket, wsSettings);
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
  const liquidationsOnMessageTicker = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.feed !== 'ticker') { return };
    const tickerEvent = messageParse;
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === tickerEvent.product_id);
    if (!liquidationData) { return };
    liquidationData.markPx = +tickerEvent.markPrice ? +tickerEvent.markPrice : 0;
  };
  const liquidationsOnMessageOpenPositions = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.feed !== 'open_positions') { return };
    liquidationsWsObject.data.forEach(liquidationData => {
      const positionEvent = (messageParse.positions || []).find(v => v.instrument === liquidationData.symbol);
      liquidationData.pxS = positionEvent && positionEvent.balance < 0 ? positionEvent.entry_price : 0;
      liquidationData.qtyS = positionEvent && positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
      liquidationData.pxB = positionEvent && positionEvent.balance > 0 ? positionEvent.entry_price : 0;
      liquidationData.qtyB = positionEvent && positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
      liquidationData.liqPxS = positionEvent && positionEvent.balance < 0 ? positionEvent.liquidation_threshold : 0;
      liquidationData.liqPxB = positionEvent && positionEvent.balance > 0 ? positionEvent.liquidation_threshold : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageTicker)) { webSocket.addOnMessage(liquidationsOnMessageTicker) };
      if (!webSocket.findOnMessage(liquidationsOnMessageOpenPositions)) { webSocket.addOnMessage(liquidationsOnMessageOpenPositions) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription('ticker', params.symbol, webSocket, wsSettings);
      await confirmSubscription('open_positions', '', webSocket, wsSettings);
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
    if (messageParse.feed !== 'trade') { return };
    const tradeEvent = messageParse;
    const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.product_id);
    if (!tradeData) { return };
    tradeData.side = messageParse.side;
    tradeData.price = +messageParse.price;
    tradeData.quantity = +messageParse.qty;
    tradeData.timestamp = moment(+messageParse.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
    tradesWsObject.events.emit('trades', [Object.assign({}, tradeData)]);
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
      await confirmSubscription('trade', params.symbol, webSocket, wsSettings);
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
    if (messageParse.feed !== 'book_snapshot' && messageParse.feed !== 'book') { return };
    const orderBookEvent = messageParse;
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.product_id)
    if (!orderBookData) { return };
    if ((Date.now() - +orderBookEvent.timestamp) > 5000) { return webSocket.close() };
    if (messageParse.feed === 'book_snapshot') {
      orderBookEvent.asks.forEach(ask => {
        orderBookData.updateOrderByPriceAsk({ id: +ask.price, price: +ask.price, quantity: +ask.qty });
      });
      orderBookEvent.bids.forEach(bid => {
        orderBookData.updateOrderByPriceBid({ id: +bid.price, price: +bid.price, quantity: +bid.qty });
      });
    }
    if (messageParse.feed === 'book') {
      if (orderBookEvent.side === 'sell') {
        orderBookData.updateOrderByPriceAsk({ id: +messageParse.price, price: +messageParse.price, quantity: +messageParse.qty });
      }
      if (orderBookEvent.side === 'buy') {
        orderBookData.updateOrderByPriceBid({ id: +messageParse.price, price: +messageParse.price, quantity: +messageParse.qty });
      }
    }
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
      await confirmSubscription('book', params.symbol, webSocket, wsSettings);
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
