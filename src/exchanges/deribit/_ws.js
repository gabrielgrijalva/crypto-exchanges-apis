const uuid = require('uuid').v4;
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
  console.log(`Connecting websocket: ${wsOptions.url}`);
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
        console.log('Connected websocket');
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
 * @param {WsN.dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/**
 * 
 * @param {Object} snapshot 
 * @param {WsN.dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  orderBook._insertSnapshotAsks(snapshot.asks.map(v => {
    return { id: +v[1], price: +v[1], quantity: +v[2] };
  }));
  orderBook._insertSnapshotBids(snapshot.bids.map(v => {
    return { id: +v[1], price: +v[1], quantity: +v[2] };
  }));
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
        console.log(messageParse);
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
        console.log(messageParse);
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
      webSocketOpenOrders.addOnError(() => console.log('Websocket connection error.'));
      webSocketOpenOrders.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketOpenOrders.addOnClose(() => { connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, wsOptions) });
      webSocketExecutions.addOnError(() => console.log('Websocket connection error.'));
      webSocketExecutions.addOnClose(() => console.log('Websocket connection closed.'));
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
        console.log(messageParse);
        if (!messageParse.params || messageParse.params.channel !== channel) { return };
        const positionEvent = messageParse.params.data.positions[0];
        if (!positionEvent) { return };
        position.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
        position.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
        position.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
        position.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
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
        console.log(messageParse);
        if (!messageParse.params || messageParse.params.channel !== channelInstrument) { return };
        const instrumentEvent = messageParse.params.data;
        if (!instrumentEvent) { return };
        liquidation.markPx = +instrumentEvent.mark_price ? +instrumentEvent.mark_price : liquidation.markPx;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
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
        console.log(messageParse);
        if (!messageParse.params || messageParse.params.channel !== channelPortfolio.toLowerCase()) { return };
        const portfolioEvent = messageParse.params.data;
        if (!portfolioEvent) { return };
        liquidation.liqPxS = liquidation.qtyS ? +portfolioEvent.estimated_liquidation_ratio * liquidation.markPx : 0;
        liquidation.liqPxB = liquidation.qtyB ? +portfolioEvent.estimated_liquidation_ratio * liquidation.markPx : 0;
      });
      webSocketInstrument.addOnError(() => console.log('Websocket connection error.'));
      webSocketInstrument.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketInstrument.addOnClose(() => connectWebSocket(channelInstrument, 'public', webSocketInstrument, wsOptions));
      webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
      webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketPosition.addOnClose(() => connectWebSocket(channelPosition, 'private', webSocketPosition, wsOptions));
      webSocketPortfolio.addOnError(() => console.log('Websocket connection error.'));
      webSocketPortfolio.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketPortfolio.addOnClose(() => connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, wsOptions));
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
      const channel = `book.${orderBookParams.symbol}.100ms`;
      const webSocket = WebSocket();
      await connectWebSocket(channel, 'public', webSocket, wsOptions);
      // Order book functionality
      let prevChangeId = null;
      const orderBook = OrderBook();
      webSocket.addOnMessage(message => {
        const messageParse = JSON.parse(message);
        if (!messageParse.params || !messageParse.params.data) { return };
        if (messageParse.params.data.type === 'snapshot') {
          return synchronizeOrderBookSnapshot(messageParse.params.data, orderBook);
        }
        if (prevChangeId && prevChangeId !== messageParse.params.data.prev_change_id) {
          return webSocket.disconnect();
        }
        prevChangeId = messageParse.params.data.change_id;
        const timestamp = Date.now();
        const orderBookTimestamp = +messageParse.params.data.timestamp;
        if (timestamp - orderBookTimestamp > 5000) {
          return webSocket.disconnect();
        }
        messageParse.params.data.asks.forEach(v => {
          const update = { id: +v[1], price: +v[1], quantity: +v[2] };
          orderBook._updateOrderByPriceAsk(update);
        });
        messageParse.params.data.bids.forEach(v => {
          const update = { id: +v[1], price: +v[1], quantity: +v[2] };
          orderBook._updateOrderByPriceBid(update);
        });
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(orderBook);
        connectWebSocket(channel, 'public', webSocket, wsOptions)
      });
      return { info: orderBook, };
    },
  };
  return ws;
}
module.exports = Ws;
