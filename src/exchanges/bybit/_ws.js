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
  eventData.symbol = data.symbol;
  eventData.event = 'creations-updates';
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment.utc(data.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'executions';
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.exec_qty;
  eventData.timestamp = moment.utc(data.trade_time).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'cancelations';
  eventData.id = data.order_link_id;
  eventData.timestamp = moment.utc(data.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const expires = Date.now() + 5000;
  const signature = crypto.createHmac('sha256', apiSecret).update(`GET/realtime${expires}`).digest('hex');
  return { op: 'auth', args: [apiKey, expires, signature] };
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
      if (messageParse.success && messageParse.request && messageParse.request.op === 'auth') {
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
 * @param {string} topic 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(topic, webSocket) {
  return new Promise((resolve) => {
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${topic}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if ((messageParse.request && messageParse.request.args[0] === topic)
        && (messageParse.success || messageParse.ret_msg.includes('error:topic:already subscribed'))) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
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
  wsSettings.URL = wsSettings.URL || 'wss://stream.bybit.com/realtime';
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
  const webSocket = WebSocket('bybit', wsSettings);
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
  const ordersOnMessageOrder = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'order') { return };
    const creationOrders = [];
    const cancelationOrders = [];
    messageParse.data.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
      if (orderEvent.order_status === 'New' || orderEvent.order_status === 'PartiallyFilled') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.order_status === 'Cancelled' || orderEvent.order_status === 'Rejected') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
    });
    if (creationOrders.length) { ordersWsObject.events.emit('creations-updates', creationOrders) };
    if (cancelationOrders.length) { ordersWsObject.events.emit('cancelations', cancelationOrders) };
  };
  const ordersOnMessageExecution = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'execution') { return };
    const executionOrders = [];
    messageParse.data.forEach(executionEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === executionEvent.symbol)) { return };
      if (executionEvent.exec_type == 'BustTrade' || executionEvent.exec_type == 'AdlTrade'){
        console.log(`Received ${executionEvent.exec_type} Event`)
        fs.writeFileSync(wsSettings.LIQUIDATION_STATUS_FILE, 'close-liquidation');
        return;
      }
      if (executionEvent.exec_type === 'Trade') {
        executionOrders.push(createExecution(executionEvent));
      }
    });
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(ordersOnMessageOrder)) { webSocket.addOnMessage(ordersOnMessageOrder) };
      if (!webSocket.findOnMessage(ordersOnMessageExecution)) { webSocket.addOnMessage(ordersOnMessageExecution) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription('order', webSocket);
      await confirmSubscription('execution', webSocket);
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
    if (messageParse.topic !== 'position') { return };
    messageParse.data.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!positionData) { return };
      positionData.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
      positionData.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
      positionData.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
      positionData.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
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
      await confirmSubscription('position', webSocket);
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
  const liquidationsOnMessageInstrument = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.topic || !messageParse.topic.includes('instrument_info') || messageParse.type !== 'delta') { return };
    messageParse.data.update.forEach(instrumentEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === instrumentEvent.symbol);
      if (!liquidationData) { return };
      liquidationData.markPx = +instrumentEvent.mark_price ? +instrumentEvent.mark_price : liquidationData.markPx;
    });
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'position') { return };
    messageParse.data.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if (!liquidationData) { return };
      liquidationData.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
      liquidationData.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
      liquidationData.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
      liquidationData.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
      liquidationData.liqPxS = positionEvent.side === 'Sell' ? +positionEvent.liq_price : 0;
      liquidationData.liqPxB = positionEvent.side === 'Buy' ? +positionEvent.liq_price : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageInstrument)) { webSocket.addOnMessage(liquidationsOnMessageInstrument) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePosition)) { webSocket.addOnMessage(liquidationsOnMessagePosition) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription(`instrument_info.100ms.${params.symbol}`, webSocket);
      await confirmSubscription('position', webSocket);
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
    if (!messageParse.topic || !messageParse.topic.includes('trade')) { return };
    const trades = [];
    messageParse.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.symbol);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.side === 'Sell' ? 'sell' : 'buy';
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.size;
      tradeData.timestamp = moment.utc(tradeEvent.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription(`trade.${params.symbol}`, webSocket);
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
    if (!messageParse.topic || !messageParse.topic.includes('orderBook_200')) { return };
    if ((Date.now() - messageParse.timestamp_e6 / 1000) > 5000) { return webSocket.close() };
    if (messageParse.type === 'partial') {
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
    if (messageParse.type === 'delta') {
      const updateFunction = (orderBookEvent) => {
        const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.symbol);
        if (!orderBookData) { return };
        if (orderBookEvent.side === 'Sell') {
          orderBookData.updateOrderByPriceAsk({ id: +orderBookEvent.price, price: +orderBookEvent.price, quantity: +orderBookEvent.size });
        }
        if (orderBookEvent.side === 'Buy') {
          orderBookData.updateOrderByPriceBid({ id: +orderBookEvent.price, price: +orderBookEvent.price, quantity: +orderBookEvent.size });
        }
      }
      messageParse.data.insert.forEach(updateFunction);
      messageParse.data.update.forEach(updateFunction);
      messageParse.data.delete.forEach(updateFunction);
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
      await confirmSubscription(`orderBook_200.100ms.${params.symbol}`, webSocket);
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
