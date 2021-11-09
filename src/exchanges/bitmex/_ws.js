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
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.orderQty;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.lastPx;
  eventData.quantity = +data.lastQty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.clOrdID;
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedHeaders(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return {} };
  const nonce = Date.now() * 1000;
  const digest = `GET/realtime${nonce}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(digest).digest('hex');
  const signedHeaders = {
    'api-nonce': nonce,
    'api-key': apiKey,
    'api-signature': signature,
  };
  return signedHeaders;
};
/**
 * 
 * @param {string} topic
 * @param {WsN.WebSocket} webSocket 
 * @param {WsN.wsOptions} wsOptions 
 */
function connectWebSocket(topic, webSocket, wsOptions) {
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const signedHeaders = getSignedHeaders(apiKey, apiSecret);
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}?subscribe=${topic}`, { headers: signedHeaders });
    webSocket.addOnMessage(function connectFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.success && messageParse.subscribe === topic) {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnMessage(connectFunction);
      }
    });
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
  wsOptions.url = wsOptions.url || 'wss://ws.bitmex.com/realtime';
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
      const topic = `execution:${ordersParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== `execution` || messageParse.action !== 'insert') { return };
        const creationOrders = [];
        const executionOrders = [];
        const cancelationOrders = [];
        for (let i = 0; messageParse.data[i]; i += 1) {
          const data = messageParse.data[i];
          if (data.execType === 'New' || data.execType === 'Replaced') {
            creationOrders.push(createCreationUpdate(data));
          }
          if (data.execType === 'Trade') {
            executionOrders.push(createExecution(data));
          }
          if (data.execType === 'Canceled') {
            cancelationOrders.push(createCancelation(data))
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
      webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsOptions) });
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
      const topic = `position:${positionParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionData = (await rest.getPosition(positionRestParams)).data;
      /** @type {WsN.dataPosition} */
      const position = Object.assign({}, positionData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
        const positionInfo = messageParse.data[0];
        if (isNaN(+positionInfo.currentQty)) { return };
        position.pxS = +positionInfo.currentQty < 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : position.pxS) : 0;
        position.pxB = +positionInfo.currentQty > 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : position.pxB) : 0;
        position.qtyS = +positionInfo.currentQty < 0 ? Math.abs(+positionInfo.currentQty) : 0;
        position.qtyB = +positionInfo.currentQty > 0 ? Math.abs(+positionInfo.currentQty) : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsOptions) });
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
      const topicInstrument = `instrument:${liquidationParams.symbol}`;
      const webSocketInstrument = WebSocket();
      // Position websocket
      const topicPosition = `position:${liquidationParams.symbol}`;
      const webSocketPosition = WebSocket();
      await Promise.all([
        connectWebSocket(topicInstrument, webSocketInstrument, wsOptions),
        connectWebSocket(topicPosition, webSocketPosition, wsOptions),
      ]);
      // Load rest info
      const positionRestParams = { symbol: liquidationParams.symbol };
      const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
      const positionData = (await rest.getPosition(positionRestParams)).data;
      const liquidationData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionData, liquidationData);
      webSocketInstrument.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'instrument' || !messageParse.data || !messageParse.data[0]) { return };
        const instrumentInfo = messageParse.data[0];
        liquidation.markPx = +instrumentInfo.markPrice ? +instrumentInfo.markPrice : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
        const positionInfo = messageParse.data[0];
        if (isNaN(+positionInfo.currentQty)) { return };
        liquidation.pxS = +positionInfo.currentQty < 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : liquidation.pxS) : 0;
        liquidation.pxB = +positionInfo.currentQty > 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : liquidation.pxB) : 0;
        liquidation.qtyS = +positionInfo.currentQty < 0 ? Math.abs(+positionInfo.currentQty) : 0;
        liquidation.qtyB = +positionInfo.currentQty > 0 ? Math.abs(+positionInfo.currentQty) : 0;
        liquidation.liqPxS = +positionInfo.currentQty < 0 ? (+positionInfo.liquidationPrice ? +positionInfo.liquidationPrice : liquidation.liqPxS) : 0;
        liquidation.liqPxB = +positionInfo.currentQty > 0 ? (+positionInfo.liquidationPrice ? +positionInfo.liquidationPrice : liquidation.liqPxB) : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, wsOptions));
      webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, wsOptions));
      return { info: liquidation, events: eventEmitter };
    },
  };
  return ws;
}
module.exports = Ws;
