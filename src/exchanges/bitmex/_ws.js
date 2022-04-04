const crypto = require('crypto');
const moment = require('moment');
const Events = require('events');
const Rest = require('./_rest');
const WebSocket = require('../../_shared-classes/websocket');
const OrderBook = require('../../_shared-classes/order-book');
const { connect } = require('http2');
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
  eventData.event = 'creations-updates';
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.orderQty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.clOrdID;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.lastPx;
  eventData.quantity = +data.lastQty;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.clOrdID;
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
  return new Promise((resolve) => {
    const url = settings.WS.URL;
    const apiKey = settings.API_KEY;
    const apiSecret = settings.API_SECRET;
    const signedHeaders = getSignedHeaders(apiKey, apiSecret);
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}?subscribe=${topic}`, { headers: signedHeaders });
    function connectFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.success && messageParse.subscribe === topic) {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnMessage(connectFunction);
      }
    };
    webSocket.addOnMessage(connectFunction, false);
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
 * @param {import('../../../typings/settings')} settings
 */
function Ws(settings) {
  // Default ws settings values
  settings.REST = settings.REST || {};
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
      connect: async () => {
        /** @type {import('../../../typings/_ws').ordersEventEmitter} */
        ws.orders.events = new Events.EventEmitter();
        const topic = `execution:${settings.SYMBOL}`;
        const webSocket = WebSocket('bitmex:orders:orders');
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
      connect: async () => {
        /** @type {import('../../../typings/_ws').positionEventEmitter} */
        ws.position.events = new Events.EventEmitter();
        const topic = `position:${settings.SYMBOL}`;
        const webSocket = WebSocket('bitmex:position:position');
        await connectWebSocket(topic, webSocket, settings);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
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
      connect: async () => {
        /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
        ws.liquidation.events = new Events.EventEmitter();
        // Instrument websocket
        const topicInstrument = `instrument:${settings.SYMBOL}`;
        const webSocketInstrument = WebSocket('bitmex:liquidation:instrument');
        // Position websocket
        const topicPosition = `position:${settings.SYMBOL}`;
        const webSocketPosition = WebSocket('bitmex:liquidation:position');
        await Promise.all([
          connectWebSocket(topicInstrument, webSocketInstrument, settings),
          connectWebSocket(topicPosition, webSocketPosition, settings),
        ]);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        const liquidationRestData = (await rest.getLiquidation()).data;
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
        webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, settings));
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
      connect: async (params) => {
        const webSocket = WebSocket('bitmex:order-book:order-book');
        ws.orderBook.info = OrderBook();
        if (params && params.type === 'server') {
          ws.orderBook.info._createServer(params);
        }
        if (params && params.type === 'client') {
          ws.orderBook.info._connectClient(webSocket, params); return;
        }
        // Connect websocket
        const topic = `orderBookL2:${settings.SYMBOL}`;
        await connectWebSocket(topic, webSocket, settings);
        // Order book functionality
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
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket(topic, webSocket, settings);
        });
        await (new Promise(resolve => {
          let counter = 0;
          const interval = setInterval(() => {
            counter += 1;
            if (counter >= 120) throw new Error('Could not verify connection of order book.');
            if (!ws.orderBook.info.asks.length || !ws.orderBook.info.bids.length) return;
            resolve(); clearInterval(interval);
          }, 500);
        }));
      }
    },
  };
  return ws;
}
module.exports = Ws;
