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
  eventData.symbol = data.market;
  eventData.event = 'creations-updates';
  eventData.id = data.id;
  eventData.side = +data.type === 1 ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = +data.amount;
  eventData.timestamp = moment.unix(+data.ctime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.market;
  eventData.event = 'executions';
  eventData.id = data.id;
  eventData.side = +data.type === 1 ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = +data.filledAmount;
  eventData.timestamp = moment.unix(+data.ctime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.market;
  eventData.event = 'cancelations';
  eventData.id = data.id;
  eventData.timestamp = moment.unix(+data.ctime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const timestamp = `${Date.now()}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(timestamp).digest('hex');
  return { id: 1000, method: 'server.sign', params: [apiKey, signature, timestamp] };
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
    webSocket.connect(url);
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
      const messageParse = JSON.parse(message);
      if (messageParse.result && messageParse.result.status === 'success' && messageParse.id === 1000) {
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
 * @param {any[]} params
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(method, params, webSocket) {
  return new Promise((resolve) => {
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const subscribeId = +`${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${method}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.result && messageParse.result.status === 'success' && messageParse.id === subscribeId) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ id: subscribeId, method: method, params: params }));
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
  wsSettings.URL = wsSettings.URL || 'wss://ws.gateio.io/v3/';
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
  const ordersOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.method !== 'order.update') { return };
    const orderEvent = messageParse.params[1];
    if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.market)) { return };
    const orderType = messageParse.params[0];
    if (orderType === 1 || (orderType === 2 && !(+orderEvent.filledAmount))) {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(orderEvent)]);
    }
    if (+orderEvent.filledAmount) {
      ordersWsObject.events.emit('executions', [createExecution(orderEvent)]);
    }
    if (orderType === 3 && +orderEvent.left) {
      ordersWsObject.events.emit('cancelations', [createCancelation(orderEvent)]);
    }
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(ordersOnMessage)) { webSocket.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription('order.subscribe', [params.symbol], webSocket);
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
    if (messageParse.method !== 'order.update') { return };
    const orderEvent = messageParse.params[1];
    const positionData = positionsWsObject.data.find(v => v.symbol === orderEvent.market);
    if (!positionData || !(+orderEvent.filledAmount)) { return };
    let executionQty = +orderEvent.filledAmount;
    const executionPx = +orderEvent.price;
    const positionSide = +orderEvent.type === 1 ? 'S' : 'B';
    const positionSideOpp = +orderEvent.type === 1 ? 'B' : 'S';
    if (positionData[`qty${positionSideOpp}`] > 0) {
      const positionQtySnap = positionData[`qty${positionSideOpp}`];
      positionData[`px${positionSideOpp}`] = positionData[`qty${positionSideOpp}`] > executionQty ? positionData[`px${positionSideOpp}`] : 0;
      positionData[`qty${positionSideOpp}`] = positionData[`qty${positionSideOpp}`] > executionQty ? positionData[`qty${positionSideOpp}`] - executionQty : 0;
      executionQty = executionQty > positionQtySnap ? executionQty - positionQtySnap : 0;
    }
    if (positionData[`qty${positionSide}`] >= 0 && executionQty) {
      const positionRatio = positionData[`px${positionSide}`] / (positionData[`px${positionSide}`] + executionQty);
      const executionRatio = executionQty / (positionData[`px${positionSide}`] + executionQty);
      positionData[`px${positionSide}`] = positionRatio * positionData[`px${positionSide}`] + executionRatio * executionPx;
      positionData[`qty${positionSide}`] = positionData[`qty${positionSide}`] + executionQty;
    }
    positionData[`px${positionSide}`] = positionData[`qty${positionSide}`] ? positionData[`px${positionSide}`] : 0;
    positionData[`px${positionSideOpp}`] = positionData[`qty${positionSideOpp}`] ? positionData[`px${positionSideOpp}`] : 0;
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
      await confirmSubscription('order.subscribe', [params.symbol], webSocket);
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
  let requestLiquidation = false;
  let newRequestLiquidation = false;
  const liquidationsOnMessage = async (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.method !== 'order.update') { return };
    const orderEvent = messageParse.params[1];
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === orderEvent.market);
    if (!liquidationData || !(+orderEvent.filledAmount)) { return };
    let executionQty = +orderEvent.filledAmount;
    const executionPx = +orderEvent.price;
    const positionSide = +orderEvent.type === 1 ? 'S' : 'B';
    const positionSideOpp = +orderEvent.type === 1 ? 'B' : 'S';
    if (liquidationData[`qty${positionSideOpp}`] > 0) {
      const positionQtySnap = liquidationData[`qty${positionSideOpp}`];
      liquidationData[`px${positionSideOpp}`] = liquidationData[`qty${positionSideOpp}`] > executionQty ? liquidationData[`px${positionSideOpp}`] : 0;
      liquidationData[`qty${positionSideOpp}`] = liquidationData[`qty${positionSideOpp}`] > executionQty ? liquidationData[`qty${positionSideOpp}`] - executionQty : 0;
      executionQty = executionQty > positionQtySnap ? executionQty - positionQtySnap : 0;
    }
    if (liquidationData[`qty${positionSide}`] >= 0 && executionQty) {
      const positionRatio = liquidationData[`px${positionSide}`] / (liquidationData[`px${positionSide}`] + executionQty);
      const executionRatio = executionQty / (liquidationData[`px${positionSide}`] + executionQty);
      liquidationData[`px${positionSide}`] = positionRatio * liquidationData[`px${positionSide}`] + executionRatio * executionPx;
      liquidationData[`qty${positionSide}`] = liquidationData[`qty${positionSide}`] + executionQty;
    }
    liquidationData[`px${positionSide}`] = liquidationData[`qty${positionSide}`] ? liquidationData[`px${positionSide}`] : 0;
    liquidationData[`px${positionSideOpp}`] = liquidationData[`qty${positionSideOpp}`] ? liquidationData[`px${positionSideOpp}`] : 0;
    if (requestLiquidation) { newRequestLiquidation = requestLiquidation; return; };
    for (; requestLiquidation || newRequestLiquidation;) {
      requestLiquidation = true;
      newRequestLiquidation = false;
      await wait(1000);
      const response = await rest.getLiquidation({ asset: liquidationData.asset, symbol: liquidationData.symbol });
      requestLiquidation = false;
      liquidationData.liqPxS = response.data.liqPxS;
      liquidationData.liqPxS = response.data.liqPxB;
    }
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessage)) { webSocket.addOnMessage(liquidationsOnMessage) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(`order.subscribe`, [params.symbol], webSocket);
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
    if (messageParse.method !== 'trades.update') { return };
    const tradeData = tradesWsObject.data.find(v => v.symbol === messageParse.params[0]);
    if (!tradeData) { return };
    const trades = [];
    messageParse.params[1].forEach(tradeEvent => {
      tradeData.side = tradeEvent.type;
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.amount;
      tradeData.timestamp = moment.unix(+tradeEvent.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription('trades.subscribe', [params.symbol], webSocket);
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
    if (messageParse.method !== 'depth.update') { return };
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.params[0]);
    if (!orderBookData) { return };
    if (messageParse.params[0]) {
      orderBookData.asks.length = 0;
      orderBookData.bids.length = 0;
    }
    (messageParse.params[1].asks || []).forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask[0], price: +ask[0], quantity: +ask[1] });
    });
    (messageParse.params[1].bids || []).forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid[0], price: +bid[0], quantity: +bid[1] });
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
      await confirmSubscription('depth.subscribe', [params.symbol, 30, '0'], webSocket);
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
