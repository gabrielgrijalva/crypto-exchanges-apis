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
  eventData.id = data.cli_ord_id;
  eventData.side = !data.direction ? 'buy' : 'sell';
  eventData.price = +data.limit_price;
  eventData.quantity = +data.qty + +data.filled;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.cli_ord_id;
  eventData.side = data.buy ? 'buy' : 'sell';
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.cli_ord_id;
  return eventData;
};
/**
 * @param {string} feed 
 * @param {string} symbol 
 */
function getRequestParams(feed, symbol) {
  return !symbol ? { feed: feed, event: 'subscribe', }
    : { feed: feed, event: 'subscribe', product_ids: [symbol] };
};
/** 
 * @param {string} challenge
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSingatureParams(challenge, apiKey, apiSecret) {
  const hash = crypto.createHash('sha256').update(challenge).digest();
  const decoded = Buffer.from(apiSecret, 'base64');
  const signed = crypto.createHmac('sha512', decoded).update(hash).digest('base64');
  return { api_key: apiKey, original_challenge: challenge, signed_challenge: signed };
};
/**
 * 
 * @param {string} feed
 * @param {string} symbol
 * @param {import('../../../typings').WsN.WebSocket} webSocket 
 * @param {import('../../../typings').WsN.wsOptions} wsOptions 
 */
function connectWebSocket(feed, symbol, webSocket, wsOptions) {
  console.log(`Connecting websocket: ${wsOptions.url}`);
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const apiKey = wsOptions.apiKey;
    const apiSecret = wsOptions.apiSecret;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(url);
    function connectOnOpenFunction() {
      if (apiKey && apiSecret) {
        webSocket.send(JSON.stringify({ event: 'challenge', api_key: apiKey }));
      } else {
        webSocket.send(JSON.stringify(getRequestParams(feed, symbol)));
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message);
      if (messageParse.event === 'challenge' && messageParse.message) {
        const requestParams = getRequestParams(feed, symbol);
        const signatureParams = getSingatureParams(messageParse.message, apiKey, apiSecret);
        webSocket.send(JSON.stringify(Object.assign({}, requestParams, signatureParams)));
      }
      if (messageParse.event === 'subscribed' && messageParse.feed === feed) {
        console.log('Connected websocket');
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connectOnOpenFunction);
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
 * @param {Object} snapshot 
 * @param {import('../../../typings').WsN.dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  orderBook._insertSnapshotAsks(snapshot.asks.map(v => {
    return { id: +v.price, price: +v.price, quantity: +v.qty };
  }));
  orderBook._insertSnapshotBids(snapshot.bids.map(v => {
    return { id: +v.price, price: +v.price, quantity: +v.qty };
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
 * @param {import('../../../typings').WsN.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://api.futures.kraken.com/ws/v1';
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
      // Open orders websocket
      const feedOpenOrders = 'open_orders';
      const webSocketOpenOrders = WebSocket();
      // Executions websocket
      const feedFills = 'fills';
      const webSocketFills = WebSocket();
      await Promise.all([
        connectWebSocket(feedOpenOrders, null, webSocketOpenOrders, wsOptions),
        connectWebSocket(feedFills, null, webSocketFills, wsOptions),
      ]);
      webSocketOpenOrders.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.feed !== 'open_orders') { return };
        if (messageParse.reason === 'edited_by_user'
          || messageParse.reason === 'new_placed_order_by_user') {
          if (messageParse.order.instrument === ordersParams.symbol) {
            eventEmitter.emit('creations-updates', [createCreationUpdate(messageParse.order)]);
          }
        }
        if (messageParse.reason === 'cancelled_by_user'
          || messageParse.reason === 'market_inactive'
          || messageParse.reason === 'post_order_failed_because_it_would_filled'
          || messageParse.reason === 'ioc_order_failed_because_it_would_not_be_executed') {
          const ordSymbol = messageParse.cli_ord_id.split('-')[0];
          if (ordSymbol === ordersParams.symbol) {
            eventEmitter.emit('cancelations', [createCancelation(messageParse)]);
          }
        }
      });
      webSocketFills.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.feed !== 'fills' || !messageParse.fills) { return };
        const executionOrders = [];
        for (let i = 0; messageParse.fills[i]; i += 1) {
          const fill = messageParse.fills[i];
          if (fill.instrument === ordersParams.symbol) {
            executionOrders.push(createExecution(fill));
          }
        }
        if (executionOrders.length) {
          eventEmitter.emit('executions', executionOrders);
        }
      });
      webSocketOpenOrders.addOnError(() => console.log('Websocket connection error.'));
      webSocketOpenOrders.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketOpenOrders.addOnClose(() => { connectWebSocket(feedOpenOrders, null, webSocketOpenOrders, wsOptions) });
      webSocketFills.addOnError(() => console.log('Websocket connection error.'));
      webSocketFills.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketFills.addOnClose(() => { connectWebSocket(feedFills, null, webSocketFills, wsOptions) });
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
      const feed = 'open_positions';
      const webSocket = WebSocket();
      await connectWebSocket(feed, null, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {import('../../../typings').WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.feed !== 'open_positions' || !messageParse.positions) { return };
        const positionEvent = messageParse.positions.find(v => v.instrument === positionParams.symbol);
        if (positionEvent) {
          position.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
          position.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
          position.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
          position.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
        } else {
          position.pxS = 0;
          position.pxB = 0;
          position.qtyB = 0;
          position.qtyS = 0;
        }
        eventEmitter.emit('update', position);
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
      webSocket.addOnClose(() => { connectWebSocket(feed, null, webSocket, wsOptions) });
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
      // Ticker websocket
      const feedTicker = 'ticker';
      const symbolTicker = liquidationParams.symbol;
      const webSocketTicker = WebSocket();
      // Position websocket
      const feedPosition = 'open_positions';
      const webSocketPosition = WebSocket();
      await Promise.all([
        connectWebSocket(feedTicker, symbolTicker, webSocketTicker, wsOptions),
        connectWebSocket(feedPosition, null, webSocketPosition, wsOptions),
      ]);
      // Load rest info
      const positionRestParams = { symbol: liquidationParams.symbol };
      const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {import('../../../typings').WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketTicker.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        console.log(messageParse);
        if (messageParse.product_id !== liquidationParams.symbol) { return };
        liquidation.markPx = +messageParse.markPrice ? +messageParse.markPrice : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParsed = JSON.parse(message);
        console.log(messageParsed);
        if (messageParsed.feed !== 'open_positions' || !messageParsed.positions) { return };
        const positionEvent = messageParsed.positions.find(v => v.instrument === liquidationParams.symbol);
        if (positionEvent) {
          liquidation.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
          liquidation.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
          liquidation.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
          liquidation.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
          liquidation.liqPxS = positionEvent.balance < 0 ? positionEvent.liquidation_threshold : 0;
          liquidation.liqPxB = positionEvent.balance > 0 ? positionEvent.liquidation_threshold : 0;
        } else {
          liquidation.pxS = 0;
          liquidation.pxB = 0;
          liquidation.qtyB = 0;
          liquidation.qtyS = 0;
          liquidation.liqPxS = 0;
          liquidation.liqPxB = 0;
        }
        eventEmitter.emit('update', liquidation);
      });
      webSocketTicker.addOnError(() => console.log('Websocket connection error.'));
      webSocketTicker.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketTicker.addOnClose(() => connectWebSocket(feedTicker, symbolTicker, webSocketTicker, wsOptions));
      webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
      webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
      webSocketPosition.addOnClose(() => connectWebSocket(feedPosition, null, webSocketPosition, wsOptions));
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
      const feed = 'book';
      const symbol = orderBookParams.symbol;
      const webSocket = WebSocket();
      await connectWebSocket(feed, symbol, webSocket, wsOptions);
      // Order book functionality
      const orderBook = OrderBook();
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.feed === 'book_snapshot') {
          return synchronizeOrderBookSnapshot(messageParse, orderBook);
        }
        const timestamp = Date.now();
        const orderBookTimestamp = +messageParse.timestamp;
        if (timestamp - orderBookTimestamp > 5000) {
          return webSocket.disconnect();
        }
        if (messageParse.feed === 'book') {
          const update = { id: +messageParse.price, price: +messageParse.price, quantity: +messageParse.qty };
          if (messageParse.side === 'sell') {
            orderBook._updateOrderByPriceAsk(update);
          }
          if (messageParse.side === 'buy') {
            orderBook._updateOrderByPriceBid(update);
          }
        }
      });
      webSocket.addOnError(() => console.log('Websocket connection error.'));
      webSocket.addOnClose(() => console.log('Websocket connection closed.'));
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(orderBook);
        connectWebSocket(feed, symbol, webSocket, wsOptions)
      });
      return { info: orderBook };
    },
  };
  return ws;
}
module.exports = Ws;
