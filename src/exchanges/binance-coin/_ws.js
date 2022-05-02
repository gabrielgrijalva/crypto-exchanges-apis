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
    function connectFunction() {
      resolve();
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connectFunction);
    };
    webSocket.addOnOpen(connectFunction, false);
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
    const subscribeId = `${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${subscribeId}`) }, 60000);
    webSocketMarketStream.addOnMessage(function confirmSubscriptionFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.id === subscribeId && !messageParse.result) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocketMarketStream.removeOnMessage(confirmSubscriptionFunction);
      }
    }, false);
    webSocketMarketStream.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream] }));
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
 * @param {import('../../../typings/_ws').orderBooksData[]} orderBooksData
 */
function desynchronizeOrderBooks(orderBooksData) {
  orderBooksData.forEach(orderBookData => {
    orderBookData.asks.length = 0;
    orderBookData.bids.length = 0;
    orderBookData.otherData.snapshot = null;
    orderBookData.otherData.synchronized = false;
    orderBookData.otherData.synchronizing = false;
  });
};
/**
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').orderBooksData} orderBookData
 */
function synchronizeOrderBookSnapshot(snapshot, orderBookData) {
  orderBookData.insertSnapshotAsks(snapshot.asks.map(v => {
    return { id: +v.id, price: +v.price, quantity: +v.quantity };
  }));
  orderBookData.insertSnapshotBids(snapshot.bids.map(v => {
    return { id: +v.id, price: +v.price, quantity: +v.quantity };
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
  let getListenKeyInterval = null;
  webSocketUserStream.addOnOpen(() => setInterval(() => rest._getListenKey(), 1800000));
  webSocketUserStream.addOnClose(() => clearInterval(getListenKeyInterval));
  webSocketUserStream.addOnClose(() => connectWebSocket('user', rest, webSocketUserStream, wsSettings));
  /**
   * 
   * 
   * MARKET WEBSOCKET
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketMarketStream = WebSocket('binance-coin:market-stream', wsSettings);
  webSocketMarketStream.addOnClose(() => connectWebSocket('market', rest, webSocketMarketStream, wsSettings));
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    if (wsSettings.API_KEY && wsSettings.API_SECRET) {
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
    console.log(messageParse);
    if (messageParse.e !== 'ORDER_TRADE_UPDATE') { return };
    if (!ordersWsObject.subscriptions.find(v => v.symbol === messageParse.o.s)) { return };
    if (messageParse.o.x === 'NEW') {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(messageParse)]);
    }
    if (messageParse.o.x === 'TRADE' || messageParse.o.x === 'CALCULATED') {
      ordersWsObject.events.emit('executions', [createExecution(messageParse)]);
    }
    if (messageParse.o.x === 'CANCELED' || messageParse.o.x === 'EXPIRED') {
      ordersWsObject.events.emit('cancelations', [createCancelation(messageParse)]);
    }
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketUserStream.findOnMessage(ordersOnMessage)) { webSocketUserStream.addOnMessage(ordersOnMessage) };
      ordersWsObject.subscriptions.push(params);
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
    console.log(messageParse);
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
      positionsWsObject.subscriptions.push(params);
      const position = (await rest.getPosition(params)).data;
      positionsWsObject.data.push(Object.assign(params, position));
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
    reqData.res.positions.forEach(position => {
      const positionData = liquidationsWsObject.data.find(v => v.symbol === position.symbol);
      if (!positionData) { return };
      positionData.liqPxS = +position.positionAmt < 0 ? +position.liquidationPrice : 0;
      positionData.liqPxB = +position.positionAmt > 0 ? +position.liquidationPrice : 0;
    });
  };
  const liquidationsOnMessageMarketStream = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.e !== 'markPriceUpdate') { return };
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === messageParse.s);
    if (!liquidationData) { return };
    liquidationData.markPx = +messageParse.p;
    webSocketUserStream.send(JSON.stringify({ id: 1000, method: 'REQUEST', params: ['@position'] }));
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketUserStream.findOnMessage(liquidationsOnMessageUserStream)) { webSocketUserStream.addOnMessage(liquidationsOnMessageUserStream) };
      if (!webSocketMarketStream.findOnMessage(liquidationsOnMessageMarketStream)) { webSocketMarketStream.addOnMessage(liquidationsOnMessageMarketStream) };
      liquidationsWsObject.subscriptions.push(params);
      const position = (await rest.getPosition(params)).data;
      const liquidation = (await rest.getLiquidation(params)).data;
      positionsWsObject.data.push(Object.assign(params, position, liquidation));
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
    const tradeData = tradesWsObject.data.find(v => v.symbol === messageParse.s);
    if (!tradeData) { return };
    tradeData.side = messageParse.m ? 'sell' : 'buy';
    tradeData.price = +messageParse.p;
    tradeData.quantity = +messageParse.q;
    tradeData.timestamp = moment(+messageParse.E).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
    tradesWsObject.events.emit('trade', [tradeData]);
  };
  /** @type {import('../../../typings/_ws').tradesWsObject} */
  const tradesWsObject = {
    subscribe: async (params) => {
      if (!webSocketMarketStream.findOnMessage(tradesOnMessage)) { webSocketMarketStream.addOnMessage(tradesOnMessage) };
      tradesWsObject.subscriptions.push(params);
      const lastPrice = (await rest.getLastPrice(params)).data;
      tradesWsObject.data.push({ symbol: params.symbol, side: 'buy', price: lastPrice, quantity: 0, timestamp: '' });
      return confirmSubscription(`${params.symbol.toLowerCase()}@trade`, webSocketMarketStream);
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
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.s);
    if (!orderBookData) { return };
    if (!orderBookData.otherData.synchronized) {
      if (!orderBookData.otherData.synchronizing) {
        if (!orderBookData.otherData.snapshot) {
          getOrderBookSnapshot(rest, orderBookData);
        } else {
          const snapshot = orderBookData.otherData.snapshot;
          if (snapshot.lastUpdateId < messageParse.U) {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = false;
            orderBookData.otherData.synchronizing = false;
          }
          if (snapshot.lastUpdateId >= messageParse.U && snapshot.lastUpdateId <= messageParse.u) {
            orderBookData.otherData.snapshot = null;
            orderBookData.otherData.synchronized = true;
            orderBookData.otherData.synchronizing = false;
            synchronizeOrderBookSnapshot(snapshot, orderBookData);
          }
        }
      }
    }
    if (!orderBookData.otherData.synchronized) { return };
    const orderBookTimestamp = +messageParse.E;
    if (Date.now() - orderBookTimestamp > 5000) {
      webSocketMarketStream.close();
    }
    messageParse.a.forEach(v => {
      const update = { id: +v[0], price: +v[0], quantity: +v[1] };
      orderBookData.updateOrderByPriceAsk(update);
    });
    messageParse.b.forEach(v => {
      const update = { id: +v[0], price: +v[0], quantity: +v[1] };
      orderBookData.updateOrderByPriceBid(update);
    })
  };
  const orderBooksOnClose = () => desynchronizeOrderBooks(orderBooksWsObject.data);
  /** @type {import('../../../typings/_ws').orderBooksWsObject} */
  const orderBooksWsObject = {
    subscribe: async (params) => {
      if (!webSocketMarketStream.findOnMessage(orderBooksOnMessage)) { webSocketMarketStream.addOnMessage(orderBooksOnMessage) };
      if (!webSocketMarketStream.findOnClose(orderBooksOnClose)) { webSocketMarketStream.addOnClose(orderBooksOnClose) };
      orderBooksWsObject.subscriptions.push(params);
      orderBooksWsObject.data.push(OrderBookData({
        SYMBOL: params.symbol,
        FROZEN_CHECK_INTERVAL: params.frozenCheckInterval,
        PRICE_OVERLAPS_CHECK_INTERVAL: params.priceOverlapsCheckInterval,
      }));
      return confirmSubscription(`${params.symbol.toLowerCase()}@depth@100ms`, webSocketMarketStream);
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
   * @type {import('../../../typings/_ws').Ws} 
   */
  const ws = {
    connect: connectWebSockets,
    orders: ordersWsObject,
    positions: positionsWsObject,
    liquidations: liquidationsWsObject,
    trades: tradesWsObject,
    orderBooks: orderBooksWsObject,
    orderBooksClient: OrderBooksDataClient(),
    orderBooksServer: OrderBooksDataServer(),
  };
  return ws;
}
module.exports = Ws;
