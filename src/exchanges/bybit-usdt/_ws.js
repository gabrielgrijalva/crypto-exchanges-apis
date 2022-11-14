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
  eventData.id = data.orderLinkId ? data.orderLinkId : data.orderId;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment(+data.updatedTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  console.log('Execution data', data)
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'executions';
  eventData.id = data.orderLinkId ? data.orderLinkId : data.orderId;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.execPrice;
  eventData.quantity = +data.execQty;
  eventData.timestamp = moment(+data.execTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.symbol;
  eventData.event = 'cancelations';
  eventData.id = data.orderLinkId ? data.orderLinkId : data.orderId;
  eventData.timestamp = moment(+data.updatedTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} type
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(type, apiKey, apiSecret) {
  if (!type || !apiKey || !apiSecret) { return };
  const expiration = new Date().getTime() + 5000;
  const signature = crypto.createHmac("sha256", apiSecret).update("GET/realtime" + expiration).digest("hex");
  return {
    op: 'auth',
    args: [apiKey, expiration.toFixed(0), signature]
  };
};
/**
 *
 * @param {string} positionSide
 * @param {number} markPx
 * @param {number} availableBalance
 * @param {number} totalPositionIM
 * @param {number} totalOrderIM
 * @param {number} totalPositionMM
 * @param {number} positionSize
 * 
 */
function calcLiquidationPrice(positionSide, markPx, availableBalance, totalPositionIM, totalOrderIM, totalPositionMM, positionSize) {
  // Calculate liquidation
  // LiqPx (Long) = MP - (AB+IM-MM)/EPS

  let liquidationPrice = 0;
  if (positionSide === 'Buy'){
    liquidationPrice = (markPx - (availableBalance+totalPositionIM+totalOrderIM-totalPositionMM)/positionSize)
  }
  if (positionSide === 'Sell'){
    liquidationPrice = (markPx + (availableBalance+totalPositionIM+totalOrderIM-totalPositionMM)/positionSize)
  }
  liquidationPrice = liquidationPrice < 0 ? 0 : liquidationPrice
  return liquidationPrice;
};
/**
 * 
 * @param {'public' | 'private' | 'index'} type
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(type, webSocket, wsSettings) {
  return new Promise((resolve) => {
    let url = '';
    switch(type){
      case 'public':
        url = wsSettings.URL + '/contract/usdt/public/v3';
        break;
      case 'private': 
        url = wsSettings.URL + '/unified/private/v3';
        break;
    }
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      if (type === 'private') {
        const signedRequest = getSignedRequest(type, apiKey, apiSecret);
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    function connectOnMessageFunction(message) {
      if(!message){ return };
      const messageParse = JSON.parse(message);
      if (messageParse.type === 'AUTH_RESP' && messageParse.ret_msg == 0) {
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
 * @param {string} symbol
 * @param {string} channel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 */
function confirmSubscription(subParams, symbol, channel, webSocket) {

  return new Promise((resolve) => {
    const subscribeTimeout = setTimeout(() => { throw new Error(`Could not subscribe:${symbol}|${channel}`) }, 60000);
    function confirmOnCloseFunction() {
      clearTimeout(subscribeTimeout);
      webSocket.removeOnClose(confirmOnCloseFunction);
      webSocket.removeOnMessage(confirmOnMessageFunction);
    }
    function confirmOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if ((messageParse.type === 'COMMAND_RESP' && messageParse.success) || (messageParse.type === 'snapshot')) {
        resolve();
        clearTimeout(subscribeTimeout);
        webSocket.removeOnClose(confirmOnCloseFunction);
        webSocket.removeOnMessage(confirmOnMessageFunction);
      }
    }
    webSocket.addOnClose(confirmOnCloseFunction, false);
    webSocket.addOnMessage(confirmOnMessageFunction, false);
    webSocket.send(JSON.stringify(subParams));
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
  wsSettings.URL = wsSettings.URL || 'wss://stream.bybit.com';
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
   * WEBSOCKET PUBLIC
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPublic = WebSocket('bybit-usdt:public', wsSettings);
  webSocketPublic.addOnClose(async () => {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
    for (const params of tradesWsObject.subscriptions) await tradesWsObject.subscribe(params);
    for (const params of orderBooksWsObject.subscriptions) await orderBooksWsObject.subscribe(params);
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPublic.addOnMessage((message) => console.log(JSON.parse(message))) };
  /** 
   * 
   * 
   * WEBSOCKET PRIVATE
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPrivate = WebSocket('bybit-usdt:private', wsSettings);
  webSocketPrivate.addOnClose(async () => {
    await connectWebSocket('private', webSocketPrivate, wsSettings)
    for (const params of ordersWsObject.subscriptions) await ordersWsObject.subscribe(params);
    for (const params of positionsWsObject.subscriptions) await positionsWsObject.subscribe(params);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
  });
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPrivate.addOnMessage((message) => console.log(JSON.parse(message))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    if (wsSettings.API_KEY && wsSettings.API_SECRET) {
      await connectWebSocket('private', webSocketPrivate, wsSettings);
    }
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
    if (messageParse.topic !== 'user.order.unifiedAccount') { return };
    if (!messageParse.data.result || !messageParse.data.result.length) { return};
    const creationOrders = [];
    const cancelationOrders = [];
    messageParse.data.result.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
      if (orderEvent.orderStatus === 'New') {
        creationOrders.push(createCreationUpdate(orderEvent));
      }
      if (orderEvent.orderStatus === 'Cancelled' || orderEvent.orderStatus === 'Rejected') {
        cancelationOrders.push(createCancelation(orderEvent));
      }
    })
    if (creationOrders.length) { ordersWsObject.events.emit('creations-updates', creationOrders) };
    if (cancelationOrders.length) { ordersWsObject.events.emit('cancelations', cancelationOrders) };
  };
  /** 
   * 
   * 
   * Executions
   * 
   * 
   */
   const executionsOnMessage = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'user.execution.unifiedAccount') { return };
    if (!messageParse.data.result || !messageParse.data.result.length) { return};
    const executionOrders = [];
    messageParse.data.result.forEach(orderEvent => {
      if (!ordersWsObject.subscriptions.find(v => v.symbol === orderEvent.symbol)) { return };
      if (orderEvent.execType == 'BUSTTRADE'){
        console.log('Received Liquidation Event')
        fs.writeFileSync(wsSettings.LIQUIDATION_STATUS_FILE, 'close-liquidation');
        return;
      }
      executionOrders.push(createExecution(orderEvent));
    })
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(ordersOnMessage)) { webSocketPrivate.addOnMessage(ordersOnMessage) };
      if (!webSocketPrivate.findOnMessage(executionsOnMessage)) { webSocketPrivate.addOnMessage(executionsOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      const orderSubParams = {
        op: 'subscribe',
        args: ["user.order.unifiedAccount"]
      }
      const executionSubParams = {
        op: 'subscribe',
        args: ["user.execution.unifiedAccount"]
      }
      await confirmSubscription(orderSubParams, params.symbol, 'orders', webSocketPrivate);
      await confirmSubscription(executionSubParams, params.symbol, 'executions', webSocketPrivate);
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
    if (messageParse.topic !== 'user.position.unifiedAccount') { return };
    if (!messageParse.data.result || !messageParse.data.result.length) { return};
    messageParse.data.result.forEach(positionEvent => {
      const positionData = positionsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if(!positionData){ return };
      positionData.pxS = positionEvent.side === 'Sell' ? +positionEvent.entryPrice : 0;
      positionData.pxB = positionEvent.side === 'Buy' ? +positionEvent.entryPrice : 0;
      positionData.qtyS = positionEvent.side === 'Sell' ? Math.abs(+positionEvent.size) : 0;
      positionData.qtyB = positionEvent.side === 'Buy' ? Math.abs(+positionEvent.size) : 0;
    });
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
      const subParams = {
        op: 'subscribe',
        args: ["user.position.unifiedAccount"]
      }
      await confirmSubscription(subParams, params.symbol, 'position', webSocketPrivate);
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
  const liquidationsOnMessageMarkPrice = (message) => {
    const messageParse = JSON.parse(message);
    if (!messageParse || !messageParse.topic || !messageParse.topic.includes(`tickers`)) { return };
    if (!messageParse.data.markPrice) { return }
    const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === v.symbol);
    if(!liquidationsData) { return };
    liquidationsData.markPx = +messageParse.data.markPrice;
  };
  
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'user.position.unifiedAccount') { return };
    if (!messageParse.data.result || !messageParse.data.result.length) { return};
    messageParse.data.result.forEach(positionEvent => {
      const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.symbol);
      if(!liquidationsData) { return };
      liquidationsData.pxS = positionEvent && positionEvent.side === 'Sell' ? +positionEvent.entryPrice : 0;
      liquidationsData.pxB = positionEvent &&  positionEvent.side === 'Buy' ? +positionEvent.entryPrice : 0;
      liquidationsData.qtyS = positionEvent &&  positionEvent.side === 'Sell' ? Math.abs(+positionEvent.size) : 0;
      liquidationsData.qtyB = positionEvent &&  positionEvent.side === 'Buy' ? Math.abs(+positionEvent.size) : 0;
    });
  }

  const liquidationsOnMessageWallet = (message) => {
    const messageParse = JSON.parse(message);
    if (messageParse.topic !== 'user.wallet.unifiedAccount') { return };
    messageParse.data.result.coin.find(res => {
      const liquidationsData = liquidationsWsObject.data.find(v => v.asset === res.currencyCoin)
      if (!liquidationsData) {return}
      liquidationsData.liqPxS = liquidationsData.qtyS ? calcLiquidationPrice('Sell', +liquidationsData.markPx, +res.availableBalance, +res.totalPositionIM, +res.totalOrderIM, +res.totalPositionMM, +liquidationsData.qtyS) : 0;
      liquidationsData.liqPxB = liquidationsData.qtyB ? calcLiquidationPrice('Buy', +liquidationsData.markPx, +res.availableBalance, +res.totalPositionIM, +res.totalOrderIM, +res.totalPositionMM, +liquidationsData.qtyB) : 0;
    });
  };


  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketPublic.findOnMessage(liquidationsOnMessageMarkPrice)) { webSocketPublic.addOnMessage(liquidationsOnMessageMarkPrice) };
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessagePosition)) { webSocketPrivate.addOnMessage(liquidationsOnMessagePosition) };
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessageWallet)) { webSocketPrivate.addOnMessage(liquidationsOnMessageWallet) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      const markPriceSubParams = {
       op: 'subscribe',
       args: [`tickers.${params.symbol}`]
      }
      const positionParams = {
        op: 'subscribe',
        args: ["user.position.unifiedAccount"]
      }
      const walletParams = {
        op: 'subscribe',
        args: ["user.wallet.unifiedAccount"]
      }
      await confirmSubscription(markPriceSubParams, params.symbol, 'mark-price', webSocketPublic);
      await confirmSubscription(positionParams, params.symbol, 'positions', webSocketPrivate);
      await confirmSubscription(walletParams, params.symbol, 'wallet', webSocketPrivate);
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
    if (!messageParse || !messageParse.topic || !messageParse.topic.includes(`publicTrade`)) { return };
    const trades = [];
    messageParse.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === tradeEvent.s);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.S === 'Sell' ? 'sell' : 'buy';
      tradeData.price = +tradeEvent.p;
      tradeData.quantity = +tradeEvent.v;
      tradeData.timestamp = moment(+tradeEvent.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
      trades.push(Object.assign({}, tradeData));
    });
    if (trades.length) { tradesWsObject.events.emit('trades', trades) };
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
      const subParams = {
        op: 'subscribe',
        args: [`publicTrade.${params.symbol}`]
      }
      await confirmSubscription(subParams, params.symbol, 'trades', webSocketPublic);
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
    if (!messageParse || !messageParse.topic || !messageParse.topic.includes(`orderbook`)) { return };
    if (messageParse.type !== 'snapshot' && messageParse.type !== 'delta') { return };
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === messageParse.data.s);
    if (!orderBookData) { return };
    const orderBookEvent = messageParse.data;
    if ((Date.now() - +orderBookEvent.ts) > 5000) { return webSocketPublic.close(); }
    orderBookEvent.a.forEach(ask => {
      orderBookData.updateOrderByPriceAsk({ id: +ask[0], price: +ask[0], quantity: +ask[1] });
    });
    orderBookEvent.b.forEach(bid => {
      orderBookData.updateOrderByPriceBid({ id: +bid[0], price: +bid[0], quantity: +bid[1] });
    });
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
      const subParams = {
        op: 'subscribe',
        args: [`orderbook.50.${params.symbol}`]
      }
      await confirmSubscription(subParams, params.symbol, 'books', webSocketPublic);
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
