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
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment.utc(data.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.exec_qty;
  eventData.timestamp = moment.utc(data.trade_time).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.order_link_id;
  eventData.timestamp = moment.utc(data.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) { return };
  const expires = Date.now() + 5000;
  const signature = crypto.createHmac('sha256', apiSecret).update(`GET/realtime${expires}`).digest('hex');
  return { op: 'auth', args: [apiKey, expires, signature] };
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
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connnectOnOpenFunction() {
      const signedRequest = getSignedRequest(apiKey, apiSecret);
      if (signedRequest) {
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        webSocket.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.success && messageParse.request) {
        if (messageParse.request.op === 'auth') {
          webSocket.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
        }
        if (messageParse.request.args[0] === topic) {
          resolve();
          clearTimeout(connectTimeout);
          webSocket.removeOnOpen(connnectOnOpenFunction);
          webSocket.removeOnMessage(connectOnMessageFunction);
        }
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction, false);
    webSocket.addOnMessage(connectOnMessageFunction, false);
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
      a.asks.push({ id: +v.id, price: +v.price, quantity: +v.size });
    }
    if (v.side === 'Buy') {
      a.bids.push({ id: +v.id, price: +v.price, quantity: +v.size });
    }
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
function Ws(wsSettings) {
  // Default ws wsSettings values
  wsSettings.URL = wsSettings.URL || 'wss://stream.bybit.com/realtime';
  // Rest creation
  const rest = Rest(wsSettings);
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
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').ordersEventEmitter} */
          ordersWsObject.events = new Events.EventEmitter();
          // Orders websocket
          const topicOrders = 'order';
          const webSocketOrders = WebSocket('bybit:orders:orders');
          // Executions websocket
          const topicExecutions = 'execution';
          const webSocketExecutions = WebSocket('bybit:orders:executions');
          await Promise.all([
            connectWebSocket(topicOrders, webSocketOrders, wsSettings),
            connectWebSocket(topicExecutions, webSocketExecutions, wsSettings),
          ]);
          webSocketOrders.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.topic !== topicOrders) { return };
            const creationOrders = [];
            const cancelationOrders = [];
            for (let i = 0; messageParse.data[i]; i += 1) {
              const order = messageParse.data[i];
              if (order.symbol === params.symbol) {
                if (order.order_status === 'New' || order.order_status === 'PartiallyFilled') {
                  creationOrders.push(createCreationUpdate(order));
                }
                if (order.order_status === 'Cancelled' || order.order_status === 'Rejected') {
                  cancelationOrders.push(createCancelation(order));
                }
              }
            }
            if (creationOrders.length) {
              ordersWsObject.events.emit('creations-updates', creationOrders);
            }
            if (cancelationOrders.length) {
              ordersWsObject.events.emit('cancelations', cancelationOrders);
            }
          });
          webSocketExecutions.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (messageParse.topic !== topicExecutions) { return };
            const executionOrders = [];
            for (let i = 0; messageParse.data[i]; i += 1) {
              const order = messageParse.data[i];
              if (order.symbol === params.symbol) {
                if (order.exec_type === 'Trade') {
                  executionOrders.push(createExecution(order));
                }
              }
            }
            if (executionOrders.length) {
              ordersWsObject.events.emit('executions', executionOrders);
            }
          });
          webSocketOrders.addOnClose(() => { connectWebSocket(topicOrders, webSocketOrders, wsSettings) });
          webSocketExecutions.addOnClose(() => { connectWebSocket(topicExecutions, webSocketExecutions, wsSettings) });
        }
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
      /** @type {import('../../../typings/_ws').positionWsObjectReturn} */
      const positionWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').positionEventEmitter} */
          positionWsObject.events = new Events.EventEmitter();
          const topic = 'position';
          const webSocket = WebSocket('bybit:position:position');
          await connectWebSocket(topic, webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.topic !== topic) { return };
            const positionEvent = messageParse.data.find(v => v.symbol === params.symbol);
            if (!positionEvent) { return };
            positionWsObject.data.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
            positionWsObject.data.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
            positionWsObject.data.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
            positionWsObject.data.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsSettings) });
        }
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
      /** @type {import('../../../typings/_ws').liquidationWsObjectReturn} */
      const liquidationWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
          liquidationWsObject.events = new Events.EventEmitter();
          // Instrument websocket
          const topicInstrument = `instrument_info.100ms.${params.symbol}`;
          const webSocketInstrument = WebSocket('bybit:liquidation:instrument');
          // Position websocket
          const topicPosition = 'position';
          const webSocketPosition = WebSocket('bybit:liquidation:position');
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
            if (messageParse.topic !== topicInstrument) { return };
            if (!messageParse.data || !messageParse.data.update) { return };
            const instrumentEvent = messageParse.data.update[0];
            if (!instrumentEvent) { return };
            liquidationWsObject.data.markPx = +instrumentEvent.mark_price_e4 ? +instrumentEvent.mark_price_e4 / 10000 : liquidationWsObject.data.markPx;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.topic !== topicPosition) { return };
            const positionEvent = messageParse.data.find(v => v.symbol === params.symbol);
            if (!positionEvent) { return };
            liquidationWsObject.data.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
            liquidationWsObject.data.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
            liquidationWsObject.data.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
            liquidationWsObject.data.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
            liquidationWsObject.data.liqPxS = positionEvent.side === 'Sell' ? +positionEvent.liq_price : 0;
            liquidationWsObject.data.liqPxB = positionEvent.side === 'Buy' ? +positionEvent.liq_price : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, wsSettings));
        }
      };
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
      /** @type {import('../../../typings/_ws').orderBookWsObjectReturn} */
      const orderBookWsObject = {
        data: null,
        events: null,
        connect: async () => {
          const webSocket = WebSocket('bybit:order-book:order-book');
          orderBookWsObject.data = OrderBook();
          if (params && params.type === 'server') {
            orderBookWsObject.data._createServer(params);
          }
          if (params && params.type === 'client') {
            orderBookWsObject.data._connectClient(webSocket, params); return;
          }
          // Connect websocket
          const topic = `orderBook_200.100ms.${params.symbol}`;
          await connectWebSocket(topic, webSocket, wsSettings);
          // Order book functionality
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (messageParse.topic !== topic) { return };
            if (messageParse.type === 'snapshot') {
              synchronizeOrderBookSnapshot(messageParse.data, orderBookWsObject.data);
            }
            if (messageParse.type === 'delta') {
              const updateFunction = (v) => {
                const update = { id: +v.price, price: +v.price, quantity: +v.size };
                if (v.side === 'Sell') {
                  orderBookWsObject.data._updateOrderByPriceAsk(update);
                }
                if (v.side === 'Buy') {
                  orderBookWsObject.data._updateOrderByPriceBid(update);
                }
              }
              messageParse.data.insert.forEach(updateFunction);
              messageParse.data.update.forEach(updateFunction);
              messageParse.data.delete.forEach(updateFunction);
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
