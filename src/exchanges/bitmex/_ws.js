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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/settings')} settings
 */
function connectWebSocket(topic, webSocket, settings) {
  console.log(`Connecting websocket: ${settings.WS.URL}`);
  return new Promise((resolve) => {
    const url = settings.WS.URL;
    const apiKey = settings.API_KEY;
    const apiSecret = settings.API_SECRET;
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
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/**
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
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
 * @param {import('../../../typings/settings')} [settings]
 */
function Ws(settings) {
  // Default wsOptions values
  settings.WS.URL = settings.WS.URL || 'wss://ws.bitmex.com/realtime';
  // Rest creation
  const rest = Rest(settings);
  // Websocket creation
  /** 
   * 
   * 
   * @type {import('../../../typings/_ws').Ws} 
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
    orders: {
      info: null,
      events: null,
      connect: async (ordersParams) => {
        /** @type {import('../../../typings/_ws').ordersEventEmitter} */
        ws.orders.events = new Events.EventEmitter();
        const topic = `execution:${settings.SYMBOL}`;
        const webSocket = WebSocket();
        await connectWebSocket(topic, webSocket, settings);
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
            ws.orders.events.emit('creations-updates', creationOrders);
          }
          if (executionOrders.length) {
            ws.orders.events.emit('executions', executionOrders);
          }
          if (cancelationOrders.length) {
            ws.orders.events.emit('cancelations', cancelationOrders);
          }
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, settings) });
      },
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
    position: {
      info: null,
      events: null,
      connect: async (positionParams) => {
        /** @type {import('../../../typings/_ws').positionEventEmitter} */
        ws.position.events = new Events.EventEmitter();
        const topic = `position:${settings.SYMBOL}`;
        const webSocket = WebSocket();
        await connectWebSocket(topic, webSocket, settings);
        // Load rest info
        const positionRestParams = { symbol: settings.SYMBOL };
        const positionRestData = (await rest.getPosition(positionRestParams)).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
          const positionEvent = messageParse.data[0];
          if (isNaN(+positionEvent.currentQty)) { return };
          ws.position.info.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : ws.position.info.pxS) : 0;
          ws.position.info.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : ws.position.info.pxB) : 0;
          ws.position.info.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
          ws.position.info.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, settings) });
      },
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
    liquidation: {
      info: null,
      events: null,
      connect: async (liquidationParams) => {
        /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
        ws.liquidation.events = new Events.EventEmitter();
        // Instrument websocket
        const topicInstrument = `instrument:${settings.SYMBOL}`;
        const webSocketInstrument = WebSocket();
        // Position websocket
        const topicPosition = `position:${settings.SYMBOL}`;
        const webSocketPosition = WebSocket();
        await Promise.all([
          connectWebSocket(topicInstrument, webSocketInstrument, settings),
          connectWebSocket(topicPosition, webSocketPosition, settings),
        ]);
        // Load rest info
        const positionRestParams = { symbol: settings.SYMBOL };
        const liquidationRestParams = { symbol: settings.SYMBOL, asset: liquidationParams.asset };
        const positionRestData = (await rest.getPosition(positionRestParams)).data;
        const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketInstrument.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.table !== 'instrument' || !messageParse.data || !messageParse.data[0]) { return };
          const instrumentEvent = messageParse.data[0];
          ws.liquidation.info.markPx = +instrumentEvent.markPrice ? +instrumentEvent.markPrice : ws.liquidation.info.markPx;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
          const positionEvent = messageParse.data[0];
          if (isNaN(+positionEvent.currentQty)) { return };
          ws.liquidation.info.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : ws.liquidation.info.pxS) : 0;
          ws.liquidation.info.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : ws.liquidation.info.pxB) : 0;
          ws.liquidation.info.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
          ws.liquidation.info.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
          ws.liquidation.info.liqPxS = +positionEvent.currentQty < 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : ws.liquidation.info.liqPxS) : 0;
          ws.liquidation.info.liqPxB = +positionEvent.currentQty > 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : ws.liquidation.info.liqPxB) : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketInstrument.addOnError(() => console.log('Websocket connection error.'));
        webSocketInstrument.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, settings));
        webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
        webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, settings));
      }
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
    orderBook: {
      info: null,
      events: null,
      connect: async (orderBookParams) => {
        // Connect websocket
        const topic = `orderBookL2:${settings.SYMBOL}`;
        const webSocket = WebSocket();
        await connectWebSocket(topic, webSocket, settings);
        // Order book functionality
        ws.orderBook.info = OrderBook();
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          if (messageParse.action === 'partial') {
            synchronizeOrderBookSnapshot(messageParse.data, ws.orderBook.info);
          }
          if (messageParse.action === 'insert') {
            messageParse.data.forEach(v => {
              const update = { id: +v.id, price: +v.price, quantity: +v.size };
              if (v.side === 'Sell') {
                ws.orderBook.info._updateOrderByPriceAsk(update);
              }
              if (v.side === 'Buy') {
                ws.orderBook.info._updateOrderByPriceBid(update);
              }
            });
          }
          if (messageParse.action === 'update') {
            messageParse.data.forEach(v => {
              const update = { id: +v.id, price: null, quantity: +v.size };
              if (v.side === 'Sell') {
                ws.orderBook.info._updateOrderByIdAsk(update);
              }
              if (v.side === 'Buy') {
                ws.orderBook.info._updateOrderByIdBid(update);
              }
            });
          }
          if (messageParse.action === 'delete') {
            messageParse.data.forEach(v => {
              const update = { id: +v.id, price: null, quantity: null };
              if (v.side === 'Sell') {
                ws.orderBook.info._deleteOrderByIdAsk(update);
              }
              if (v.side === 'Buy') {
                ws.orderBook.info._deleteOrderByIdBid(update);
              }
            });
          }
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket(topic, webSocket, settings);
        });
      }
    },
  };
  return ws;
}
module.exports = Ws;
