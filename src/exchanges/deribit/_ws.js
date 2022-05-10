const uuid = require('uuid').v4;
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
  eventData.symbol = data.instrument_name;
  eventData.event = 'creations-updates';
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  eventData.timestamp = moment(data.last_update_timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.instrument_name;
  eventData.event = 'executions';
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.instrument_name;
  eventData.event = 'cancelations';
  eventData.id = data.label;
  eventData.timestamp = moment(data.last_update_timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignatureParams(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const nonce = uuid();
  const timestamp = Date.now();
  const digest = `${timestamp}\n${nonce}\n${''}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(digest).digest('hex');
  const signatureParams = {};
  signatureParams.jsonrpc = '2.0';
  signatureParams.id = 1;
  signatureParams.method = 'public/auth';
  signatureParams.params = {
    grant_type: "client_signature",
    client_id: apiKey,
    timestamp: timestamp,
    signature: signature,
    nonce: nonce,
    data: '',
  };
  return signatureParams;
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
    const signatureParams = getSignatureParams(apiKey, apiSecret);
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connectOnOpenFunction() {
      if (signatureParams) {
        webSocket.send(JSON.stringify(signatureParams));
      } else {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.id === 1 && messageParse.result && messageParse.result.token_type === 'bearer') {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      };
    };
    webSocket.addOnOpen(connectOnOpenFunction, false);
    webSocket.addOnMessage(connectOnMessageFunction, false);
  });
};
/**
 * 
 * @param {'public' | 'private'} method
 * @param {string} channel 
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(method, channel, webSocket) {
  return new Promise((resolve) => {
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const subscribeId = +`${seconds}${micLeadingZeros}${microseconds}`;
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${channel}`) }, 60000);
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.id === subscribeId && messageParse.result && !messageParse.error) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify({ jsonrpc: '2.0', method: `${method}/subscribe`, id: subscribeId, params: { channels: [channel] } }));
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
  wsSettings.URL = wsSettings.URL || 'wss://www.deribit.com/ws/api/v2';
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
  const webSocket = WebSocket('deribit', wsSettings);
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
  const ordersOnMessageOrders = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.params || !messageParse.params.channel.includes('user.orders')) { return };
    const orderEvent = messageParse.params.data;
    if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.instrument_name)) { return };
    if (orderEvent.order_state === 'open') {
      ordersWsObject.events.emit('creations-updates', [createCreationUpdate(orderEvent)]);
    }
    if (orderEvent.order_state === 'rejected' || orderEvent.order_state === 'cancelled') {
      ordersWsObject.events.emit('cancelations', [createCancelation(orderEvent)]);
    }
  };
  const ordersOnMessageTrades = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.params || !messageParse.params.channel.includes('user.trades')) { return };
    const executionOrders = [];
    messageParse.params.data.forEach(tradeEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === tradeEvent.instrument_name)) { return };
      executionOrders.push(createExecution(tradeEvent));
    });
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(ordersOnMessageOrders)) { webSocket.addOnMessage(ordersOnMessageOrders) };
      if (!webSocket.findOnMessage(ordersOnMessageTrades)) { webSocket.addOnMessage(ordersOnMessageTrades) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      await confirmSubscription('private', `user.orders.${params.symbol}.raw`, webSocket);
      await confirmSubscription('private', `user.trades.${params.symbol}.raw`, webSocket);
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
    if (!messageParse.params || !messageParse.params.channel.includes('user.changes')) { return };
    messageParse.params.data.positions.forEach(changeEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === changeEvent.instrument_name);
      if (!positionData) { return };
      positionData.pxS = changeEvent.direction === 'sell' ? +changeEvent.average_price : 0;
      positionData.pxB = changeEvent.direction === 'buy' ? +changeEvent.average_price : 0;
      positionData.qtyS = changeEvent.direction === 'sell' ? Math.abs(+changeEvent.size) : 0;
      positionData.qtyB = changeEvent.direction === 'buy' ? Math.abs(+changeEvent.size) : 0;
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
      await confirmSubscription('private', `user.changes.${params.symbol}.raw`, webSocket);
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
    if (!messageParse.params || !messageParse.params.channel.includes('ticker')) { return };
    const tickerEvent = messageParse.params.data;
    const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === tickerEvent.instrument_name);
    if (!liquidationsData) { return };
    liquidationsData.markPx = +tickerEvent.mark_price ? +tickerEvent.mark_price : liquidationsData.markPx;
  };
  const liquidationsOnMessageChanges = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.params || !messageParse.params.channel.includes('user.changes')) { return };
    messageParse.params.data.positions.forEach(changeEvent => {
      const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === changeEvent.instrument_name);
      if (!liquidationsData) { return };
      liquidationsData.pxS = changeEvent.direction === 'sell' ? +changeEvent.average_price : 0;
      liquidationsData.pxB = changeEvent.direction === 'buy' ? +changeEvent.average_price : 0;
      liquidationsData.qtyS = changeEvent.direction === 'sell' ? Math.abs(+changeEvent.size) : 0;
      liquidationsData.qtyB = changeEvent.direction === 'buy' ? Math.abs(+changeEvent.size) : 0;
    });
  };
  const liquidationsOnMessagePortfolio = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.params || !messageParse.params.channel.includes('user.portfolio')) { return };
    const portfolioEvent = messageParse.params.data;
    liquidationsWsObject.data.forEach(liquidationData => {
      const liquidationSubscription = liquidationsWsObject.subscriptions.find(v => v.symbol === liquidationData.symbol);
      if (liquidationSubscription.asset !== portfolioEvent.currency) { return };
      liquidationData.liqPxS = liquidationData.qtyS ? +portfolioEvent.estimated_liquidation_ratio_map.btc_usd * liquidationData.markPx : 0;
      liquidationData.liqPxB = liquidationData.qtyB ? +portfolioEvent.estimated_liquidation_ratio_map.btc_usd * liquidationData.markPx : 0;
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(liquidationsOnMessageTicker)) { webSocket.addOnMessage(liquidationsOnMessageTicker) };
      if (!webSocket.findOnMessage(liquidationsOnMessageChanges)) { webSocket.addOnMessage(liquidationsOnMessageChanges) };
      if (!webSocket.findOnMessage(liquidationsOnMessagePortfolio)) { webSocket.addOnMessage(liquidationsOnMessagePortfolio) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      await confirmSubscription('public', `ticker.${params.symbol}.raw`, webSocket);
      await confirmSubscription('private', `user.changes.${params.symbol}.raw`, webSocket);
      await confirmSubscription('private', `user.portfolio.${params.asset}`, webSocket);
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
    if (!messageParse.params || !messageParse.params.channel.includes('trades')) { return };
    const trades = [];
    messageParse.params.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.instrument_name);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.direction;
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.amount;
      tradeData.timestamp = moment(+tradeEvent.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
      await confirmSubscription('public', `trades.${params.symbol}.100ms`, webSocket);
    },
    data: [],
    events: new Events.EventEmitter(),
    subscriptions: [],
  };
  /** 
   * 
   * 
   * MARK PRICES OPTIONS
   * 
   * 
   */
  const markPricesOptionsOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse.params || !messageParse.params.channel.includes('ticker')) { return };
    const tickerEvent = messageParse.params.data;
    const markPricesData = markPricesOptionsWsObject.data.find(v => v.symbol === tickerEvent.instrument_name);
    if (!markPricesData) { return };
    markPricesData.markPriceOption = +tickerEvent.mark_price ? +tickerEvent.mark_price : markPricesData.markPriceOption;
    markPricesData.markPriceUnderlying = +tickerEvent.underlying_price ? +tickerEvent.underlying_price : markPricesData.markPriceUnderlying;
  };
  /** @type {import('../../../typings/_ws').markPricesOptionsWsObject} */
  const markPricesOptionsWsObject = {
    subscribe: async (params) => {
      if (!webSocket.findOnMessage(markPricesOptionsOnMessage)) { webSocket.addOnMessage(markPricesOptionsOnMessage) };
      markPricesOptionsWsObject.subscriptions.push(Object.assign({}, params));
      const markPrices = (await rest.getMarkPricesOption(params)).data;
      markPricesOptionsWsObject.data.push(Object.assign({}, markPrices, params));
      await confirmSubscription('public', `ticker.${params.symbol}.100ms`, webSocket);
    },
    data: [],
    events: null,
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
    if (!messageParse.params || !messageParse.params.channel.includes('book')) { return };
    const orderBookEvent = messageParse.params.data;
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === orderBookEvent.instrument_name);
    if (!orderBookData) { return };
    if ((Date.now() - +orderBookEvent.timestamp) > 5000) { return webSocket.close() };
    orderBookEvent.asks.forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask[1], price: +ask[1], quantity: +ask[2] });
    });
    orderBookEvent.bids.forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid[1], price: +bid[1], quantity: +bid[2] });
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
      await confirmSubscription('public', `book.${params.symbol}.100ms`, webSocket);
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
    markPricesOptions: markPricesOptionsWsObject,
  };
  return ws;
}
module.exports = Ws;
