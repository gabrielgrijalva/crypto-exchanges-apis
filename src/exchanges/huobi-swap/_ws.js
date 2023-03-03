const fs = require('fs');
const crypto = require('crypto');
const moment = require('moment');
const qs = require('qs');
const zlib = require('zlib');
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
  eventData.symbol = data.contract_code;
  eventData.event = 'creations-updates';
  eventData.id = (data.client_order_id).toString();
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = +data.volume;
  eventData.timestamp = moment(+data.created_at).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.symbol = data.contract_code;
  eventData.event = 'executions';
  eventData.id = (data.client_order_id).toString();
  eventData.side = data.direction;
  eventData.price = +data.trade_price;
  eventData.quantity = +data.trade_volume;
  eventData.timestamp = moment(+data.created_at).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.symbol = data.contract_code;
  eventData.event = 'cancelations';
  eventData.id = (data.client_order_id).toString();
  eventData.timestamp = moment(+data.canceled_at).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} type
 * @param {string} url
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(type, url, apiKey, apiSecret) {
  if (!type || !url || !apiKey || !apiSecret) { return };
  const signatureParams = {
    AccessKeyId: apiKey,
    SignatureMethod: 'HmacSHA256',
    SignatureVersion: '2',
    Timestamp: moment.utc().format('YYYY-MM-DDTHH:mm:ss')
  }
  const signatureParamsStringified = qs.stringify(signatureParams);
  const strippedUrl = url.replace("wss://", "")
  const method = 'GET';
  const path = type === 'public' ? '/swap-ws' : '/swap-notification';
  const stringToSign = `${method}\n${strippedUrl}\n${path}\n${signatureParamsStringified}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(stringToSign).digest('base64');

  return {
    op: 'auth',
    type: 'api',
    AccessKeyId: signatureParams.AccessKeyId,
    SignatureMethod: signatureParams.SignatureMethod,
    SignatureVersion: signatureParams.SignatureVersion,
    Timestamp: signatureParams.Timestamp,
    Signature: signature
  };
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
      case 'index':
        url = wsSettings.URL + '/ws_index';
        break;
      case 'public':
        url = wsSettings.URL + '/swap-ws';
        break;
      case 'private': 
        url = wsSettings.URL + '/swap-notification';
        break;
    }
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      if (type === 'private') {
        const signedRequest = getSignedRequest(type, wsSettings.URL, apiKey, apiSecret);
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
      const messageParse = JSON.parse(zlib.unzipSync(message).toString());
      if (messageParse.op === 'auth' && messageParse['err-code'] == 0) {
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
      const messageParse = JSON.parse(zlib.unzipSync(message).toString());
      if ((messageParse.op === 'sub' && messageParse.topic === subParams.topic) || (messageParse.subbed === subParams.sub && messageParse.status === 'ok')) {
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
  wsSettings.URL = wsSettings.URL || 'wss://api.hbdm.vn';
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
   const webSocketIndex = WebSocket('huobi:index', wsSettings);
   webSocketIndex.addOnClose(async () => {
     await connectWebSocket('index', webSocketIndex, wsSettings);
     for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
   });
   webSocketIndex.addOnMessage((message) => {
     const messageParse = JSON.parse(zlib.unzipSync(message).toString());
     if (messageParse.ping){
      webSocketIndex.send(JSON.stringify({
         pong: messageParse.ping
       }))
     }
   })
   if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketIndex.addOnMessage((message) => console.log(JSON.parse(zlib.unzipSync(message).toString()))) };
  /** 
   * 
   * 
   * WEBSOCKET PUBLIC
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPublic = WebSocket('huobi:public', wsSettings);
  webSocketPublic.addOnClose(async () => {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
    for (const params of tradesWsObject.subscriptions) await tradesWsObject.subscribe(params);
    for (const params of orderBooksWsObject.subscriptions) await orderBooksWsObject.subscribe(params);
  });
  webSocketPublic.addOnMessage((message) => {
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.ping){
      webSocketPublic.send(JSON.stringify({
        pong: messageParse.ping
      }))
    }
  })
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPublic.addOnMessage((message) => console.log(JSON.parse(zlib.unzipSync(message).toString()))) };
  /** 
   * 
   * 
   * WEBSOCKET PRIVATE
   * 
   * 
   * @type {import('../../../typings/_ws').WebSocket} */
  const webSocketPrivate = WebSocket('huobi:private', wsSettings);
  webSocketPrivate.addOnClose(async () => {
    await connectWebSocket('private', webSocketPrivate, wsSettings)
    for (const params of ordersWsObject.subscriptions) await ordersWsObject.subscribe(params);
    for (const params of positionsWsObject.subscriptions) await positionsWsObject.subscribe(params);
    for (const params of liquidationsWsObject.subscriptions) await liquidationsWsObject.subscribe(params);
  });
  webSocketPrivate.addOnMessage((message) => {
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.op === 'ping'){
      webSocketPrivate.send(JSON.stringify({
        op: 'pong',
        ts: messageParse.ts
      }))
    }
  })
  if (wsSettings.WS_ON_MESSAGE_LOGS) { webSocketPrivate.addOnMessage((message) => console.log(JSON.parse(zlib.unzipSync(message).toString()))) };
  /**
   * 
   * 
   * CONNECT WEBSOCKETS
   * 
   * 
   **/
  async function connectWebSockets() {
    await connectWebSocket('public', webSocketPublic, wsSettings);
    await connectWebSocket('index', webSocketIndex, wsSettings);
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
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.op !== 'notify' || !messageParse.topic.includes('orders')) { return };
    const creationOrders = [];
    const executionOrders = [];
    const cancelationOrders = [];
    const orderEvent = messageParse;
    if (!ordersWsObject.subscriptions.find(v => v.symbol === messageParse.contract_code)) { return };
    if (orderEvent.order_type == 3 || orderEvent.order_type == 4 || orderEvent.liquidation_type == 2 || orderEvent.liquidation_type){
      console.log(`Received Liquidation or ADL Event (${orderEvent.order_type} ${orderEvent.liquidation_type})`)
      fs.writeFileSync(wsSettings.LIQUIDATION_STATUS_FILE, 'close-liquidation');
      return;
    }
    if (orderEvent.status === 3) {
      creationOrders.push(createCreationUpdate(orderEvent));
    }
    if (orderEvent.status === 5 || orderEvent.status === 7 || orderEvent.status === 11) {
      cancelationOrders.push(createCancelation(orderEvent));
    }
    if (orderEvent.status === 4 || orderEvent.status === 6) {
      for(let i = 0; i < orderEvent.trade.length; i++){
        let trade = orderEvent.trade[i]
        trade.contract_code = orderEvent.contract_code;
        trade.client_order_id = orderEvent.client_order_id;
        trade.direction = orderEvent.direction;
        executionOrders.push(createExecution(trade));
      }
    }
    if (creationOrders.length) { ordersWsObject.events.emit('creations-updates', creationOrders) };
    if (executionOrders.length) { ordersWsObject.events.emit('executions', executionOrders) };
    if (cancelationOrders.length) { ordersWsObject.events.emit('cancelations', cancelationOrders) };
  };
  /** @type {import('../../../typings/_ws').ordersWsObject} */
  const ordersWsObject = {
    subscribe: async (params) => {
      if (!webSocketPrivate.findOnMessage(ordersOnMessage)) { webSocketPrivate.addOnMessage(ordersOnMessage) };
      if (!ordersWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        ordersWsObject.subscriptions.push(Object.assign({}, params));
      }
      const subParams = {
        op: 'sub',
        topic: `orders.${params.symbol}`
      }
      await confirmSubscription(subParams, params.symbol, 'orders', webSocketPrivate);
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
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.op !== 'notify' || !messageParse.topic.includes('positions')) { return };
    const positionData = positionsWsObject.data.find(v => v.symbol === messageParse.data[0].contract_code);
    if (positionData) {
      const shortPosition = messageParse.data.find(v => v.direction == 'sell');
      const longPosition = messageParse.data.find(v => v.direction == 'buy');
      if (shortPosition && longPosition) { 
        positionData.qtyS = Math.abs(+shortPosition.volume);
        positionData.pxS = +shortPosition.cost_open;
        positionData.qtyB = Math.abs(+longPosition.volume);
        positionData.pxB = +longPosition.cost_open;
      } else if ( shortPosition ) {
        positionData.qtyS = Math.abs(+shortPosition.volume);
        positionData.pxS = +shortPosition.cost_open;
      } else if ( longPosition ) { 
        positionData.qtyB = Math.abs(+longPosition.volume);
        positionData.pxB = +longPosition.cost_open;
       }
    }
    
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
        op: 'sub',
        topic: `positions.${params.symbol}`
      }
      await confirmSubscription(subParams, params.symbol, 'positions', webSocketPrivate);
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
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (!messageParse.ch || !messageParse.ch.includes('mark_price')) { return };
    const liquidationsData = liquidationsWsObject.data.find(v => v.symbol === v.symbol);
    liquidationsData.markPx = +messageParse.tick.close;
  };
  const liquidationsOnMessagePosition = (message) => {
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.op !== 'notify' || !messageParse.topic.includes('positions')) { return };
    const liquidationData = liquidationsWsObject.data.find(v => v.symbol === messageParse.data[0].contract_code);
    if (liquidationData){
      const shortPosition = messageParse.data.find(v => v.direction == 'sell');
      const longPosition = messageParse.data.find(v => v.direction == 'buy');
      if (shortPosition && longPosition) { 
        liquidationData.qtyS = Math.abs(+shortPosition.volume);
        liquidationData.pxS = +shortPosition.cost_open;
        liquidationData.qtyB = Math.abs(+longPosition.volume);
        liquidationData.pxB = +longPosition.cost_open;
      } else if ( shortPosition ) {
        liquidationData.qtyS = Math.abs(+shortPosition.volume);
        liquidationData.pxS = +shortPosition.cost_open;
      } else if ( longPosition ) { 
        liquidationData.qtyB = Math.abs(+longPosition.volume);
        liquidationData.pxB = +longPosition.cost_open;
      }
    }
  };
  const liquidationsOnMessageLiquidationPrice = (message) => {
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (messageParse.op !== 'notify' || !messageParse.topic.includes('accounts')) { return };
    messageParse.data.forEach(positionEvent => {
      const liquidationData = liquidationsWsObject.data.find(v => v.symbol === positionEvent.contract_code);
      if (liquidationData.qtyB && liquidationData.qtyS){
        liquidationData.liqPxB = liquidationData.markPx < +positionEvent.liquidation_price ? 0 : positionEvent.liquidation_price;
        liquidationData.liqPxS = liquidationData.markPx > +positionEvent.liquidation_price ? 0 : positionEvent.liquidation_price;
      } else {
        liquidationData.liqPxB = liquidationData.qtyB ? +positionEvent.liquidation_price : 0;
        liquidationData.liqPxS = liquidationData.qtyS ? +positionEvent.liquidation_price : 0;
      }
    });
  };
  /** @type {import('../../../typings/_ws').liquidationsWsObject} */
  const liquidationsWsObject = {
    subscribe: async (params) => {
      if (!webSocketIndex.findOnMessage(liquidationsOnMessageMarkPrice)) { webSocketIndex.addOnMessage(liquidationsOnMessageMarkPrice) };
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessagePosition)) { webSocketPrivate.addOnMessage(liquidationsOnMessagePosition) };
      if (!webSocketPrivate.findOnMessage(liquidationsOnMessageLiquidationPrice)) { webSocketPrivate.addOnMessage(liquidationsOnMessageLiquidationPrice) };
      const positionData = (await rest.getPosition(params)).data;
      const liquidationData = (await rest.getLiquidation(params)).data;
      if (!liquidationsWsObject.subscriptions.find(v => JSON.stringify(v) === JSON.stringify(params))) {
        liquidationsWsObject.subscriptions.push(Object.assign({}, params));
        liquidationsWsObject.data.push(Object.assign({}, params, positionData, liquidationData));
      } else {
        Object.assign(liquidationsWsObject.data.find(v => v.symbol === params.symbol), positionData, liquidationData);
      }
      const markPriceSubParams = {
        sub: `market.${params.symbol}.mark_price.1min`
      }
      const positionParams = {
        op: 'sub',
        topic: `positions.${params.symbol}`
      }
      const liqPriceSubParams = {
        op: 'sub',
        topic: `accounts.${params.symbol}`
      }
      await confirmSubscription(markPriceSubParams, params.symbol, 'mark-price', webSocketIndex);
      await confirmSubscription(positionParams, params.symbol, 'positions', webSocketPrivate);
      await confirmSubscription(liqPriceSubParams, params.symbol, 'positions', webSocketPrivate);
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
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (!messageParse.ch || !messageParse.ch.includes('trade.detail')) { return };
    const trades = [];
    messageParse.tick.data.forEach(tradeEvent => {
      const tradeData = tradesWsObject.data.find(v => v.symbol === v.symbol);
      if (!tradeData) { return };
      tradeData.side = tradeEvent.direction;
      tradeData.price = +tradeEvent.price;
      tradeData.quantity = +tradeEvent.quantity;
      tradeData.timestamp = moment(+tradeEvent.ts).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
        sub: `market.${params.symbol}.trade.detail`
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
    const messageParse = JSON.parse(zlib.unzipSync(message).toString());
    if (!messageParse.ch || !messageParse.tick || !messageParse.ch.includes('depth')) { return };
    if (messageParse.tick.event !== 'snapshot' && messageParse.tick.event !== 'update') { return };
    const orderBookData = orderBooksWsObject.data.find(v => v.symbol === v.symbol);
    if (!orderBookData) { return };
    const orderBookEvent = messageParse.tick;
    if ((Date.now() - +orderBookEvent.ts) > 5000) { return webSocketPublic.close(); }
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
        sub: `market.${params.symbol}.depth.size_150.high_freq`,
        data_type: 'incremental'
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
