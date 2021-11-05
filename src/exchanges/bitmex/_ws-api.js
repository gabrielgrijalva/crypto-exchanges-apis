const moment = require('moment');
const Events = require('events');
const WebSocket = require('./__websocket');
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
 * @param {WsApi.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://ws.bitmex.com/realtime';
  wsOptions.apiKey = wsOptions.apiKey || '';
  wsOptions.apiSecret = wsOptions.apiSecret || '';
  // Websocket creation
  /** 
   * 
   * 
   * @type {WsApi.Ws} 
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
      /** @type {WsApi.ordersEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const topic = `execution:${ordersParams.symbol}`;
      const webSocket = WebSocket(topic, wsOptions);
      await webSocket.connect();
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
      /** @type {WsApi.positionEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const topic = `execution:${positionParams.symbol}`;
      const webSocket = WebSocket(topic, wsOptions);
      await webSocket.connect();
      /** @type {WsApi.dataPosition} */
      const position = {
        pxS: 0, pxB: 0,
        qtyS: 0, qtyB: 0,
      };
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'position' || (messageParse.action !== 'insert'
          && messageParse.action !== 'update')) { return };
        const positionInfo = messageParse.data[0];
        if (!positionInfo) { return };
        if (isNaN(+positionInfo.currentQty)) { return };
        position.pxS = +positionInfo.currentQty < 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : this.pxS) : 0;
        position.pxB = +positionInfo.currentQty > 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : this.pxB) : 0;
        position.qtyS = +positionInfo.currentQty < 0 ? Math.abs(+positionInfo.currentQty) : 0;
        position.qtyB = +positionInfo.currentQty > 0 ? Math.abs(+positionInfo.currentQty) : 0;
        eventEmitter.emit('update', position);
      });
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
      /** @type {WsApi.liquidationEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      // Instrument websocket
      const topicInstrument = `instrument:${liquidationParams.symbol}`;
      const webSocketInstrument = WebSocket(topicInstrument, wsOptions);
      // Position websocket
      const topicPosition = `position:${liquidationParams.symbol}`;
      const webSocketPosition = WebSocket(topicPosition, wsOptions);
      await Promise.all([webSocketInstrument.connect(), webSocketPosition.connect()]);
      // Liquidation info
      /** @type {WsApi.dataLiquidation} */
      const liquidation = {
        pxS: 0, pxB: 0,
        qtyS: 0, qtyB: 0,
        markPx: 0, pxLiqS: 0, pxLiqB: 0,
      };
      webSocketInstrument.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'instrument' || messageParse.action !== 'update') { return };
        const instrumentInfo = messageParse.data[0];
        if (!instrumentInfo) { return };
        liquidation.markPx = +instrumentInfo.markPrice ? +instrumentInfo.markPrice : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.table !== 'position' || (messageParse.action !== 'insert'
          && messageParse.action !== 'update')) { return };
        const positionInfo = messageParse.data[0];
        if (!positionInfo) { return };
        if (isNaN(+positionInfo.currentQty)) { return };
        liquidation.pxS = +positionInfo.currentQty < 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : this.pxS) : 0;
        liquidation.pxB = +positionInfo.currentQty > 0 ? (+positionInfo.avgEntryPrice ? +positionInfo.avgEntryPrice : this.pxB) : 0;
        liquidation.qtyS = +positionInfo.currentQty < 0 ? Math.abs(+positionInfo.currentQty) : 0;
        liquidation.qtyB = +positionInfo.currentQty > 0 ? Math.abs(+positionInfo.currentQty) : 0;
        liquidation.pxLiqS = +positionInfo.currentQty < 0 ? (+positionInfo.liquidationPrice ? +positionInfo.liquidationPrice : liquidation.pxLiqS) : 0;
        liquidation.pxLiqB = +positionInfo.currentQty > 0 ? (+positionInfo.liquidationPrice ? +positionInfo.liquidationPrice : liquidation.pxLiqB) : 0;
        eventEmitter.emit('update', liquidation);
      });
      return { info: liquidation, events: eventEmitter };
    },
  };
}

