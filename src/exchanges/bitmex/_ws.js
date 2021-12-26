const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBook = require('../../_shared-classes/order-book');
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
 * @param {import('../../../typings').WsN.WebSocket} webSocket 
 * @param {import('../../../typings').WsN.wsOptions} wsOptions 
 */
function connectWebSocket(topic, webSocket, wsOptions) {
  console.log(`Connecting websocket: ${wsOptions.url}`);
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
        console.log('Connected websocket');
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnMessage(connectFunction);
      }
    });
  });
};
/**
 * 
 * @param {import('../../../typings').WsN.dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/**
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings').WsN.dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  snapshot = snapshot.reduce((a, v) => {
    if (v.side === 'Sell') {
      a.asks.unshift({ id: +v.id, price: +v.price, quantity: +v.size });
    }
    if (v.side === 'Buy') {
      a.bids.push({ id: +v.id, price: +v.price, quantity: +v.size });
    }
    return a;
  }, { asks: [], bids: [] });
  orderBook._insertSnapshotAsks(snapshot.asks);
  orderBook._insertSnapshotBids(snapshot.bids);
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
 * @param {import('../../../typings').WsN.wsOptions} [wsOptions]
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
   * @type {import('../../../typings').WsN.Ws} 
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
      /** @type {import('../../../typings').WsN.ordersEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const topic = `execution:${ordersParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
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
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
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
      /** @type {import('../../../typings').WsN.positionEventEmitter} */
      const eventEmitter = new Events.EventEmitter();
      const topic = `position:${positionParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {import('../../../typings').WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
        const positionEvent = messageParse.data[0];
        if (isNaN(+positionEvent.currentQty)) { return };
        position.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : position.pxS) : 0;
        position.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : position.pxB) : 0;
        position.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
        position.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
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
      /** @type {import('../../../typings').WsN.liquidationEventEmitter} */
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
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {import('../../../typings').WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketInstrument.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.table !== 'instrument' || !messageParse.data || !messageParse.data[0]) { return };
        const instrumentEvent = messageParse.data[0];
        liquidation.markPx = +instrumentEvent.markPrice ? +instrumentEvent.markPrice : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
        const positionEvent = messageParse.data[0];
        if (isNaN(+positionEvent.currentQty)) { return };
        liquidation.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidation.pxS) : 0;
        liquidation.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidation.pxB) : 0;
        liquidation.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
        liquidation.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
        liquidation.liqPxS = +positionEvent.currentQty < 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidation.liqPxS) : 0;
        liquidation.liqPxB = +positionEvent.currentQty > 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidation.liqPxB) : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketInstrument.addOnError(() => console.log('Websocket connection error.'));
      webSocketInstrument.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, wsOptions));
      webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
      webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, wsOptions));
      return { info: liquidation, events: eventEmitter };
    },
    /**
     * 
     * 
     * 
     * WS ORDER BOOK
     * 
     * 
     * 
     */
    orderBook: async (orderBookParams) => {
      // Connect websocket
      const topic = `orderBookL2:${orderBookParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      // Order book functionality
      const orderBook = OrderBook();
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.action === 'partial') {
          synchronizeOrderBookSnapshot(messageParse.data, orderBook);
        }
        if (messageParse.action === 'insert') {
          messageParse.data.forEach(v => {
            const update = { id: +v.id, price: +v.price, quantity: +v.size };
            if (v.side === 'Sell') {
              orderBook._updateOrderByPriceAsk(update);
            }
            if (v.side === 'Buy') {
              orderBook._updateOrderByPriceBid(update);
            }
          });
        }
        if (messageParse.action === 'update') {
          messageParse.data.forEach(v => {
            const update = { id: +v.id, price: null, quantity: +v.size };
            if (v.side === 'Sell') {
              orderBook._updateOrderByIdAsk(update);
            }
            if (v.side === 'Buy') {
              orderBook._updateOrderByIdBid(update);
            }
          });
        }
        if (messageParse.action === 'delete') {
          messageParse.data.forEach(v => {
            const update = { id: +v.id, price: null, quantity: null };
            if (v.side === 'Sell') {
              orderBook._deleteOrderByIdAsk(update);
            }
            if (v.side === 'Buy') {
              orderBook._deleteOrderByIdBid(update);
            }
          });
        }
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(orderBook);
        connectWebSocket(topic, webSocket, wsOptions)
      });
      return { info: orderBook, };
    },
  };
  return ws;
}
module.exports = Ws;
