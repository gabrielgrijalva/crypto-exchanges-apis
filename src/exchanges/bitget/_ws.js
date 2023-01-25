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
  const path = '/user/verify';
  const method = 'GET';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = `${timestamp}${method}${path}`;
  const sign = crypto.createHmac('sha256', apiSecret).update(digest).digest('base64');
  const passphrase = apiPassphrase;
  return { op: 'login', args: [{ apiKey, passphrase, timestamp, sign }] };
};
/** 
 * @param {string} symbol
 */
function getProductTypeFromSymbol(symbol) {
  return symbol.split("_")[1].toUpperCase();
}
/** 
 * @param {string} symbol
 */
function getInstIdFromSymbol(symbol) {
  return symbol.split("_")[0].toUpperCase();
}
/** 
 * @param {string} symbol
 */
function getAssetFromSymbol(symbol) {
  let asset = ''
  if (symbol.includes('UMCBL')){
    asset = 'USDT';
  } else if (symbol.includes('CMCBL')) {
    asset = 'USDC';
  } else if (symbol.includes('SDMCBL')) {
    asset = symbol.replace('SUSD_SDMCBL', '')
  } else if (symbol.includes('DMCBL')) {
    asset = symbol.replace('USD_DMCBL', '')
  }
  return asset;
}
/* 
* 
* PING FUNCTION
* 
* 
*/
let pingInterval = undefined;
function resetPingFunction(webSocket) {
  if(pingInterval){
    clearInterval(pingInterval);
  }
  pingInterval = setInterval(()=>{
    webSocket.send('ping')
  }, 30000)
}
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
    const apiPassphrase = wsSettings.API_PASSPHRASE;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      const signedRequest = getSignedRequest(apiKey, apiSecret, apiPassphrase);
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
      if (messageParse.event === 'login' && messageParse.code == 0) {
        resetPingFunction(webSocket);
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
 * @param {string} instType
 * @param {string} instId
 * @param {string} channel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(instType, instId, channel, webSocket) {
  return new Promise((resolve) => {
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${instId}|${channel}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.event === 'subscribe' && messageParse.arg.channel === channel) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ op: 'subscribe', args: [{ channel, instType, instId }] }));
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
  wsSettings.URL = wsSettings.URL || 'wss://ws.bitget.com/mix/v1/stream';
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
  const webSocket = WebSocket('bitget', wsSettings);
  webSocket.addOnClose(async () => {
    clearInterval(pingInterval);
    await connectWebSocket(webSocket, wsSettings);
    for (const params of ordersWsObject.subscriptions) await ordersWsObject.subscribe(params);
    for (const params of positionsWsObject.subscriptions) await positionsWsObject.subscribe(params);
    for (const params of tradesWsObject.subscriptions) await tradesWsObject.subscribe(params);
    for (const params of orderBooksWsObject.subscriptions) await orderBooksWsObject.subscribe(params);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
  });
  webSocket.addOnMessage(message => {
    if(message == 'pong'){
      console.log(Date.now(), 'pong')
    }
  })
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocket.addOnMessage((message) => console.log(JSON.parse(message))) };
  /** 
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    console.log(Date.now())
    await connectWebSocket(webSocket, wsSettings);
  };  /** 
  /** 
   * 
   * 
   * ORDERS
   * 
   * 
   */
  const ordersOnMessage = (message) => {
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'orders' || !messageParse.data) { return };
    resetPingFunction(webSocket);
    const creationOrders = [];
    const executionOrders = [];
    const cancelationOrders = [];
    messageParse.data.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.instId)) { return };
      if (orderEvent.status === 'new') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.status === 'cancelled') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
      if (orderEvent.status === 'partial-fill' || orderEvent.status === 'full-fill') {
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
      await confirmSubscription(getProductTypeFromSymbol(params.symbol), 'default', 'orders', webSocket);
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
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'positions' || !messageParse.data) { return };
    resetPingFunction(webSocket);
    if (!messageParse.data.length) {
      positionsWsObject.data.forEach(position => {
        position.pxS = 0;
        position.qtyS = 0;
        position.pxB = 0;
        position.qtyB = 0;
      })
    }
    messageParse.data.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.instId);
      if (!positionData && positionEvent.holdMode !== 'single_hold') { return };
      positionData.pxS = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'short' ? +positionEvent.averageOpenPrice : 0;
      positionData.qtyS = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'short' ? Math.abs(+positionEvent.total) : 0;
      positionData.pxB = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'long' ? +positionEvent.averageOpenPrice : 0;
      positionData.qtyB = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'long' ? Math.abs(+positionEvent.total) : 0;
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
      await confirmSubscription(getProductTypeFromSymbol(params.symbol), 'default', 'positions', webSocket);
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
  function calculateLiquidationPrice() {
    let upl = 0;
    liquidationsWsObject.data.forEach(position => {
      if(position.initialMargin && position.marginRate && position.markPx){
        if(position.qtyB && position.pxB){
          upl = (1/position.pxB - 1/position.markPx) * (position.qtyB * position.markPx);
          position.liqPxB = (1-((position.initialMargin+upl - (position.marginRate*(position.initialMargin + upl)))*position.markPx)/(position.qtyB*position.markPx))*position.markPx;
          position.liqPxB = +position.liqPxB.toFixed(10)
        }
        if(position.qtyS && position.pxS){
          upl = (1/position.pxS - 1/position.markPx) * (-position.qtyS * position.markPx);
          position.liqPxS = (1+((position.initialMargin+upl - (position.marginRate*(position.initialMargin + upl)))*position.markPx)/(position.qtyS*position.markPx))*position.markPx;
          position.liqPxS = +position.liqPxS.toFixed(10)
        }
      }
    })
  }
  const liquidationsOnMessageMarkPrice = (message) => {
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'ticker' || !messageParse.data) { return };
    messageParse.data.forEach(markPriceEvent => {
      const liquidationsData = liquidationsWsObject.data.find(v => getInstIdFromSymbol(v.symbol) === markPriceEvent.instId);
      if (!liquidationsData) { return };
      liquidationsData.markPx = +markPriceEvent.markPrice;
      calculateLiquidationPrice();
    });
  };
  const liquidationsOnMessageAccount = (message) => {
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'account' || !messageParse.data) { return };
    resetPingFunction(webSocket);
    messageParse.data.forEach(accountEvent => {
      const liquidationsData = liquidationsWsObject.data.find(v => getAssetFromSymbol(v.symbol) === accountEvent.marginCoin);
      if (!liquidationsData) { return };
      liquidationsData.initialMargin = +accountEvent.available;
      calculateLiquidationPrice();
    });
  };
  
  const liquidationsOnMessagePosition = (message) => {
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'positions' || !messageParse.data) { return };
    resetPingFunction(webSocket);
    if (!messageParse.data.length) {
      liquidationsWsObject.data.forEach(position => {
        position.pxS = 0;
        position.qtyS = 0;
        position.liqPxS = 0;
        position.pxB = 0;
        position.qtyB = 0;
        position.liqPxB = 0;
        position.marginRate = 0;
        calculateLiquidationPrice();
      })
    }
    messageParse.data.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.instId);
      if (!liquidationsWsObject && positionEvent.holdMode !== 'single_hold') { return };
      liquidationData.pxS = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'short' ? +positionEvent.averageOpenPrice : 0;
      liquidationData.qtyS = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'short' ? Math.abs(+positionEvent.total) : 0;
      liquidationData.liqPxS = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'short' && positionEvent.liqPx > 0 ? +positionEvent.liqPx : 0;
      liquidationData.pxB = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'long' ? +positionEvent.averageOpenPrice : 0;
      liquidationData.qtyB = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'long' ? Math.abs(+positionEvent.total) : 0;
      liquidationData.liqPxB = positionEvent && +positionEvent.total > 0 && positionEvent.holdSide == 'long' && positionEvent.liqPx > 0 ? +positionEvent.liqPx : 0;
      liquidationData.marginRate =  positionEvent && +positionEvent.total > 0 && positionEvent.marginRate ? +positionEvent.marginRate : 0;
      calculateLiquidationPrice();
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageAccount)) { webSocket.addOnMessage(liquidationsOnMessageAccount) };
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
      await confirmSubscription(getProductTypeFromSymbol(params.symbol), 'default', 'account', webSocket);
      await confirmSubscription('mc', getInstIdFromSymbol(params.symbol), 'ticker', webSocket);
      await confirmSubscription(getProductTypeFromSymbol(params.symbol), 'default', 'positions', webSocket);
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
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'trade' || !messageParse.data) { return };
    const trades = [];
    messageParse.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => getInstIdFromSymbol(v.symbol) === messageParse.arg.instId);
      if (!tradeData) { return };
      tradeData.side = tradeEvent[3];
      tradeData.price = +tradeEvent[1];
      tradeData.quantity = +tradeEvent[2];
      tradeData.timestamp = moment(+tradeEvent[0]).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription('mc', getInstIdFromSymbol(params.symbol), 'trade', webSocket);
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
    if (message == 'pong') { return };
    const messageParse = JSON.parse(message.toString());
    if (!messageParse.arg || messageParse.arg.channel !== 'books') { return };
    if (messageParse.action !== 'snapshot' && messageParse.action !== 'update') { return };
    const orderBookData = orderBooksWsObject.data.find(v => getInstIdFromSymbol(v.symbol) === messageParse.arg.instId);
    if (!orderBookData) { return };
    const orderBookEvent = messageParse.data[0];
    if ((Date.now() - +orderBookEvent.ts) > 5000) { return webSocket.close(); }
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
      await confirmSubscription('mc', getInstIdFromSymbol(params.symbol), 'books', webSocket);
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
