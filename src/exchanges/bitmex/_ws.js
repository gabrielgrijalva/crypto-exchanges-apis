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
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(topic, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
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
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function Ws(wsSettings = {}) {
  // Default ws wsSettings values
  wsSettings.URL = wsSettings.URL || 'wss://ws.bitmex.com/realtime';
  // Rest creation
  const rest = Rest({
    API_KEY: wsSettings.API_KEY,
    API_SECRET: wsSettings.API_SECRET,
    API_PASSPHRASE: wsSettings.API_PASSPHRASE,
  });
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
    getOrders: (params) => {
      const webSocket = WebSocket('bitmex:orders:orders', wsSettings);
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').ordersEventEmitter} */
          ordersWsObject.events = new Events.EventEmitter();
          const topic = `execution:${params.symbol}`;
          await connectWebSocket(topic, webSocket, wsSettings);
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
              ordersWsObject.events.emit('creations-updates', creationOrders);
            }
            if (executionOrders.length) {
              ordersWsObject.events.emit('executions', executionOrders);
            }
            if (cancelationOrders.length) {
              ordersWsObject.events.emit('cancelations', cancelationOrders);
            }
          });
          webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsSettings) });
        },
      };
      return ordersWsObject;
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
    getPosition: (params) => {
      const webSocket = WebSocket('bitmex:position:position', wsSettings);
      /** @type {import('../../../typings/_ws').positionWsObjectReturn} */
      const positionWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').positionEventEmitter} */
          positionWsObject.events = new Events.EventEmitter();
          const topic = `position:${params.symbol}`;
          await connectWebSocket(topic, webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
            const positionEvent = messageParse.data[0];
            if (isNaN(+positionEvent.currentQty)) { return };
            positionWsObject.data.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : positionWsObject.data.pxS) : 0;
            positionWsObject.data.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : positionWsObject.data.pxB) : 0;
            positionWsObject.data.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
            positionWsObject.data.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsSettings) });
        },
      };
      return positionWsObject;
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
    getLiquidation: (params) => {
      const webSocketInstrument = WebSocket('bitmex:liquidation:instrument', wsSettings);
      const webSocketPosition = WebSocket('bitmex:liquidation:position', wsSettings);
      /** @type {import('../../../typings/_ws').liquidationWsObjectReturn} */
      const liquidationWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
          liquidationWsObject.events = new Events.EventEmitter();
          const topicInstrument = `instrument:${params.symbol}`;
          const topicPosition = `position:${params.symbol}`;
          await Promise.all([
            connectWebSocket(topicInstrument, webSocketInstrument, wsSettings),
            connectWebSocket(topicPosition, webSocketPosition, wsSettings),
          ]);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          const liquidationRestData = (await rest.getLiquidation(params)).data;
          // Liquidation data
          /** @type {import('../../../typings/_ws').dataLiquidation} */
          liquidationWsObject.data = Object.assign({}, positionRestData, liquidationRestData);
          webSocketInstrument.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.table !== 'instrument' || !messageParse.data || !messageParse.data[0]) { return };
            const instrumentEvent = messageParse.data[0];
            liquidationWsObject.data.markPx = +instrumentEvent.markPrice ? +instrumentEvent.markPrice : liquidationWsObject.data.markPx;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.table !== 'position' || !messageParse.data || !messageParse.data[0]) { return };
            const positionEvent = messageParse.data[0];
            if (isNaN(+positionEvent.currentQty)) { return };
            liquidationWsObject.data.pxS = +positionEvent.currentQty < 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidationWsObject.data.pxS) : 0;
            liquidationWsObject.data.pxB = +positionEvent.currentQty > 0 ? (+positionEvent.avgEntryPrice ? +positionEvent.avgEntryPrice : liquidationWsObject.data.pxB) : 0;
            liquidationWsObject.data.qtyS = +positionEvent.currentQty < 0 ? Math.abs(+positionEvent.currentQty) : 0;
            liquidationWsObject.data.qtyB = +positionEvent.currentQty > 0 ? Math.abs(+positionEvent.currentQty) : 0;
            liquidationWsObject.data.liqPxS = +positionEvent.currentQty < 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidationWsObject.data.liqPxS) : 0;
            liquidationWsObject.data.liqPxB = +positionEvent.currentQty > 0 ? (+positionEvent.liquidationPrice ? +positionEvent.liquidationPrice : liquidationWsObject.data.liqPxB) : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, wsSettings));
        }
      }
      return liquidationWsObject;
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
    getOrderBook: (params) => {
      const webSocket = WebSocket('bitmex:order-book:order-book', wsSettings);
      /** @type {import('../../../typings/_ws').orderBookWsObjectReturn} */
      const orderBookWsObject = {
        data: null,
        events: null,
        connect: async () => {
          orderBookWsObject.data = OrderBook();
          if (params && params.type === 'server') {
            orderBookWsObject.data._createServer(params);
          }
          if (params && params.type === 'client') {
            orderBookWsObject.data._connectClient(webSocket, params); return;
          }
          // Connect websocket
          const topic = `orderBookL2:${params.symbol}`;
          await connectWebSocket(topic, webSocket, wsSettings);
          // Order book functionality
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (messageParse.action === 'partial') {
              synchronizeOrderBookSnapshot(messageParse.data, orderBookWsObject.data);
            }
            if (messageParse.action === 'insert') {
              messageParse.data.forEach(v => {
                const update = { id: +v.id, price: +v.price, quantity: +v.size };
                if (v.side === 'Sell') {
                  orderBookWsObject.data._updateOrderByPriceAsk(update);
                }
                if (v.side === 'Buy') {
                  orderBookWsObject.data._updateOrderByPriceBid(update);
                }
              });
            }
            if (messageParse.action === 'update') {
              messageParse.data.forEach(v => {
                const update = { id: +v.id, price: null, quantity: +v.size };
                if (v.side === 'Sell') {
                  orderBookWsObject.data._updateOrderByIdAsk(update);
                }
                if (v.side === 'Buy') {
                  orderBookWsObject.data._updateOrderByIdBid(update);
                }
              });
            }
            if (messageParse.action === 'delete') {
              messageParse.data.forEach(v => {
                const update = { id: +v.id, price: null, quantity: null };
                if (v.side === 'Sell') {
                  orderBookWsObject.data._deleteOrderByIdAsk(update);
                }
                if (v.side === 'Buy') {
                  orderBookWsObject.data._deleteOrderByIdBid(update);
                }
              });
            }
          });
          webSocket.addOnClose(() => {
            desynchronizeOrderBook(orderBookWsObject.data);
            connectWebSocket(topic, webSocket, wsSettings);
          });
          await (new Promise(resolve => {
            let counter = 0;
            const interval = setInterval(() => {
              counter += 1;
              if (counter >= 120) throw new Error('Could not verify connection of order book.');
              if (!orderBookWsObject.data.asks.length || !orderBookWsObject.data.bids.length) return;
              resolve(); clearInterval(interval);
            }, 500);
          }));
        }
      };
      return orderBookWsObject;
    },
  };
  return ws;
}
module.exports = Ws;
