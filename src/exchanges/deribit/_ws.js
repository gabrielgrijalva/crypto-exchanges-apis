const uuid = require('uuid').v4;
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
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.label;
  return eventData;
};
/**
 * 
 * @param {string} channel 
 * @param {string} method
 */
function getSubscribeParams(channel, method) {
  const subscribeParams = {};
  subscribeParams.jsonrpc = '2.0';
  subscribeParams.method = `${method}/subscribe`;
  subscribeParams.id = '1';
  subscribeParams.params = {
    channels: [channel],
  };
  return subscribeParams;
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
  signatureParams.id = '1';
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
 * @param {string} channel
 * @param {string} method
 * @param {WsN.WebSocket} webSocket 
 * @param {WsN.wsOptions} wsOptions 
 */
function connectWebSocket(channel, method, webSocket, wsOptions) {
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const subscribeParams = getSubscribeParams(channel, method);
    const signatureParams = getSignatureParams(apiKey, apiSecret);
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connectOnOpenFunction() {
      if (signatureParams) {
        webSocket.send(JSON.stringify(signatureParams));
      }
      webSocket.send(JSON.stringify(subscribeParams));
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.id && messageParse.result[0] === channel) {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      };
    };
    webSocket.addOnOpen(connectOnOpenFunction);
    webSocket.addOnMessage(connectOnMessageFunction);
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
 * @param {WsN.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://www.deribit.com/ws/api/v2';
  wsOptions.apiKey = wsOptions.apiKey || '';
  wsOptions.apiSecret = wsOptions.apiSecret || '';
  // Rest creation
  const rest = Rest({ apiKey: wsOptions.apiKey, apiSecret: wsOptions.apiSecret });
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
      // Open orders websocket
      const channelOpenOrders = `user.orders.${ordersParams.symbol}.raw`;
      const webSocketOpenOrders = WebSocket();
      // Executions websocket
      const channelExecutions = `user.trades.${ordersParams.symbol}.raw`;
      const webSocketExecutions = WebSocket();
      await Promise.all([
        connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, wsOptions),
        connectWebSocket(channelExecutions, 'private', webSocketExecutions, wsOptions),
      ]);
      webSocketOpenOrders.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channelOpenOrders) { return };
        if (!messageParse.params.data) { return };
        const order = messageParse.params.data;
        if (order.order_state === 'open') {
          eventEmitter.emit('creations-updates', [createCreationUpdate(order)]);
        }
        if (order.order_state === 'rejected' || order.order_state === 'cancelled') {
          eventEmitter.emit('cancelations', [createCancelation(order)]);
        }
      });
      webSocketExecutions.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channelExecutions) { return };
        if (!messageParse.params.data.length) { return };
        const executionOrders = [];
        for (let i = 0; messageParse.params.data[i]; i += 1) {
          const order = messageParse.params.data[i];
          executionOrders.push(createExecution(order))
        }
        if (executionOrders.length) {
          eventEmitter.emit('executions', executionOrders);
        }
      });
      webSocketOpenOrders.addOnClose(() => { connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, wsOptions) });
      webSocketExecutions.addOnClose(() => { connectWebSocket(channelExecutions, 'private', webSocketExecutions, wsOptions) });
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
      const channel = `user.changes.${positionParams.symbol}.raw`;
      const webSocket = WebSocket();
      await connectWebSocket(channel, 'private', webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channel) { return };
        const positionEvent = messageParse.params.data.positions[0];
        if (!positionEvent) { return };
        position.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
        position.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
        position.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
        position.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnClose(() => { connectWebSocket(channel, 'private', webSocket, wsOptions) });
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
      const channelInstrument = `ticker.${liquidationParams.symbol}.raw`;
      const webSocketInstrument = WebSocket();
      // Position websocket
      const channelPosition = `user.changes.${liquidationParams.symbol}.raw`;
      const webSocketPosition = WebSocket();
      // Portfolio websocket
      const channelPortfolio = `user.portfolio.${liquidationParams.asset}`;
      const webSocketPortfolio = WebSocket();
      await Promise.all([
        connectWebSocket(channelInstrument, 'public', webSocketInstrument, wsOptions),
        connectWebSocket(channelPosition, 'private', webSocketPosition, wsOptions),
        connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, wsOptions),
      ]);
      // Load rest info
      const positionRestParams = { symbol: liquidationParams.symbol };
      const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketInstrument.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channelInstrument) { return };
        const instrumentEvent = messageParse.params.data;
        if (!instrumentEvent) { return };
        liquidation.markPx = +instrumentEvent.mark_price ? +instrumentEvent.mark_price : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channelPosition) { return };
        const positionEvent = messageParse.params.data.positions[0];
        if (!positionEvent) { return };
        liquidation.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
        liquidation.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
        liquidation.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
        liquidation.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPortfolio.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || messageParse.params.channel !== channelPortfolio.toLowerCase()) { return };
        const portfolioEvent = messageParse.params.data;
        if (!portfolioEvent) { return };
        liquidation.liqPxS = liquidation.qtyS ? +portfolioEvent.estimated_liquidation_ratio * liquidation.markPx : 0;
        liquidation.liqPxB = liquidation.qtyB ? +portfolioEvent.estimated_liquidation_ratio * liquidation.markPx : 0;
      });
      webSocketInstrument.addOnClose(() => connectWebSocket(channelInstrument, 'public', webSocketInstrument, wsOptions));
      webSocketPosition.addOnClose(() => connectWebSocket(channelPosition, 'private', webSocketPosition, wsOptions));
      webSocketPortfolio.addOnClose(() => connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, wsOptions));
      return { info: liquidation, events: eventEmitter };
    },
  };
  return ws;
}
module.exports = Ws;