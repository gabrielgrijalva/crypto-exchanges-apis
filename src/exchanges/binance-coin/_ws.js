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
  eventData.symbol = data.o.s;
  eventData.event = 'creations-updates';
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.p;
  eventData.quantity = +data.o.q;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.o.s;
  eventData.event = 'executions';
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.L;
  eventData.quantity = +data.o.l;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.o.s;
  eventData.event = 'cancelations';
  eventData.id = data.o.c;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/**
 * 
 * @param {'user' | 'market'} type
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(type, rest, webSocket, wsSettings) {
  return new Promise(async (resolve) => {
    const url = wsSettings.URL;
    const stream = type === 'user' ? (await rest._getListenKey()).data : 'stream';
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/ws/${stream}`);
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
 * @param {string} stream 
 * @param {import('../../../typings/_ws').WebSocket} webSocketMarketStream 
 */
function confirmSubscription(stream, webSocketMarketStream) {
  return new Promise((resolve) => {
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const subscribeId = +`${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${stream}`) }, 60000);
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.id === subscribeId && !messageParse.result) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocketMarketStream.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocketMarketStream.addOnMessage(confirmOnMessageFunction, false);
    webSocketMarketStream.send(JSON.stringify({ id: subscribeId, method: 'SUBSCRIBE', params: [stream] }));
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
  wsSettings.URL = wsSettings.URL || 'wss://dstream.binance.com';
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
   * USER WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketUserStream = WebSocket('binance-coin:user-stream', wsSettings);
  let listenKey = '';
  let listenKeyInterval = null;
  webSocketUserStream.addOnOpen(() => listenKeyInterval = setInterval(async () => listenKey = (await rest._getListenKey()).data, 1800000));
  webSocketUserStream.addOnClose(() => clearInterval(listenKeyInterval));
  webSocketUserStream.addOnClose(() => connectWebSocket('user', rest, webSocketUserStream, wsSettings));
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketUserStream.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * MARKET WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketMarketStream = WebSocket('binance-coin:market-stream', wsSettings);
  webSocketMarketStream.addOnClose(async () => {
    await connectWebSocket('market', rest, webSocketMarketStream, wsSettings);
    liquidationsWsObject.subscriptions.forEach(params => liquidationsWsObject.subscribe(params));
    tradesWsObject.subscriptions.forEach(params => tradesWsObject.subscribe(params));
    orderBooksWsObject.subscriptions.forEach(params => orderBooksWsObject.subscribe(params));
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketMarketStream.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    if (wsSettings.API_KEY && wsSettings.API_SECRET) {
      listenKey = (await rest._getListenKey()).data;
      await connectWebSocket('user', rest, webSocketUserStream, wsSettings);
    }
    await connectWebSocket('market', rest, webSocketMarketStream, wsSettings);
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
    if (messageParse.e !== 'ORDER_TRADE_UPDATE') { return };
    const orderEvent = messageParse.o;
    if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.s)) { return };
    if (orderEvent.x === 'NEW') {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(messageParse)]);
    }
    if (orderEvent.x === 'TRADE' || orderEvent.x === 'CALCULATED') {
      ordersWsObject.events.emit('executions', [createExecution(messageParse)]);
    }
    if (orderEvent.x === 'CANCELED' || orderEvent.x === 'EXPIRED') {
      ordersWsObject.events.emit('cancelations', [createCancelation(messageParse)]);
    }
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketUserStream.findOnMessage(ordersOnMessage)) { webSocketUserStream.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
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
    if (messageParse.e !== 'ACCOUNT_UPDATE') { return };
    messageParse.a.P.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.s);
      if (!positionData) { return };
      positionData.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
      positionData.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
      positionData.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
      positionData.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
    });
  };
  /** @type {import('../../../typings/_ws').positionsWsObject} */
  const positionsWsObject = {
    subscribe: async (params) => {
      if (!webSocketUserStream.findOnMessage(positionsOnMessage)) { webSocketUserStream.addOnMessage(positionsOnMessage) };
      const positionData = (await rest.getPosition(params)).data;
      if (!positionsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        positionsWsObject.subscriptions.push(Object.assign({}, params));
        positionsWsObject.data.push(Object.assign({}, params, positionData));
      } else {
        Object.assign(positionsWsObject.data.find(v => v.symbol === params.symbol), positionData);
      }
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
  const liquidationsOnMessageUserStream = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.id || messageParse.id !== 1000) { return };
    const reqData = messageParse.result.find(v => v.req.includes('@position'));
    if (!reqData) { return };
    liquidationsWsObject.data.forEach(liquidationData => {
      const positionEvent = reqData.res.positions.find(v => v.symbol === liquidationData.symbol);
      liquidationData.pxS = positionEvent && +positionEvent.positionAmt < 0 ? +positionEvent.entryPrice : 0;
      liquidationData.pxB = positionEvent && +positionEvent.positionAmt > 0 ? +positionEvent.entryPrice : 0;
      liquidationData.qtyS = positionEvent && +positionEvent.positionAmt < 0 ? Math.abs(+positionEvent.positionAmt) : 0;
      liquidationData.qtyB = positionEvent && +positionEvent.positionAmt > 0 ? Math.abs(+positionEvent.positionAmt) : 0;
      liquidationData.liqPxS = positionEvent && +positionEvent.positionAmt < 0 ? +positionEvent.liquidationPrice : 0;
      liquidationData.liqPxB = positionEvent && +positionEvent.positionAmt > 0 ? +positionEvent.liquidationPrice : 0;
    });
  };
  const liquidationsOnMessageMarketStream = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.e !== 'markPriceUpdate') { return };
    const liquidationEvent = messageParse;
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === liquidationEvent.s);
    if (!liquidationData) { return };
    liquidationData.markPx = +liquidationEvent.p;
    webSocketUserStream.send(JSON.stringify({ id: 1000, method: 'REQUEST', params: [`${listenKey}@position`] }));
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketUserStream.findOnMessage(liquidationsOnMessageUserStream)) { webSocketUserStream.addOnMessage(liquidationsOnMessageUserStream) };
      if (!webSocketMarketStream.findOnMessage(liquidationsOnMessageMarketStream)) { webSocketMarketStream.addOnMessage(liquidationsOnMessageMarketStream) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(`${params.symbol.toLowerCase()}@markPrice`, webSocketMarketStream);
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
    if (messageParse.e !== 'trade') { return };
    const tradeEvent = messageParse;
    const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.s);
    if (!tradeData) { return };
    tradeData.side = tradeEvent.m ? 'sell' : 'buy';
    tradeData.price = +tradeEvent.p;
    tradeData.quantity = +tradeEvent.q;
    tradeData.timestamp = moment(+tradeEvent.E).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
    tradesWsObject.events.emit('trades', [Object.assign({}, tradeData)]);
  };
  /** @type {import('../../../typings/_ws').tradesWsObject} */
  const tradesWsObject = {
    subscribe: async (params) => {
      if (!webSocketMarketStream.findOnMessage(tradesOnMessage)) { webSocketMarketStream.addOnMessage(tradesOnMessage) };
      const lastPriceData = (await rest.getLastPrice(params)).data;
      if (!tradesWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        tradesWsObject.subscriptions.push(Object.assign({}, params));
        tradesWsObject.data.push({ symbol: params.symbol, side: 'buy', price: lastPriceData, quantity: 0, timestamp: '' });
      } else {
        Object.assign(tradesWsObject.data.find(v => v.symbol === params.symbol), { price: lastPriceData });
      }
      await confirmSubscription(`${params.symbol.toLowerCase()}@trade`, webSocketMarketStream);
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
    if (messageParse.e !== 'depthUpdate') { return };
    const orderBookEvent = messageParse;
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.s);
    if (!orderBookData) { return };
    if (!orderBookData.otherData.synchronized) {
      if (!orderBookData.otherData.synchronizing) {
        if (!orderBookData.otherData.snapshot) {
          getOrderBookSnapshot(rest, orderBookData);
        } else {
          const snapshot = orderBookData.otherData.snapshot;
          if (snapshot.lastUpdateId < orderBookEvent.U) {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = false;
            orderBookData.otherData.synchronizing = false;
          }
          if (snapshot.lastUpdateId >= orderBookEvent.U && snapshot.lastUpdateId <= orderBookEvent.u) {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = true;
            orderBookData.otherData.synchronizing = false;
            synchronizeOrderBookSnapshot(snapshot, orderBookData);
          }
        }
      }
    }
    if (!orderBookData.otherData.synchronized) { return };
    if ((Date.now() - +orderBookEvent.E) > 5000) { return webSocketMarketStream.close() };
    orderBookEvent.a.forEach(v => {
      orderBookData.updateOrderByPriceAsk({ id: +v[0], price: +v[0], quantity: +v[1] });
    });
    orderBookEvent.b.forEach(v => {
      orderBookData.updateOrderByPriceBid({ id: +v[0], price: +v[0], quantity: +v[1] });
    });
  };
  /** @type {import('../../../typings/_ws').orderBooksWsObject} */
  const orderBooksWsObject = {
    subscribe: async (params) => {
      if (!webSocketMarketStream.findOnMessage(orderBooksOnMessage)) { webSocketMarketStream.addOnMessage(orderBooksOnMessage) };
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
      await confirmSubscription(`${params.symbol.toLowerCase()}@depth@100ms`, webSocketMarketStream);
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
