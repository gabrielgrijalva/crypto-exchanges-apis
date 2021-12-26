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
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.order_link_id;
  eventData.side = data.side.toLowerCase();
  eventData.price = +data.price;
  eventData.quantity = +data.exec_qty;
  eventData.timestamp = moment.utc(data.trade_time).format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.order_link_id;
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
 * @param {import('../../../typings').WsN.WebSocket} webSocket 
 * @param {import('../../../typings').WsN.wsOptions} wsOptions 
 */
function connectWebSocket(topic, webSocket, wsOptions) {
  console.log(`Connecting websocket: ${wsOptions.url}`);
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
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
          console.log('Connected websocket');
          resolve();
          clearTimeout(connectTimeout);
          webSocket.removeOnOpen(connnectOnOpenFunction);
          webSocket.removeOnMessage(connectOnMessageFunction);
        }
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction);
    webSocket.addOnMessage(connectOnMessageFunction);
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
 * @param {import('../../../typings').WsN.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://stream.bybit.com/realtime';
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
      // Orders websocket
      const topicOrders = 'order';
      const webSocketOrders = WebSocket();
      // Executions websocket
      const topicExecutions = 'execution';
      const webSocketExecutions = WebSocket();
      await Promise.all([
        connectWebSocket(topicOrders, webSocketOrders, wsOptions),
        connectWebSocket(topicExecutions, webSocketExecutions, wsOptions),
      ]);
      webSocketOrders.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.topic !== topicOrders) { return };
        const creationOrders = [];
        const cancelationOrders = [];
        for (let i = 0; messageParse.data[i]; i += 1) {
          const order = messageParse.data[i];
          if (order.symbol === ordersParams.symbol) {
            if (order.order_status === 'New' || order.order_status === 'PartiallyFilled') {
              creationOrders.push(createCreationUpdate(order));
            }
            if (order.order_status === 'Cancelled' || order.order_status === 'Rejected') {
              cancelationOrders.push(createCancelation(order));
            }
          }
        }
        if (creationOrders.length) {
          eventEmitter.emit('creations-updates', creationOrders);
        }
        if (cancelationOrders.length) {
          eventEmitter.emit('cancelations', cancelationOrders);
        }
      });
      webSocketExecutions.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.topic !== topicExecutions) { return };
        const executionOrders = [];
        for (let i = 0; messageParse.data[i]; i += 1) {
          const order = messageParse.data[i];
          if (order.symbol === ordersParams.symbol) {
            if (order.exec_type === 'Trade') {
              executionOrders.push(createExecution(order));
            }
          }
        }
        if (executionOrders.length) {
          eventEmitter.emit('executions', executionOrders);
        }
      });
      webSocketOrders.addOnError(() => console.log('Websocket connection error.'));
      webSocketOrders.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketOrders.addOnClose(() => { connectWebSocket(topicOrders, webSocketOrders, wsOptions) });
      webSocketExecutions.addOnError(() => console.log('Websocket connection error.'));
      webSocketExecutions.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketExecutions.addOnClose(() => { connectWebSocket(topicExecutions, webSocketExecutions, wsOptions) });
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
      const topic = 'position';
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
        if (messageParse.topic !== topic) { return };
        const positionEvent = messageParse.data.find(v => v.symbol === positionParams.symbol);
        if (!positionEvent) { return };
        position.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
        position.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
        position.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
        position.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
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
      const topicInstrument = `instrument_info.100ms.${liquidationParams.symbol}`;
      const webSocketInstrument = WebSocket();
      // Position websocket
      const topicPosition = 'position';
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
        if (messageParse.topic !== topicInstrument) { return };
        if (!messageParse.data || !messageParse.data.update) { return };
        const instrumentEvent = messageParse.data.update[0];
        if (!instrumentEvent) { return };
        liquidation.markPx = +instrumentEvent.mark_price_e4 ? +instrumentEvent.mark_price_e4 / 10000 : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.topic !== topicPosition) { return };
        const positionEvent = messageParse.data.find(v => v.symbol === liquidationParams.symbol);
        if (!positionEvent) { return };
        liquidation.pxS = positionEvent.side === 'Sell' ? +positionEvent.entry_price : 0;
        liquidation.pxB = positionEvent.side === 'Buy' ? +positionEvent.entry_price : 0;
        liquidation.qtyS = positionEvent.side === 'Sell' ? +positionEvent.size : 0;
        liquidation.qtyB = positionEvent.side === 'Buy' ? +positionEvent.size : 0;
        liquidation.liqPxS = positionEvent.side === 'Sell' ? +positionEvent.liq_price : 0;
        liquidation.liqPxB = positionEvent.side === 'Buy' ? +positionEvent.liq_price : 0;
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
      const topic = `orderBook_200.100ms.${orderBookParams.symbol}`;
      const webSocket = WebSocket();
      await connectWebSocket(topic, webSocket, wsOptions);
      // Order book functionality
      const orderBook = OrderBook();
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.topic !== topic) { return };
        if (messageParse.type === 'snapshot') {
          synchronizeOrderBookSnapshot(messageParse.data, orderBook);
        }
        if (messageParse.type === 'delta') {
          const updateFunction = (v) => {
            const update = { id: +v.price, price: +v.price, quantity: +v.size };
            if (v.side === 'Sell') {
              orderBook._updateOrderByPriceAsk(update);
            }
            if (v.side === 'Buy') {
              orderBook._updateOrderByPriceBid(update);
            }
          }
          messageParse.data.insert.forEach(updateFunction);
          messageParse.data.update.forEach(updateFunction);
          messageParse.data.delete.forEach(updateFunction);
        }
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(orderBook);
        connectWebSocket(topic, webSocket, wsOptions)
      });
      return { info: orderBook };
    }
  };
  return ws;
}
module.exports = Ws;
