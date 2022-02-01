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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/settings')} settings
 */
function connectWebSocket(feed, symbol, webSocket, settings) {
  console.log(`Connecting websocket: ${settings.WS.URL}`);
  return new Promise((resolve) => {
    const url = settings.WS.URL;
    const apiKey = settings.API_KEY;
    const apiSecret = settings.API_SECRET;
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
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
};
/**
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
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
 * @param {import('../../../typings/settings')} settings
 */
function Ws(settings) {
  // Default ws settings values
  settings.REST = settings.REST || {};
  settings.WS.URL = settings.WS.URL || 'wss://api.futures.kraken.com/ws/v1';
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
        // Open orders websocket
        const feedOpenOrders = 'open_orders';
        const webSocketOpenOrders = WebSocket();
        // Executions websocket
        const feedFills = 'fills';
        const webSocketFills = WebSocket();
        await Promise.all([
          connectWebSocket(feedOpenOrders, null, webSocketOpenOrders, settings),
          connectWebSocket(feedFills, null, webSocketFills, settings),
        ]);
        webSocketOpenOrders.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.feed !== 'open_orders') { return };
          if (messageParse.reason === 'edited_by_user'
            || messageParse.reason === 'new_placed_order_by_user') {
            if (messageParse.order.instrument === settings.SYMBOL) {
              ws.orders.events.emit('creations-updates', [createCreationUpdate(messageParse.order)]);
            }
          }
          if (messageParse.reason === 'cancelled_by_user'
            || messageParse.reason === 'market_inactive'
            || messageParse.reason === 'post_order_failed_because_it_would_filled'
            || messageParse.reason === 'ioc_order_failed_because_it_would_not_be_executed') {
            const ordSymbol = messageParse.cli_ord_id.split('-')[0];
            if (ordSymbol === settings.SYMBOL) {
              ws.orders.events.emit('cancelations', [createCancelation(messageParse)]);
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
            if (fill.instrument === settings.SYMBOL) {
              executionOrders.push(createExecution(fill));
            }
          }
          if (executionOrders.length) {
            ws.orders.events.emit('executions', executionOrders);
          }
        });
        webSocketOpenOrders.addOnError(() => console.log('Websocket connection error.'));
        webSocketOpenOrders.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketOpenOrders.addOnClose(() => { connectWebSocket(feedOpenOrders, null, webSocketOpenOrders, settings) });
        webSocketFills.addOnError(() => console.log('Websocket connection error.'));
        webSocketFills.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketFills.addOnClose(() => { connectWebSocket(feedFills, null, webSocketFills, settings) });
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
      connect: async () => {
        /** @type {import('../../../typings/_ws').positionEventEmitter} */
        ws.position.events = new Events.EventEmitter();
        const feed = 'open_positions';
        const webSocket = WebSocket();
        await connectWebSocket(feed, null, webSocket, settings);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.feed !== 'open_positions' || !messageParse.positions) { return };
          const positionEvent = messageParse.positions.find(v => v.instrument === settings.SYMBOL);
          if (positionEvent) {
            ws.position.info.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
            ws.position.info.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
            ws.position.info.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
            ws.position.info.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
          } else {
            ws.position.info.pxS = 0;
            ws.position.info.pxB = 0;
            ws.position.info.qtyB = 0;
            ws.position.info.qtyS = 0;
          }
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => { connectWebSocket(feed, null, webSocket, settings) });
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
      connect: async () => {
        /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
        ws.liquidation.events = new Events.EventEmitter();
        // Ticker websocket
        const feedTicker = 'ticker';
        const symbolTicker = settings.SYMBOL;
        const webSocketTicker = WebSocket();
        // Position websocket
        const feedPosition = 'open_positions';
        const webSocketPosition = WebSocket();
        await Promise.all([
          connectWebSocket(feedTicker, symbolTicker, webSocketTicker, settings),
          connectWebSocket(feedPosition, null, webSocketPosition, settings),
        ]);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        const liquidationRestData = (await rest.getLiquidation()).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketTicker.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.product_id !== settings.SYMBOL) { return };
          ws.liquidation.info.markPx = +messageParse.markPrice ? +messageParse.markPrice : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParsed = JSON.parse(message);
          console.log(messageParsed);
          if (messageParsed.feed !== 'open_positions' || !messageParsed.positions) { return };
          const positionEvent = messageParsed.positions.find(v => v.instrument === settings.SYMBOL);
          if (positionEvent) {
            ws.liquidation.info.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
            ws.liquidation.info.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
            ws.liquidation.info.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
            ws.liquidation.info.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
            ws.liquidation.info.liqPxS = positionEvent.balance < 0 ? positionEvent.liquidation_threshold : 0;
            ws.liquidation.info.liqPxB = positionEvent.balance > 0 ? positionEvent.liquidation_threshold : 0;
          } else {
            ws.liquidation.info.pxS = 0;
            ws.liquidation.info.pxB = 0;
            ws.liquidation.info.qtyB = 0;
            ws.liquidation.info.qtyS = 0;
            ws.liquidation.info.liqPxS = 0;
            ws.liquidation.info.liqPxB = 0;
          }
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketTicker.addOnError(() => console.log('Websocket connection error.'));
        webSocketTicker.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketTicker.addOnClose(() => connectWebSocket(feedTicker, symbolTicker, webSocketTicker, settings));
        webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
        webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketPosition.addOnClose(() => connectWebSocket(feedPosition, null, webSocketPosition, settings));
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
        ws.orderBook.info = OrderBook();
        if (params && params.type === 'server') {
          ws.orderBook.info._createServer(params);
        }
        if (params && params.type === 'client') {
          ws.orderBook.info._connectClient(params); return;
        }
        // Connect websocket
        const feed = 'book';
        const symbol = settings.SYMBOL;
        const webSocket = WebSocket();
        await connectWebSocket(feed, symbol, webSocket, settings);
        // Order book functionality
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          if (messageParse.feed === 'book_snapshot') {
            return synchronizeOrderBookSnapshot(messageParse, ws.orderBook.info);
          }
          const timestamp = Date.now();
          const orderBookTimestamp = +messageParse.timestamp;
          if (timestamp - orderBookTimestamp > 5000) {
            return webSocket.disconnect();
          }
          if (messageParse.feed === 'book') {
            const update = { id: +messageParse.price, price: +messageParse.price, quantity: +messageParse.qty };
            if (messageParse.side === 'sell') {
              ws.orderBook.info._updateOrderByPriceAsk(update);
            }
            if (messageParse.side === 'buy') {
              ws.orderBook.info._updateOrderByPriceBid(update);
            }
          }
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket(feed, symbol, webSocket, settings);
        });
      }
    },
  };
  return ws;
}
module.exports = Ws;
