const zlib = require('zlib');
const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
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
  eventData.id = data.client_oid;
  eventData.side = (data.type === '2' || data.type === '3') ? 'sell' : 'buy';
  eventData.price = +data.price;
  eventData.quantity = +data.size;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.client_oid;
  eventData.side = (data.type === '2' || data.type === '3') ? 'sell' : 'buy';
  eventData.price = +data.last_fill_px;
  eventData.quantity = +data.last_fill_qty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.client_oid;
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret, apiPassphrase) {
  if (!apiKey || !apiSecret || !apiPassphrase) { return };
  const path = '/users/self/verify';
  const method = 'GET';
  const timestamp = Date.now() / 1000;
  const digest = `${timestamp}${method}${path}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(digest).digest('base64');
  return { op: 'login', args: [apiKey, apiPassphrase, timestamp, signature] };
};
/**
 * 
 * @param {string} channel
 * @param {WsN.WebSocket} webSocket 
 * @param {WsN.wsOptions} wsOptions 
 */
function connectWebSocket(channel, webSocket, wsOptions) {
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const apiPassphrase = wsOptions.apiPassphrase;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      const signedRequest = getSignedRequest(apiKey, apiSecret, apiPassphrase);
      if (signedRequest) {
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        const request = { op: 'subscribe', args: [channel] };
        webSocket.send(JSON.stringify(request));
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
      if (messageParse.event === 'login' && messageParse.success) {
        const request = { op: 'subscribe', args: [channel] };
        webSocket.send(JSON.stringify(request));
      }
      if (messageParse.event === 'subscribe' && messageParse.channel === channel) {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction);
    webSocket.addOnMessage(connectOnMessageFunction);
  });
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order
 */
function removeOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.order_id === order.order_id);
  if (index === -1) { return };
  openOrders.splice(index, 1);
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order 
 */
function addUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.order_id === order.order_id);
  if (index === -1) {
    openOrders.push(order);
  } else {
    openOrders[index] = order;
  }
};
function getFillAndUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.order_id === order.order_id);
  if (index === -1) { throw 'Could not get past order event.' };
  const openOrder = openOrders[index];
  const fill = order.filled_qty !== openOrder.filled_qty;
  const update = order.price !== openOrder.price || order.size !== openOrder.size;
  openOrders[index] = order;
  return { fill, update };
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
 * @param {WsN.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://real.okex.com:8443/ws/v3';
  wsOptions.apiKey = wsOptions.apiKey || '';
  wsOptions.apiSecret = wsOptions.apiSecret || '';
  wsOptions.apiPassphrase = wsOptions.apiPassphrase || '';
  // Rest creation
  const rest = Rest({ apiKey: wsOptions.apiKey, apiSecret: wsOptions.apiSecret, apiPassphrase: wsOptions.apiPassphrase });
  // Websocket creation
  /** 
   * 
   * 
   * @type {WsN.Ws} 
   * 
   * 
   */
  const ws = {
    /**
     * 
     * 
     * 
     * WS ORDERS
     * 
     * 
     * 
     */
    orders: async (ordersParams) => {
      /** @type {WsN.ordersEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const openOrders = [];
      // Orders websocket
      const channel = `futures/order:${ordersParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(channel, webSocket, wsOptions);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.table !== `futures/order`) { return };
        const creationOrders = [];
        const executionOrders = [];
        const cancelationOrders = [];
        for (let i = 0; messageParse.data[i]; i += 1) {
          const order = messageParse.data[i];
          if (order.instrument_id === ordersParams.symbol) {
            if (order.state === '0') {
              if (order.last_amend_result === '-1') {
                removeOpenOrders(openOrders, order);
                cancelationOrders.push(createCancelation(order));
              } else {
                addUpdateOpenOrders(openOrders, order);
                creationOrders.push(createCreationUpdate(order));
              }
            }
            if (order.state === '1' || order.state === '2') {
              if (order.last_amend_result === '-1') {
                removeOpenOrders(openOrders, order);
                cancelationOrders.push(createCancelation(order));
              } else {
                const fillAndUpdate = getFillAndUpdateOpenOrders(order);
                if (fillAndUpdate.update) {
                  creationOrders.push(createCreationUpdate(order));
                }
                if (fillAndUpdate.fill) {
                  executionOrders.push(createExecution(order));
                }
              }
            }
            if (order.state === '-1' || order.state === '-2') {
              removeOpenOrders(openOrders, order);
              cancelationOrders.push(createCancelation(order));
            }
          }
        }
        if (creationOrders.length) {
          eventEmitter.emit('creations-updates', creationOrders);
        }
        if (executionOrders.length) {
          eventEmitter.emit('executions', executionOrders);
        }
        if (cancelationOrders.length) {
          eventEmitter.emit('cancelations', cancelationOrders);
        }
      });
      return { events: eventEmitter };
    },
    /**
     * 
     * 
     * 
     * WS POSITION
     * 
     * 
     * 
     */
    position: async (positionParams) => {
      /** @type {WsN.positionEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const channel = `futures/position:${positionParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(channel, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParse.table !== `futures/position`) { return };
        const positionEvent = messageParse.data.find(v => v.instrument_id === positionParams.symbol);
        if (!positionEvent) { return };
        position.pxS = +positionEvent.short_qty ? +positionEvent.short_avg_cost : 0;
        position.pxB = +positionEvent.long_qty ? +positionEvent.long_avg_cost : 0;
        position.qtyS = +positionEvent.short_qty;
        position.qtyB = +positionEvent.long_qty;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnClose(() => { connectWebSocket(channel, webSocket, wsOptions) });
      return { info: position, events: eventEmitter };
    },
    /**
     * 
     * 
     * 
     * WS LIQUIDATION
     * 
     * 
     * 
     */
    liquidation: async (liquidationParams) => {
      /** @type {WsN.liquidationEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      // Instrument websocket
      const channelMark = `futures/mark_price:${liquidationParams.symbol}`;
      const webSocketMark = WebSocket();
      // Position websocket
      const channelPosition = `futures/position:${liquidationParams.symbol}`;
      const webSocketPosition = WebSocket();
      await Promise.all([
        connectWebSocket(channelMark, webSocketMark, wsOptions),
        connectWebSocket(channelPosition, webSocketPosition, wsOptions),
      ]);
      // Load rest info
      const positionRestParams = { symbol: liquidationParams.symbol };
      const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketMark.addOnMessage((message) => {
        const messageParsed = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParsed.table !== 'futures/mark_price') { return };
        const instrument = messageParsed.data.find(v => v.instrument_id === liquidationParams.symbol);
        if (!instrument) { return };
        liquidation.markPx = +instrument.mark_price;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParsed = JSON.parse(zlib.inflateRawSync(message).toString());
        if (messageParsed.table !== 'futures/position') { return };
        const position = messageParsed.data.find(v => v.instrument_id === liquidationParams.symbol);
        if (!position) { return };
        liquidation.pxS = +position.short_qty ? +position.short_avg_cost : 0;
        liquidation.pxB = +position.long_qty ? +position.long_avg_cost : 0;
        liquidation.qtyS = +position.short_qty;
        liquidation.qtyB = +position.long_qty;
        liquidation.liqPxS = +position.short_qty ? +position.liquidation_price : 0;
        liquidation.liqPxB = +position.long_qty ? +position.liquidation_price : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketMark.addOnClose(() => connectWebSocket(channelMark, webSocketMark, wsOptions));
      webSocketPosition.addOnClose(() => connectWebSocket(channelPosition, webSocketPosition, wsOptions));
      return { info: liquidation, events: eventEmitter };
    },
  };
  return ws;
}
module.exports = Ws;
