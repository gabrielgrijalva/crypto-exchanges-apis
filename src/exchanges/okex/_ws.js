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
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.px;
  eventData.quantity = +data.sz;
  eventData.timestamp = moment(+data.uTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.clOrdId;
  eventData.side = data.side;
  eventData.price = +data.fillPx;
  eventData.quantity = +data.fillSz;
  eventData.timestamp = moment(+data.fillTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.clOrdId;
  eventData.timestamp = moment(+data.uTime).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/** 
 * @param {string} apiKey
 * @param {string} apiSecret
 */
function getSignedRequest(apiKey, apiSecret, apiPassphrase) {
  if (!apiKey || !apiSecret || !apiPassphrase) { return };
  const path = '/users/self/verify';
  const method = 'GET';
  const timestamp = Date.now() / 1000;
  const digest = `${timestamp}${method}${path}`;
  const sign = crypto.createHmac('sha256', apiSecret).update(digest).digest('base64');
  const passphrase = apiPassphrase;
  return { op: 'login', args: [{ apiKey, passphrase, timestamp, sign }] };
};
/**
 * 
 * @param {string} type
 * @param {string} symbol
 * @param {string} channel
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(type, symbol, channel, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
    const apiPassphrase = wsSettings.API_PASSPHRASE;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/${type}`);
    function connnectOnOpenFunction() {
      if (type === 'private') {
        const signedRequest = getSignedRequest(apiKey, apiSecret, apiPassphrase);
        webSocket.send(JSON.stringify(signedRequest));
      } else {
        const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
        const request = { op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }], };
        webSocket.send(JSON.stringify(request));
      }
    };
    function connectOnMessageFunction(message) {
      const messageParse = JSON.parse(message.toString());
      if (messageParse.event === 'login' && messageParse.code === '0') {
        const instType = symbol.includes('SWAP') ? 'SWAP' : 'FUTURES';
        const request = { op: 'subscribe', args: [{ channel: channel, instType: instType, instId: symbol, }], };
        webSocket.send(JSON.stringify(request));
      }
      if (messageParse.event === 'subscribe' && messageParse.arg.channel === channel) {
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connnectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      }
    };
    webSocket.addOnOpen(connnectOnOpenFunction, false);
    webSocket.addOnMessage(connectOnMessageFunction, false);
  });
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order
 */
function removeOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) { return };
  openOrders.splice(index, 1);
};
/**
 * 
 * @param {Object[]} openOrders 
 * @param {Object} order 
 */
function addUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) {
    openOrders.push(order);
  } else {
    openOrders[index] = order;
  }
};
function getFillAndUpdateOpenOrders(openOrders, order) {
  const index = openOrders.findIndex(v => v.ordId === order.ordId);
  if (index === -1) { throw 'Could not get past order event.' };
  const openOrder = openOrders[index];
  const fill = order.accFillSz !== openOrder.accFillSz;
  const update = order.px !== openOrder.px || order.sz !== openOrder.sz;
  openOrders[index] = order;
  return { fill, update };
};
/**
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
  orderBook._insertSnapshotAsks(snapshot.data[0].asks.map(v => {
    return { id: +v[0], price: +v[0], quantity: +v[1] };
  }));
  orderBook._insertSnapshotBids(snapshot.data[0].bids.map(v => {
    return { id: +v[0], price: +v[0], quantity: +v[1] };
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
  wsSettings.URL = wsSettings.URL || 'wss://ws.okex.com:8443/ws/v5';
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
    getOrders: () => {
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: null,
        connect: async (params) => {
          /** @type {import('../../../typings/_ws').ordersEventEmitter} */
          ordersWsObject.events = new Events.EventEmitter();
          const openOrders = [];
          // Orders websocket
          const symbol = params.symbol;
          const channel = 'orders';
          const webSocket = WebSocket('okex:orders:orders', wsSettings);
          await connectWebSocket('private', symbol, channel, webSocket, wsSettings);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message.toString());
            console.log(messageParse);
            if (messageParse.event === 'subscribe' || !messageParse.arg || messageParse.arg.channel !== channel) { return };
            const creationOrders = [];
            const executionOrders = [];
            const cancelationOrders = [];
            for (let i = 0; messageParse.data[i]; i += 1) {
              const order = messageParse.data[i];
              if (order.instId === params.symbol) {
                if (order.state === 'live') {
                  if (order.amendResult === '-1') {
                    removeOpenOrders(openOrders, order);
                    cancelationOrders.push(createCancelation(order));
                  } else {
                    addUpdateOpenOrders(openOrders, order);
                    creationOrders.push(createCreationUpdate(order));
                  }
                }
                if (order.state === 'partially_filled' || order.state === 'filled') {
                  if (order.amendResult === '-1') {
                    removeOpenOrders(openOrders, order);
                    cancelationOrders.push(createCancelation(order));
                  } else {
                    const fillAndUpdate = getFillAndUpdateOpenOrders(openOrders, order);
                    if (fillAndUpdate.update) {
                      creationOrders.push(createCreationUpdate(order));
                    }
                    if (fillAndUpdate.fill) {
                      executionOrders.push(createExecution(order));
                    }
                  }
                }
                if (order.state === 'canceled') {
                  removeOpenOrders(openOrders, order);
                  cancelationOrders.push(createCancelation(order));
                }
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
          webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsSettings));
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
    getPosition: () => {
      /** @type {import('../../../typings/_ws').positionWsObjectReturn} */
      const positionWsObject = {
        data: null,
        events: null,
        connect: async (params) => {
          /** @type {import('../../../typings/_ws').positionEventEmitter} */
          positionWsObject.events = new Events.EventEmitter();
          const symbol = params.symbol;
          const channel = 'positions';
          const webSocket = WebSocket('okex:position:position', wsSettings);
          await connectWebSocket('private', symbol, channel, webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message.toString());
            console.log(messageParse);
            if (messageParse.event === 'subscribe' || !messageParse.arg || messageParse.arg.channel !== channel) { return };
            const positionEvent = messageParse.data.find(v => v.instId === symbol);
            if (!positionEvent) { return };
            positionWsObject.data.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
            positionWsObject.data.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
            positionWsObject.data.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
            positionWsObject.data.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => connectWebSocket('private', symbol, channel, webSocket, wsSettings));
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
    getLiquidation: () => {
      /** @type {import('../../../typings/_ws').liquidationWsObjectReturn} */
      const liquidationWsObject = {
        data: null,
        events: null,
        connect: async (params) => {
          /** @type {import('../../../typings/_ws').liquidationEventEmitter} */
          liquidationWsObject.events = new Events.EventEmitter();
          const symbol = params.symbol;
          // Instrument websocket
          const channelMark = 'mark-price';
          const webSocketMark = WebSocket('okex:liquidation:mark-price', wsSettings);
          // Position websocket
          const channelPosition = 'positions';
          const webSocketPosition = WebSocket('okex:liquidation:position', wsSettings);
          await Promise.all([
            connectWebSocket('public', symbol, channelMark, webSocketMark, wsSettings),
            connectWebSocket('private', symbol, channelPosition, webSocketPosition, wsSettings),
          ]);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          const liquidationRestData = (await rest.getLiquidation(params)).data;
          // Liquidation data
          /** @type {import('../../../typings/_ws').dataLiquidation} */
          liquidationWsObject.data = Object.assign({}, positionRestData, liquidationRestData);
          webSocketMark.addOnMessage((message) => {
            const messageParse = JSON.parse(message.toString());
            console.log(messageParse);
            if (messageParse.event === 'subscribe' || !messageParse.arg || messageParse.arg.channel !== channelMark) { return };
            const instrumentEvent = messageParse.data.find(v => v.instId === symbol);
            if (!instrumentEvent) { return };
            liquidationWsObject.data.markPx = +instrumentEvent.markPx;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParse = JSON.parse(message.toString());
            console.log(messageParse);
            if (messageParse.event === 'subscribe' || !messageParse.arg || messageParse.arg.channel !== channelPosition) { return };
            const positionEvent = messageParse.data.find(v => v.instId === symbol);
            if (!positionEvent) { return };
            liquidationWsObject.data.pxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.avgPx : 0;
            liquidationWsObject.data.pxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.avgPx : 0;
            liquidationWsObject.data.qtyS = positionEvent && +positionEvent.pos < 0 ? Math.abs(+positionEvent.pos) : 0;
            liquidationWsObject.data.qtyB = positionEvent && +positionEvent.pos > 0 ? Math.abs(+positionEvent.pos) : 0;
            liquidationWsObject.data.liqPxS = positionEvent && +positionEvent.pos < 0 ? +positionEvent.liqPx : 0;
            liquidationWsObject.data.liqPxB = positionEvent && +positionEvent.pos > 0 ? +positionEvent.liqPx : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketMark.addOnClose(() => connectWebSocket('public', symbol, channelMark, webSocketMark, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket('private', symbol, channelPosition, webSocketPosition, wsSettings));
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
    getOrderBook: () => {
      /** @type {import('../../../typings/_ws').orderBookWsObjectReturn} */
      const orderBookWsObject = {
        data: null,
        events: null,
        connect: async (params) => {
          const webSocket = WebSocket('okex:order-book:order-book', wsSettings);
          orderBookWsObject.data = OrderBook();
          if (params && params.type === 'server') {
            orderBookWsObject.data._createServer(params);
          }
          if (params && params.type === 'client') {
            orderBookWsObject.data._connectClient(webSocket, params); return;
          }
          // Connect websocket
          const channel = 'books-l2-tbt';
          const symbol = params.symbol;
          await connectWebSocket('public', symbol, channel, webSocket, wsSettings);
          // Order book functionality
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message.toString());
            if (messageParse.event === 'subscribe' || !messageParse.arg || messageParse.arg.channel !== channel) { return };
            if (messageParse.action === 'snapshot') {
              return synchronizeOrderBookSnapshot(messageParse, orderBookWsObject.data);
            }
            if (messageParse.action === 'update') {
              const timestamp = Date.now();
              const orderBookTimestamp = +messageParse.data[0].ts;
              if (timestamp - orderBookTimestamp > 5000) {
                return webSocket.close();
              }
              messageParse.data[0].asks.forEach(v => {
                orderBookWsObject.data._updateOrderByPriceAsk({ id: +v[0], price: +v[0], quantity: +v[1] });
              });
              messageParse.data[0].bids.forEach(v => {
                orderBookWsObject.data._updateOrderByPriceBid({ id: +v[0], price: +v[0], quantity: +v[1] });
              });
            }
          });
          webSocket.addOnClose(() => {
            desynchronizeOrderBook(orderBookWsObject.data);
            connectWebSocket('public', symbol, channel, webSocket, wsSettings);
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
