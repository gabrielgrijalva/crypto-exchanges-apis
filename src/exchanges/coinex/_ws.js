const fs = require('fs');
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
  eventData.symbol = data.market;
  eventData.event = 'creations-updates';
  eventData.id = data.order_id.toString();
  eventData.side = data.side === 1 ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = +data.amount;
  eventData.timestamp = moment.unix(+data.create_time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.market;
  eventData.event = 'executions';
  eventData.id = data.order_id.toString();
  eventData.side = data.side === 1 ? 'sell' : 'buy';
  eventData.price = +data.last_deal_price;
  eventData.quantity = +data.last_deal_amount;
  eventData.timestamp = moment.unix(+data.last_deal_time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.market;
  eventData.event = 'cancelations';
  eventData.id = data.order_id.toString();
  eventData.timestamp = moment.unix(+data.update_time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const timestamp = Date.now();
  const signatureStr = `access_id=${apiKey}&timestamp=${timestamp}&secret_key=${apiSecret}`;
  const signature = crypto.createHash('sha256').update(signatureStr).digest('hex');
  const id = 1000;
  const method = 'server.sign';
  const params = [apiKey, signature, timestamp];
  return { id, method, params };
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
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${method}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
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
  wsSettings.URL = wsSettings.URL || 'wss://perpetual.coinex.com/';
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
  const webSocket = WebSocket('coinex', wsSettings);
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
    if (orderEvent.last_deal_type == 8 || orderEvent.last_deal_type == 9 || orderEvent.last_deal_type == 12 || orderEvent.last_deal_type == 13){
      console.log(`Received Liquidation or ADL Event (${orderEvent.last_deal_type})`)
      fs.writeFileSync(wsSettings.LIQUIDATION_STATUS_FILE, 'close-liquidation');
      return;
    }
    if (orderEvent.create_time === orderEvent.update_time) {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(orderEvent)]);
    }
    if (orderEvent.last_deal_time === orderEvent.update_time) {
      if (orderEvent.type === 1) {
        ordersWsObject.events.emit('executions', [createExecution(orderEvent)]);
      }
      if (orderEvent.type === 2 && !(+orderEvent.left)) {
        orderEvent.last_deal_amount = orderEvent.amount;
        ordersWsObject.events.emit('executions', [createExecution(orderEvent)]);
      }
    }
    if (messageParse.params[0] === 3 && +orderEvent.left) {
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
    if (messageParse.method !== 'position.update') { return };
    const positionEvent = messageParse.params[1];
    const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.market);
    if (!positionData) { return };
    positionData.pxS = +positionEvent.amount && positionEvent.side === 1 ? +positionEvent.open_price : 0;
    positionData.pxB = +positionEvent.amount && positionEvent.side === 2 ? +positionEvent.open_price : 0;
    positionData.qtyS = +positionEvent.amount && positionEvent.side === 1 ? +positionEvent.amount : 0;
    positionData.qtyB = +positionEvent.amount && positionEvent.side === 2 ? +positionEvent.amount : 0;
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
      await confirmSubscription('position.subscribe', [params.symbol], webSocket);
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
  const liquidationsOnMessageMarket = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.method !== 'state.update') { return };
    messageParse.params.forEach(marketEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => marketEvent[v.symbol]);
      if (!liquidationData) { return };
      liquidationData.markPx = +marketEvent[liquidationData.symbol].sign_price;
    });
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.method !== 'position.update') { return };
    const positionEvent = messageParse.params[1];
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.market);
    if (!liquidationData) { return };
    liquidationData.pxS = +positionEvent.amount && positionEvent.side === 1 ? +positionEvent.open_price : 0;
    liquidationData.pxB = +positionEvent.amount && positionEvent.side === 2 ? +positionEvent.open_price : 0;
    liquidationData.qtyS = +positionEvent.amount && positionEvent.side === 1 ? +positionEvent.amount : 0;
    liquidationData.qtyB = +positionEvent.amount && positionEvent.side === 2 ? +positionEvent.amount : 0;
    liquidationData.liqPxS = +positionEvent.amount && positionEvent.side === 1 ? +positionEvent.liq_price : 0;
    liquidationData.liqPxB = +positionEvent.amount && positionEvent.side === 2 ? +positionEvent.liq_price : 0;
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageMarket)) { webSocket.addOnMessage(liquidationsOnMessageMarket) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePosition)) { webSocket.addOnMessage(liquidationsOnMessagePosition) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription('state.subscribe', [params.symbol], webSocket);
      await confirmSubscription('position.subscribe', [params.symbol], webSocket);
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
    if (messageParse.method !== 'deals.update') { return };
    const tradeData = tradesWsObject.data.find(v => v.symbol === messageParse.params[0]);
    if (!tradeData) { return };
    const trades = [];
    messageParse.params[1].reverse().forEach(tradeEvent => {
      tradeData.side = tradeEvent.type;
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.amount;
      tradeData.timestamp = moment.unix(tradeEvent.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription('deals.subscribe', [params.symbol], webSocket);
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
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.params[2]);
    if (!orderBookData) { return };
    if (messageParse.params[0]) {
      orderBookData.asks.length = 0;
      orderBookData.bids.length = 0;
      const parseSnapshotMapFunction = (v) => { return { id: +v[0], price: +v[0], quantity: +v[1] } };
      orderBookData.insertSnapshotAsks((messageParse.params[1].asks || []).map(parseSnapshotMapFunction));
      orderBookData.insertSnapshotBids((messageParse.params[1].bids || []).map(parseSnapshotMapFunction));
    }
    if (!messageParse.params[0]) {
      (messageParse.params[1].asks || []).forEach(v => orderBookData.updateOrderByPriceAsk({
        id: +v[0], price: +v[0], quantity: +v[1],
      }));
      (messageParse.params[1].bids || []).forEach(v => orderBookData.updateOrderByPriceBid({
        id: +v[0], price: +v[0], quantity: +v[1],
      }));
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
      const subsParams = orderBooksWsObject.subscriptions.map(v => [v.symbol, 100, '0', true]);
      await confirmSubscription('depth.subscribe_multi', subsParams, webSocket);
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
