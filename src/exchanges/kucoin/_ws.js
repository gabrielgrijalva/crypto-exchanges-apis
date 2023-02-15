const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBookData = require('../../_shared-classes/order-books-data');
const OrderBooksDataClient = require('../../_shared-classes/order-books-data-client');
const OrderBooksDataServer = require('../../_shared-classes/order-books-data-server');
const { randomUUID } = require('crypto');
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
  eventData.id = data.orderId;
  eventData.side = data.side;
  eventData.price = +data.price;
  eventData.quantity = +data.size;
  eventData.timestamp = moment(+data.ts/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'executions';
  eventData.id = data.orderId;
  eventData.side = data.side;
  eventData.price = +data.matchPrice;
  eventData.quantity = +data.matchSize;
  eventData.timestamp = moment(+data.orderTime/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'cancelations';
  eventData.id = data.orderId;
  eventData.timestamp = moment(+data.ts/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/**
 * 
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function connectWebSocket(type, rest, webSocket) {
  return new Promise(async (resolve) => {
    const connectionToken = (await rest._getConnectionToken(type))
    const url = connectionToken.data.instanceServers[0].endpoint;
    const token = connectionToken.data.token;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}?token=${token}&[connectId=${randomUUID}]`);
    function connectOnOpenFunction() {
      resolve(); 
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connectOnOpenFunction);
    }
    webSocket.addOnOpen(connectOnOpenFunction, false);
  });
};
/**
 * 
 * @param {string} topic
 * @param {boolean} privateChannel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(topic, privateChannel, webSocket) {
  return new Promise((resolve) => {
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const subscribeId = +`${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${topic}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (+messageParse.id == subscribeId && messageParse.type === 'ack') {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ id: subscribeId, type: 'subscribe', topic, privateChannel, response: true }));
  });
};
/**
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').orderBooksData} orderBooksData
 */
async function getOrderBookSnapshot(rest, orderBooksData) {
  const symbol = orderBooksData.symbol;
  orderBooksData.otherData.synchronizing = true;
  await new Promise(res => setTimeout(res, 1)); // delay request 2 seconds
  orderBooksData.otherData.snapshot = (await rest._getOrderBook({ symbol })).data;
  console.log('=> orderBook Snapshot LastUpdateId:', orderBooksData.otherData.snapshot.lastUpdateId)
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
 */
let orderBookCache = [];
/**
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').orderBooksData} orderBookData
 */
function synchronizeOrderBookSnapshotWithCache(snapshot, orderBookData) {
  for(let i = 0; i < orderBookCache.length; i++){
    if(orderBookCache[i][3] >= snapshot.lastUpdateId){
      if(orderBookCache[i][1] === 'buy'){
        orderBookData.updateOrderByPriceBid({ id: +orderBookCache[i][0], price: +orderBookCache[i][0], quantity: +orderBookCache[i][2] });
      } else if (orderBookCache[i][1] === 'sell'){
        orderBookData.updateOrderByPriceAsk({ id: +orderBookCache[i][0], price: +orderBookCache[i][0], quantity: +orderBookCache[i][2] });
      }
      orderBookData.otherData.snapshot.lastUpdateId = orderBookCache[i][3]
    }
  }
  orderBookCache = [];
}
/**
 * 
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
   * PRIVATE WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPrivate = WebSocket('kucoin:private', wsSettings);
  webSocketPrivate.addOnClose(async () => {
    await connectWebSocket('private', rest, webSocketPrivate);
    for (const params of ordersWsObject.subscriptions) await ordersWsObject.subscribe(params);
    for (const params of positionsWsObject.subscriptions) await positionsWsObject.subscribe(params);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPrivate.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * PUBLIC WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPublic = WebSocket('kucoin:public', wsSettings);
  webSocketPublic.addOnClose(async () => {
    await connectWebSocket('public', rest, webSocketPublic);
    for (const params of tradesWsObject.subscriptions) await tradesWsObject.subscribe(params);
    for (const params of orderBooksWsObject.subscriptions) await orderBooksWsObject.subscribe(params);
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPublic.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    if (wsSettings.API_KEY && wsSettings.API_SECRET) {
      await connectWebSocket('private', rest, webSocketPrivate);
    }
    await connectWebSocket('public', rest, webSocketPublic);
  }
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== '/contractMarket/tradeOrders') { return };
    const orderEvent = messageParse.data;
    if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
    if (orderEvent.type === 'open' || orderEvent.type === 'update') {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(orderEvent)]);
    }
    if (orderEvent.type === 'match') {
      ordersWsObject.events.emit('executions', [createExecution(orderEvent)]);
    }
    if (orderEvent.type === 'canceled') {
      ordersWsObject.events.emit('cancelations', [createCancelation(orderEvent)]);
    }
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(ordersOnMessage)) { webSocketPrivate.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription(`/contractMarket/tradeOrders`, true, webSocketPrivate);
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
    if (!messageParse.topic || !messageParse.topic.includes('/contract/position')) { return };
    if (messageParse.data.changeReason !== 'positionChange') { return }
    const positionData = positionsWsObject.data.find(v => v.symbol === messageParse.data.symbol);
    if (!positionData) { return };
    const positionEvent = messageParse.data
    positionData.pxS = +positionEvent.currentQty < 0 ? +positionEvent.avgEntryPrice : 0;
    positionData.pxB = +positionEvent.currentQty > 0 ? +positionEvent.avgEntryPrice : 0;
    positionData.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
    positionData.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
    positionsWsObject.events.emit('update', positionsWsObject.data);
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
      await confirmSubscription(`/contract/position:${params.symbol}`, true, webSocketPrivate);
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
  const liquidationsOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.topic || !messageParse.topic.includes('/contract/position')) { return };
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === messageParse.data.symbol);
    if (!liquidationData) { return };
    const positionEvent = messageParse.data;
    if (messageParse.data.changeReason == 'positionChange') { 
      liquidationData.pxS = positionEvent && +positionEvent.currentQty < 0 ? +positionEvent.avgEntryPrice : 0;
      liquidationData.pxB = positionEvent && +positionEvent.currentQty > 0 ? +positionEvent.avgEntryPrice : 0;
      liquidationData.qtyS = positionEvent && +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
      liquidationData.qtyB = positionEvent && +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
      liquidationData.liqPxS = positionEvent && +positionEvent.currentQty < 0 ? +positionEvent.liquidationPrice : 0;
      liquidationData.liqPxB = positionEvent && +positionEvent.currentQty > 0 ? +positionEvent.liquidationPrice : 0;
      liquidationData.markPx = positionEvent ? +positionEvent.markPrice : 0;
     }
     if (messageParse.data.changeReason == 'markPriceChange') {
      liquidationData.markPx = positionEvent ? +positionEvent.markPrice : 0;
     }
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessage)) { webSocketPrivate.addOnMessage(liquidationsOnMessage) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(`/contract/position:${params.symbol}`, true, webSocketPrivate);
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
    if (!messageParse.topic || !messageParse.topic.includes('/contractMarket/execution') || !messageParse.subject || messageParse.subject !== 'match') { return };
    const tradeEvent = messageParse.data;
    const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.symbol);
    if (!tradeData) { return };
    tradeData.side = tradeEvent.side;
    tradeData.price = +tradeEvent.price;
    tradeData.quantity = +tradeEvent.size;
    tradeData.timestamp = moment(+tradeEvent.ts/1000000).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
    tradesWsObject.events.emit('trades', [Object.assign({}, tradeData)]);
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
      await confirmSubscription(`/contractMarket/execution:${params.symbol}`, false, webSocketPublic);
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
    if (!messageParse.topic || !messageParse.topic.includes('/contractMarket/level2') || !messageParse.subject || messageParse.subject !== 'level2' ) { return };
    if (!messageParse.data.change) { return }
    const orderBookEvent = messageParse.data.change.split(',');
    orderBookEvent.push(messageParse.data.sequence);
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.topic.split(":")[1]);
    if (!orderBookData) { return };
    if (!orderBookData.otherData.synchronized) {
      orderBookCache.push(orderBookEvent)
      if (!orderBookData.otherData.synchronizing) {
        if (!orderBookData.otherData.snapshot) {
          getOrderBookSnapshot(rest, orderBookData);
        } else {
          const snapshot = orderBookData.otherData.snapshot;
          const result = orderBookCache.find(a => a[3] === snapshot.lastUpdateId);
          if (result){ synchronizeOrderBookSnapshotWithCache(snapshot, orderBookData) };
          if (snapshot.lastUpdateId < orderBookEvent[3]) {
            console.log('ob not syncd')
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = false;
            orderBookData.otherData.synchronizing = false;
          }
          if (snapshot.lastUpdateId >= orderBookEvent[3] && snapshot.lastUpdateId <= orderBookEvent[3]) {
            console.log('ob syncd')
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = true;
            orderBookData.otherData.synchronizing = false;
            synchronizeOrderBookSnapshot(snapshot, orderBookData);
          }
        }
      }
    }
    if (!orderBookData.otherData.synchronized) { return };
    if ((Date.now() - +messageParse.data.timestamp) > 5000) { return webSocketPublic.close() };
    if(orderBookEvent[1] === 'buy'){
      orderBookData.updateOrderByPriceBid({ id: +orderBookEvent[0], price: +orderBookEvent[0], quantity: +orderBookEvent[2] });
    } else if (orderBookEvent[1] === 'sell'){
      orderBookData.updateOrderByPriceAsk({ id: +orderBookEvent[0], price: +orderBookEvent[0], quantity: +orderBookEvent[2] });
    }
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
      orderBookData.otherData.snapshot = null;
      orderBookData.otherData.synchronized = false;
      orderBookData.otherData.synchronizing = false;
      await confirmSubscription(`/contractMarket/level2:${params.symbol}`, false, webSocketPublic);
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
