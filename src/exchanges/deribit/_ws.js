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
  eventData.event = 'creations-updates';
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  eventData.timestamp = moment(data.last_update_timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.label;
  eventData.side = data.direction;
  eventData.price = +data.price;
  eventData.quantity = Math.abs(+data.amount);
  eventData.timestamp = moment(data.timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.label;
  eventData.timestamp = moment(data.last_update_timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(channel, method, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const apiKey = wsSettings.API_KEY;
    const apiSecret = wsSettings.API_SECRET;
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
        resolve();
        clearTimeout(connectTimeout);
        webSocket.removeOnOpen(connectOnOpenFunction);
        webSocket.removeOnMessage(connectOnMessageFunction);
      };
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
 * 
 * @param {Object} snapshot 
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
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
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function Ws(wsSettings) {
  // Default ws wsSettings values
  wsSettings.URL = wsSettings.URL || 'wss://www.deribit.com/ws/api/v2';
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
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: null,
        connect: async () => {
          /** @type {import('../../../typings/_ws').ordersEventEmitter} */
          ordersWsObject.events = new Events.EventEmitter();
          // Open orders websocket
          const channelOpenOrders = `user.orders.${params.symbol}.raw`;
          const webSocketOpenOrders = WebSocket('deribit:orders:orders');
          // Executions websocket
          const channelExecutions = `user.trades.${params.symbol}.raw`;
          const webSocketExecutions = WebSocket('deribit:orders:executions');
          await Promise.all([
            connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, wsSettings),
            connectWebSocket(channelExecutions, 'private', webSocketExecutions, wsSettings),
          ]);
          webSocketOpenOrders.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (!messageParse.params || messageParse.params.channel !== channelOpenOrders) { return };
            if (!messageParse.params.data) { return };
            const order = messageParse.params.data;
            if (order.order_state === 'open') {
              ordersWsObject.events.emit('creations-updates', [createCreationUpdate(order)]);
            }
            if (order.order_state === 'rejected' || order.order_state === 'cancelled') {
              ordersWsObject.events.emit('cancelations', [createCancelation(order)]);
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
              ordersWsObject.events.emit('executions', executionOrders);
            }
          });
          webSocketOpenOrders.addOnClose(() => { connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, wsSettings) });
          webSocketExecutions.addOnClose(() => { connectWebSocket(channelExecutions, 'private', webSocketExecutions, wsSettings) });
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
          const channel = `user.changes.${params.symbol}.raw`;
          const webSocket = WebSocket('deribit:position:position');
          await connectWebSocket(channel, 'private', webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (!messageParse.params || messageParse.params.channel !== channel) { return };
            const positionEvent = messageParse.params.data.positions[0];
            if (!positionEvent) { return };
            positionWsObject.data.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
            positionWsObject.data.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
            positionWsObject.data.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
            positionWsObject.data.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => { connectWebSocket(channel, 'private', webSocket, wsSettings) });
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
          const channelInstrument = `ticker.${params.symbol}.raw`;
          const webSocketInstrument = WebSocket('deribit:liquidation:instrument');
          // Position websocket
          const channelPosition = `user.changes.${params.symbol}.raw`;
          const webSocketPosition = WebSocket('deribit:liquidation:position');
          // Portfolio websocket
          const channelPortfolio = `user.portfolio.${params.asset}`;
          const webSocketPortfolio = WebSocket('deribit:liquidation:portfolio');
          await Promise.all([
            connectWebSocket(channelInstrument, 'public', webSocketInstrument, wsSettings),
            connectWebSocket(channelPosition, 'private', webSocketPosition, wsSettings),
            connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, wsSettings),
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
            if (!messageParse.params || messageParse.params.channel !== channelInstrument) { return };
            const instrumentEvent = messageParse.params.data;
            if (!instrumentEvent) { return };
            liquidationWsObject.data.markPx = +instrumentEvent.mark_price ? +instrumentEvent.mark_price : liquidationWsObject.data.markPx;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (!messageParse.params || messageParse.params.channel !== channelPosition) { return };
            const positionEvent = messageParse.params.data.positions[0];
            if (!positionEvent) { return };
            liquidationWsObject.data.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
            liquidationWsObject.data.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
            liquidationWsObject.data.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
            liquidationWsObject.data.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPortfolio.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (!messageParse.params || messageParse.params.channel !== channelPortfolio.toLowerCase()) { return };
            const portfolioEvent = messageParse.params.data;
            if (!portfolioEvent) { return };
            liquidationWsObject.data.liqPxS = liquidationWsObject.data.qtyS ? +portfolioEvent.estimated_liquidation_ratio * liquidationWsObject.data.markPx : 0;
            liquidationWsObject.data.liqPxB = liquidationWsObject.data.qtyB ? +portfolioEvent.estimated_liquidation_ratio * liquidationWsObject.data.markPx : 0;
          });
          webSocketInstrument.addOnClose(() => connectWebSocket(channelInstrument, 'public', webSocketInstrument, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket(channelPosition, 'private', webSocketPosition, wsSettings));
          webSocketPortfolio.addOnClose(() => connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, wsSettings));
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
          const webSocket = WebSocket('deribit:order-book:order-book');
          orderBookWsObject.data = OrderBook();
          if (params && params.type === 'server') {
            orderBookWsObject.data._createServer(params);
          }
          if (params && params.type === 'client') {
            orderBookWsObject.data._connectClient(webSocket, params); return;
          }
          // Connect websocket
          const channel = `book.${params.symbol}.100ms`;
          await connectWebSocket(channel, 'public', webSocket, wsSettings);
          // Order book functionality
          let prevChangeId = null;
          webSocket.addOnMessage(message => {
            const messageParse = JSON.parse(message);
            if (!messageParse.params || !messageParse.params.data) { return };
            if (messageParse.params.data.type === 'snapshot') {
              return synchronizeOrderBookSnapshot(messageParse.params.data, orderBookWsObject.data);
            }
            if (prevChangeId && prevChangeId !== messageParse.params.data.prev_change_id) {
              return webSocket.close();
            }
            prevChangeId = messageParse.params.data.change_id;
            const timestamp = Date.now();
            const orderBookTimestamp = +messageParse.params.data.timestamp;
            if (timestamp - orderBookTimestamp > 5000) {
              return webSocket.close();
            }
            messageParse.params.data.asks.forEach(v => {
              const update = { id: +v[1], price: +v[1], quantity: +v[2] };
              orderBookWsObject.data._updateOrderByPriceAsk(update);
            });
            messageParse.params.data.bids.forEach(v => {
              const update = { id: +v[1], price: +v[1], quantity: +v[2] };
              orderBookWsObject.data._updateOrderByPriceBid(update);
            });
          });
          webSocket.addOnClose(() => {
            desynchronizeOrderBook(orderBookWsObject.data);
            connectWebSocket(channel, 'public', webSocket, wsSettings);
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
