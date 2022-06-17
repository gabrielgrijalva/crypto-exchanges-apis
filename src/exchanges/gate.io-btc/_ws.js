const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const wait = require('../../_utils/wait');
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
  eventData.symbol = data.contract;
  eventData.event = 'creations-updates';
  eventData.id = data.text;
  eventData.side = +data.size < 0 ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.size);
  eventData.timestamp = moment(+data.finish_time_ms).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.contract;
  eventData.event = 'executions';
  eventData.id = data.text;
  eventData.side = +data.size < 0 ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.size);
  eventData.timestamp = moment(+data.create_time_ms).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.contract;
  eventData.event = 'cancelations';
  eventData.id = data.text;
  eventData.timestamp = moment(+data.finish_time_ms).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} channel
 * @param {string} event
 * @param {number} time
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getAuth(channel, event, time, apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const digest = qs.stringify({ channel, event, time });
  const signature = crypto.createHmac('sha512', apiSecret).update(digest).digest('hex');
  return { method: 'api_key', KEY: apiKey, SIGN: signature };
};
/**
 * 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      resolve();
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connnectOnOpenFunction);
    };
    webSocket.addOnOpen(connnectOnOpenFunction, false);
  });
};
/**
 * 
 * @param {boolean} private
 * @param {string} channel
 * @param {any[]} payload
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function confirmSubscription(private, channel, payload, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const time = moment.utc().unix();
    const event = 'subscribe';
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const auth = private ? getAuth(channel, event, time, apiKey, apiSecret) : null;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${channel}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.result && messageParse.result.status === 'success' && messageParse.channel === channel) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ time, channel, event, payload, auth }));
  });
};
/**
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').orderBooksData} orderBooksData
 */
async function getOrderBookSnapshot(rest, orderBooksData) {
  const symbol = orderBooksData.symbol;
  orderBooksData.otherData.synchronizing = true;
  orderBooksData.otherData.snapshot = (await rest._getOrderBook({ symbol })).data;
  orderBooksData.otherData.synchronizing = false;
};
/**
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').orderBooksData} orderBookData
 */
function synchronizeOrderBookSnapshot(snapshot, orderBookData) {
  orderBookData.insertSnapshotAsks(snapshot.asks);
  orderBookData.insertSnapshotBids(snapshot.bids);
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
  wsSettings.URL = wsSettings.URL || 'wss://fx-ws.gateio.ws/v4/ws/btc';
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
  const webSocket = WebSocket('gate.io-btc', wsSettings);
  webSocket.addOnMessage(message => {
    const messageParse = JSON.parse(message);
    if (messageParse.channel !== 'futures.ping') { return };
    webSocket.send(JSON.stringify({ time: moment.utc().unix(), channel: 'futures.pong' }));
  });
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
  };
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessageOrders = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.channel !== 'futures.orders' || messageParse.event !== 'update') { return };
    const creationOrders = [];
    const cancelationOrders = [];
    messageParse.result.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.contract)) { return };
      if (orderEvent.finish_as === '_new') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.finish_as === 'cancelled') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
    });
    if (creationOrders.length) { ordersWsObject.events.emit('creations-updates', creationOrders) };
    if (cancelationOrders.length) { ordersWsObject.events.emit('cancelations', cancelationOrders) };
  };
  const ordersOnMessageUserTrades = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.channel !== 'futures.usertrades' || messageParse.event !== 'update') { return };
    const executionOrders = [];
    messageParse.result.forEach(tradeEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === tradeEvent.contract)) { return };
      executionOrders.push(createExecution(tradeEvent));
    });
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(ordersOnMessageOrders)) { webSocket.addOnMessage(ordersOnMessageOrders) };
      if (!webSocket.findOnMessage(ordersOnMessageUserTrades)) { webSocket.addOnMessage(ordersOnMessageUserTrades) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription(true, 'futures.orders', [wsSettings.API_USER_ID, params.symbol], webSocket, wsSettings);
      await confirmSubscription(true, 'futures.usertrades', [wsSettings.API_USER_ID, params.symbol], webSocket, wsSettings);
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
    if (messageParse.channel !== 'futures.positions' || messageParse.event !== 'update') { return };
    messageParse.result.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.contract);
      if (!positionData) { return };
      positionData.pxS = +positionEvent.size < 0 ? +positionEvent.entry_price : 0;
      positionData.pxB = +positionEvent.size > 0 ? +positionEvent.entry_price : 0;
      positionData.qtyS = +positionEvent.size < 0 ? Math.abs(+positionEvent.size) : 0;
      positionData.qtyB = +positionEvent.size > 0 ? Math.abs(+positionEvent.size) : 0;
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
      await confirmSubscription(true, 'futures.positions', [wsSettings.API_USER_ID, params.symbol], webSocket, wsSettings);
    },
    data: [],
    events: new Events.EventEmitter,
    subscriptions: [],
  };
  /** 
   * 
   * 
   * LIQUIDATIONS
   * 
   * 
   */
  const liquidationsOnMessageMarkPrice = async (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.channel !== 'futures.tickers' || messageParse.event !== 'update') { return };
    messageParse.result.forEach(tickerEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === tickerEvent.contract);
      if (!liquidationData) { return };
      liquidationData.markPx = +tickerEvent.mark_price;
    });
  };
  const liquidationsOnMessagePositions = async (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.channel !== 'futures.positions' || messageParse.event !== 'update') { return };
    messageParse.result.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.contract);
      if (!liquidationData) { return };
      liquidationData.pxS = +positionEvent.size < 0 ? +positionEvent.entry_price : 0;
      liquidationData.pxB = +positionEvent.size > 0 ? +positionEvent.entry_price : 0;
      liquidationData.qtyS = +positionEvent.size < 0 ? Math.abs(+positionEvent.size) : 0;
      liquidationData.qtyB = +positionEvent.size > 0 ? Math.abs(+positionEvent.size) : 0;
      liquidationData.liqPxS = +positionEvent.size < 0 ? +positionEvent.liq_price : 0;
      liquidationData.liqPxB = +positionEvent.size > 0 ? +positionEvent.liq_price : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageMarkPrice)) { webSocket.addOnMessage(liquidationsOnMessageMarkPrice) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePositions)) { webSocket.addOnMessage(liquidationsOnMessagePositions) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(false, 'futures.tickers', [params.symbol], webSocket, wsSettings);
      await confirmSubscription(true, 'futures.positions', [wsSettings.API_USER_ID, params.symbol], webSocket, wsSettings);
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
    if (messageParse.channel !== 'futures.trades' || messageParse.event !== 'update') { return };
    const trades = [];
    messageParse.result.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.contract);
      if (!tradeData) { return };
      tradeData.side = +tradeEvent.size < 0 ? 'sell' : 'buy';
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = Math.abs(+tradeEvent.size);
      tradeData.timestamp = moment(tradeEvent.create_time_ms).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription(false, 'futures.trades', [params.symbol], webSocket, wsSettings);
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
    if (messageParse.method !== 'futures.order_book_update' || messageParse.event !== 'update') { return };
    const orderBookEvent = messageParse.result;
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.s);
    if (!orderBookData) { return };
    if (!orderBookData.otherData.synchronized) {
      if (!orderBookData.otherData.synchronizing) {
        if (!orderBookData.otherData.snapshot) {
          getOrderBookSnapshot(rest, orderBookData);
        } else {
          const snapshot = orderBookData.otherData.snapshot;
          if ((snapshot.lastUpdateId + 1) < orderBookEvent.U || (snapshot.lastUpdateId + 1) > orderBookEvent.u) {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = false;
            orderBookData.otherData.synchronizing = false;
          }
          else {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = true;
            orderBookData.otherData.synchronizing = false;
            synchronizeOrderBookSnapshot(snapshot, orderBookData);
          }
        }
      }
    }
    if (!orderBookData.otherData.synchronized) { return };
    if ((Date.now() - +orderBookEvent.t) > 5000) { return webSocket.close() };
    orderBookEvent.a.forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask.p, price: +ask.p, quantity: +ask.s });
    });
    orderBookEvent.b.forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid.p, price: +bid.p, quantity: +bid.s });
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
      orderBookData.otherData.snapshot = null;
      orderBookData.otherData.synchronized = false;
      orderBookData.otherData.synchronizing = false;
      await confirmSubscription(false, 'futures.order_book_update', [params.symbol, '100ms', '100'], webSocket, wsSettings);
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
