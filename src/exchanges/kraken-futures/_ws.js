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
  eventData.id = data.cli_ord_id;
  eventData.side = !data.direction ? 'buy' : 'sell';
  eventData.price = +data.limit_price;
  eventData.quantity = +data.qty + +data.filled;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.cli_ord_id;
  eventData.side = data.buy ? 'buy' : 'sell';
  eventData.price = +data.price;
  eventData.quantity = +data.qty;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.cli_ord_id;
  eventData.timestamp = moment(data.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
 * @param {'public' | 'private'} type
 * @param {string} feed
 * @param {string} symbol
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(type, feed, symbol, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = type === 'private' ? wsSettings.URL : wsSettings.URL.replace('api.', '');
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
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
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connectOnOpenFunction, false);
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
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function Ws(wsSettings = {}) {
  // Default ws wsSettings values
  wsSettings.URL = wsSettings.URL || 'wss://api.futures.kraken.com/ws/v1';
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
      const webSocketOpenOrders = WebSocket('kraken-futures:orders:orders', wsSettings);
      const webSocketFills = WebSocket('kraken-futures:orders:executions', wsSettings);
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          const feedOpenOrders = 'open_orders';
          const feedFills = 'fills';
          await Promise.all([
            connectWebSocket('private', feedOpenOrders, null, webSocketOpenOrders, wsSettings),
            connectWebSocket('private', feedFills, null, webSocketFills, wsSettings),
          ]);
          webSocketOpenOrders.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.feed !== 'open_orders') { return };
            if (messageParse.reason === 'edited_by_user'
              || messageParse.reason === 'new_placed_order_by_user') {
              if (messageParse.order.instrument === params.symbol) {
                ordersWsObject.events.emit('creations-updates', [createCreationUpdate(messageParse.order)]);
              }
            }
            if (messageParse.reason === 'cancelled_by_user'
              || messageParse.reason === 'market_inactive'
              || messageParse.reason === 'post_order_failed_because_it_would_filled'
              || messageParse.reason === 'ioc_order_failed_because_it_would_not_be_executed') {
              const ordSymbol = messageParse.cli_ord_id.split('-')[0];
              if (ordSymbol === params.symbol) {
                ordersWsObject.events.emit('cancelations', [createCancelation(messageParse)]);
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
              if (fill.instrument === params.symbol) {
                executionOrders.push(createExecution(fill));
              }
            }
            if (executionOrders.length) {
              ordersWsObject.events.emit('executions', executionOrders);
            }
          });
          webSocketOpenOrders.addOnClose(() => { connectWebSocket('private', feedOpenOrders, null, webSocketOpenOrders, wsSettings) });
          webSocketFills.addOnClose(() => { connectWebSocket('private', feedFills, null, webSocketFills, wsSettings) });
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
      const webSocket = WebSocket('kraken-futures:position:position', wsSettings);
      /** @type {import('../../../typings/_ws').positionWsObjectReturn} */
      const positionWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          /** @type {import('../../../typings/_ws').positionEventEmitter} */
          positionWsObject.events = new Events.EventEmitter();
          const feed = 'open_positions';
          await connectWebSocket('private', feed, null, webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.feed !== 'open_positions' || !messageParse.positions) { return };
            const positionEvent = messageParse.positions.find(v => v.instrument === params.symbol);
            if (positionEvent) {
              positionWsObject.data.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
              positionWsObject.data.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
              positionWsObject.data.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
              positionWsObject.data.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
            } else {
              positionWsObject.data.pxS = 0;
              positionWsObject.data.pxB = 0;
              positionWsObject.data.qtyB = 0;
              positionWsObject.data.qtyS = 0;
            }
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => { connectWebSocket('private', feed, null, webSocket, wsSettings) });
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
      const webSocketTicker = WebSocket('kraken-futures:liquidation:instrument', wsSettings);
      const webSocketPosition = WebSocket('kraken-futures:liquidation:position', wsSettings);
      /** @type {import('../../../typings/_ws').liquidationWsObjectReturn} */
      const liquidationWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
          liquidationWsObject.events = new Events.EventEmitter();
          const feedTicker = 'ticker';
          const symbolTicker = params.symbol;
          const feedPosition = 'open_positions';
          await Promise.all([
            connectWebSocket('public', feedTicker, symbolTicker, webSocketTicker, wsSettings),
            connectWebSocket('private', feedPosition, null, webSocketPosition, wsSettings),
          ]);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          const liquidationRestData = (await rest.getLiquidation(params)).data;
          // Liquidation data
          /** @type {import('../../../typings/_ws').dataLiquidation} */
          liquidationWsObject.data = Object.assign({}, positionRestData, liquidationRestData);
          webSocketTicker.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.product_id !== params.symbol) { return };
            liquidationWsObject.data.markPx = +messageParse.markPrice ? +messageParse.markPrice : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParsed = JSON.parse(message);
            console.log(messageParsed);
            if (messageParsed.feed !== 'open_positions' || !messageParsed.positions) { return };
            const positionEvent = messageParsed.positions.find(v => v.instrument === params.symbol);
            if (positionEvent) {
              liquidationWsObject.data.pxS = positionEvent.balance < 0 ? positionEvent.entry_price : 0;
              liquidationWsObject.data.qtyS = positionEvent.balance < 0 ? Math.abs(positionEvent.balance) : 0;
              liquidationWsObject.data.pxB = positionEvent.balance > 0 ? positionEvent.entry_price : 0;
              liquidationWsObject.data.qtyB = positionEvent.balance > 0 ? Math.abs(positionEvent.balance) : 0;
              liquidationWsObject.data.liqPxS = positionEvent.balance < 0 ? positionEvent.liquidation_threshold : 0;
              liquidationWsObject.data.liqPxB = positionEvent.balance > 0 ? positionEvent.liquidation_threshold : 0;
            } else {
              liquidationWsObject.data.pxS = 0;
              liquidationWsObject.data.pxB = 0;
              liquidationWsObject.data.qtyB = 0;
              liquidationWsObject.data.qtyS = 0;
              liquidationWsObject.data.liqPxS = 0;
              liquidationWsObject.data.liqPxB = 0;
            }
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketTicker.addOnClose(() => connectWebSocket('public', feedTicker, symbolTicker, webSocketTicker, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket('private', feedPosition, null, webSocketPosition, wsSettings));
        }
      };
      return liquidationWsObject;
    },
    /**
     * 
     * 
     * 
     * WS TRADES
     * 
     * 
     * 
     */
    getTrades: (params) => {
      const webSocket = WebSocket('kraken-futures:trades:trades', wsSettings);
      /** @type {import('../../../typings/_ws').tradesWsObjectReturn} */
      const tradesWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          const feed = 'trade';
          const symbol = params.symbol;
          await connectWebSocket('public', feed, symbol, webSocket, wsSettings);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (messageParse.feed !== 'trade' || messageParse.product_id !== symbol) { return };
            tradesWsObject.events.emit('update', [{
              side: messageParse.side,
              price: +messageParse.price,
              quantity: +messageParse.qty,
              timestamp: moment(+messageParse.time).utc().format('YYYY-MM-DD HH:mm:ss.SSS'),
            }]);
          });
        },
      }
      return tradesWsObject;
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
      const webSocket = WebSocket('kraken-futures:order-book:order-book', wsSettings);
      const orderBook = OrderBook({
        FROZEN_CHECK_INTERVAL: params.frozenCheckInterval,
        PRICE_OVERLAPS_CHECK_INTERVAL: params.priceOverlapsCheckInterval,
      });
      /** @type {import('../../../typings/_ws').orderBookWsObjectReturn} */
      const orderBookWsObject = {
        data: null,
        events: null,
        connect: async () => {
          orderBookWsObject.data = orderBook;
          if (params && params.type === 'server') {
            orderBookWsObject.data._createServer(params);
          }
          if (params && params.type === 'client') {
            orderBookWsObject.data._connectClient(webSocket, params); return;
          }
          // Connect websocket
          const feed = 'book';
          const symbol = params.symbol;
          await connectWebSocket('public', feed, symbol, webSocket, wsSettings);
          // Order book functionality
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (messageParse.feed === 'book_snapshot') {
              return synchronizeOrderBookSnapshot(messageParse, orderBookWsObject.data);
            }
            const timestamp = Date.now();
            const orderBookTimestamp = +messageParse.timestamp;
            if (timestamp - orderBookTimestamp > 5000) {
              return webSocket.close();
            }
            if (messageParse.feed === 'book') {
              const update = { id: +messageParse.price, price: +messageParse.price, quantity: +messageParse.qty };
              if (messageParse.side === 'sell') {
                orderBookWsObject.data._updateOrderByPriceAsk(update);
              }
              if (messageParse.side === 'buy') {
                orderBookWsObject.data._updateOrderByPriceBid(update);
              }
            }
          });
          webSocket.addOnClose(() => {
            desynchronizeOrderBook(orderBookWsObject.data);
            connectWebSocket('public', feed, symbol, webSocket, wsSettings);
          });
          await (new Promise(resolve => {
            let counter = 0;
            const interval = setInterval(() => {
              counter += 1;
              if (counter >= 10 || orderBookWsObject.data.asks.length || orderBookWsObject.data.bids.length) {
                resolve(); clearInterval(interval);
              }
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
