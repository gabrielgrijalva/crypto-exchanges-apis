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
    orders: {
      info: null,
      events: null,
      connect: async (params) => {
        /** @type {import('../../../typings/_ws').ordersEventEmitter} */
        ws.orders.events = new Events.EventEmitter();
        // Orders websocket
        const topicOrders = 'order';
        const webSocketOrders = WebSocket('bybit-futures:orders:orders');
        // Executions websocket
        const topicExecutions = 'execution';
        const webSocketExecutions = WebSocket('bybit-futures:orders:executions');
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
            ws.orders.events.emit('creations-updates', creationOrders);
          }
          if (cancelationOrders.length) {
            ws.orders.events.emit('cancelations', cancelationOrders);
          }
        });
        webSocketExecutions.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
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
            ws.orders.events.emit('executions', executionOrders);
          }
        });
        webSocketOrders.addOnClose(() => { connectWebSocket(topicOrders, webSocketOrders, wsSettings) });
        webSocketExecutions.addOnClose(() => { connectWebSocket(topicExecutions, webSocketExecutions, wsSettings) });
      }
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
      connect: async (params) => {
        /** @type {import('../../../typings/_ws').positionEventEmitter} */
        ws.position.events = new Events.EventEmitter();
        const topic = 'position';
        const webSocket = WebSocket('bybit-futures:position:position');
        await connectWebSocket(topic, webSocket, wsSettings);
        // Load rest info
        const positionRestData = (await rest.getPosition(params)).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.topic !== topic) { return };
          const positionEvent = messageParse.data.find(v => v.symbol === params.symbol);
          if (!positionEvent) { return };
          ws.position.info.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
          ws.position.info.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
          ws.position.info.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
          ws.position.info.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnClose(() => { connectWebSocket(topic, webSocket, wsSettings) });
      }
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
      connect: async (params) => {
        /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
        ws.liquidation.events = new Events.EventEmitter();
        // Instrument websocket
        const topicInstrument = `instrument_info.100ms.${params.symbol}`;
        const webSocketInstrument = WebSocket('bybit-futures:liquidation:instrument');
        // Position websocket
        const topicPosition = 'position';
        const webSocketPosition = WebSocket('bybit-futures:liquidation:position');
        await Promise.all([
          connectWebSocket(topicInstrument, webSocketInstrument, wsSettings),
          connectWebSocket(topicPosition, webSocketPosition, wsSettings),
        ]);
        // Load rest info
        const positionRestData = (await rest.getPosition(params)).data;
        const liquidationRestData = (await rest.getLiquidation(params)).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketInstrument.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.topic !== topicInstrument) { return };
          if (!messageParse.data || !messageParse.data.update) { return };
          const instrumentEvent = messageParse.data.update[0];
          if (!instrumentEvent) { return };
          ws.liquidation.info.markPx = +instrumentEvent.mark_price_e4 ? +instrumentEvent.mark_price_e4 / 10000 : ws.liquidation.info.markPx;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.topic !== topicPosition) { return };
          const positionEvent = messageParse.data.find(v => v.symbol === params.symbol);
          if (!positionEvent) { return };
          ws.liquidation.info.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
          ws.liquidation.info.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
          ws.liquidation.info.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
          ws.liquidation.info.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
          ws.liquidation.info.liqPxS = positionEvent.side === 'Sell' ? +positionEvent.liq_price : 0;
          ws.liquidation.info.liqPxB = positionEvent.side === 'Buy' ? +positionEvent.liq_price : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketInstrument.addOnClose(() => connectWebSocket(topicInstrument, webSocketInstrument, wsSettings));
        webSocketPosition.addOnClose(() => connectWebSocket(topicPosition, webSocketPosition, wsSettings));
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
        const webSocket = WebSocket('bybit-futures:order-book:order-book');
        ws.orderBook.info = OrderBook();
        if (params && params.type === 'server') {
          ws.orderBook.info._createServer(params);
        }
        if (params && params.type === 'client') {
          ws.orderBook.info._connectClient(webSocket, params); return;
        }
        // Connect websocket
        const topic = `orderBook_200.100ms.${params.symbol}`;
        await connectWebSocket(topic, webSocket, wsSettings);
        // Order book functionality
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          if (messageParse.topic !== topic) { return };
          if (messageParse.type === 'snapshot') {
            synchronizeOrderBookSnapshot(messageParse.data, ws.orderBook.info);
          }
          if (messageParse.type === 'delta') {
            const updateFunction = (v) => {
              const update = { id: +v.price, price: +v.price, quantity: +v.size };
              if (v.side === 'Sell') {
                ws.orderBook.info._updateOrderByPriceAsk(update);
              }
              if (v.side === 'Buy') {
                ws.orderBook.info._updateOrderByPriceBid(update);
              }
            }
            messageParse.data.insert.forEach(updateFunction);
            messageParse.data.update.forEach(updateFunction);
            messageParse.data.delete.forEach(updateFunction);
          }
        });
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket(topic, webSocket, wsSettings)
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
    }
  };
  return ws;
}
module.exports = Ws;
