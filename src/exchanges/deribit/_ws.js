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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/settings')} settings
 */
function connectWebSocket(channel, method, webSocket, settings) {
  console.log(`Connecting websocket: ${settings.WS.URL}`);
  return new Promise((resolve) => {
    const url = settings.WS.URL;
    const apiKey = settings.API_KEY;
    const apiSecret = settings.API_SECRET;
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
 * @param {import('../../../typings/settings')} settings
 */
function Ws(settings) {
  // Default ws settings values
  settings.REST = settings.REST || {};
  settings.WS.URL = settings.WS.URL || 'wss://www.deribit.com/ws/api/v2';
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
        const channelOpenOrders = `user.orders.${settings.SYMBOL}.raw`;
        const webSocketOpenOrders = WebSocket();
        // Executions websocket
        const channelExecutions = `user.trades.${settings.SYMBOL}.raw`;
        const webSocketExecutions = WebSocket();
        await Promise.all([
          connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, settings),
          connectWebSocket(channelExecutions, 'private', webSocketExecutions, settings),
        ]);
        webSocketOpenOrders.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (!messageParse.params || messageParse.params.channel !== channelOpenOrders) { return };
          if (!messageParse.params.data) { return };
          const order = messageParse.params.data;
          if (order.order_state === 'open') {
            ws.orders.events.emit('creations-updates', [createCreationUpdate(order)]);
          }
          if (order.order_state === 'rejected' || order.order_state === 'cancelled') {
            ws.orders.events.emit('cancelations', [createCancelation(order)]);
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
            ws.orders.events.emit('executions', executionOrders);
          }
        });
        webSocketOpenOrders.addOnError(() => console.log('Websocket connection error.'));
        webSocketOpenOrders.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketOpenOrders.addOnClose(() => { connectWebSocket(channelOpenOrders, 'private', webSocketOpenOrders, settings) });
        webSocketExecutions.addOnError(() => console.log('Websocket connection error.'));
        webSocketExecutions.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketExecutions.addOnClose(() => { connectWebSocket(channelExecutions, 'private', webSocketExecutions, settings) });
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
        const channel = `user.changes.${settings.SYMBOL}.raw`;
        const webSocket = WebSocket();
        await connectWebSocket(channel, 'private', webSocket, settings);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (!messageParse.params || messageParse.params.channel !== channel) { return };
          const positionEvent = messageParse.params.data.positions[0];
          if (!positionEvent) { return };
          ws.position.info.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
          ws.position.info.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
          ws.position.info.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
          ws.position.info.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => { connectWebSocket(channel, 'private', webSocket, settings) });
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
        // Instrument websocket
        const channelInstrument = `ticker.${settings.SYMBOL}.raw`;
        const webSocketInstrument = WebSocket();
        // Position websocket
        const channelPosition = `user.changes.${settings.SYMBOL}.raw`;
        const webSocketPosition = WebSocket();
        // Portfolio websocket
        const channelPortfolio = `user.portfolio.${settings.ASSET}`;
        const webSocketPortfolio = WebSocket();
        await Promise.all([
          connectWebSocket(channelInstrument, 'public', webSocketInstrument, settings),
          connectWebSocket(channelPosition, 'private', webSocketPosition, settings),
          connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, settings),
        ]);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        const liquidationRestData = (await rest.getLiquidation()).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketInstrument.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (!messageParse.params || messageParse.params.channel !== channelInstrument) { return };
          const instrumentEvent = messageParse.params.data;
          if (!instrumentEvent) { return };
          ws.liquidation.info.markPx = +instrumentEvent.mark_price ? +instrumentEvent.mark_price : ws.liquidation.info.markPx;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (!messageParse.params || messageParse.params.channel !== channelPosition) { return };
          const positionEvent = messageParse.params.data.positions[0];
          if (!positionEvent) { return };
          ws.liquidation.info.pxS = positionEvent.direction === 'sell' ? +positionEvent.average_price : 0;
          ws.liquidation.info.pxB = positionEvent.direction === 'buy' ? +positionEvent.average_price : 0;
          ws.liquidation.info.qtyS = positionEvent.direction === 'sell' ? Math.abs(+positionEvent.size) : 0;
          ws.liquidation.info.qtyB = positionEvent.direction === 'buy' ? Math.abs(+positionEvent.size) : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPortfolio.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (!messageParse.params || messageParse.params.channel !== channelPortfolio.toLowerCase()) { return };
          const portfolioEvent = messageParse.params.data;
          if (!portfolioEvent) { return };
          ws.liquidation.info.liqPxS = ws.liquidation.info.qtyS ? +portfolioEvent.estimated_liquidation_ratio * ws.liquidation.info.markPx : 0;
          ws.liquidation.info.liqPxB = ws.liquidation.info.qtyB ? +portfolioEvent.estimated_liquidation_ratio * ws.liquidation.info.markPx : 0;
        });
        webSocketInstrument.addOnError(() => console.log('Websocket connection error.'));
        webSocketInstrument.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketInstrument.addOnClose(() => connectWebSocket(channelInstrument, 'public', webSocketInstrument, settings));
        webSocketPosition.addOnError(() => console.log('Websocket connection error.'));
        webSocketPosition.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketPosition.addOnClose(() => connectWebSocket(channelPosition, 'private', webSocketPosition, settings));
        webSocketPortfolio.addOnError(() => console.log('Websocket connection error.'));
        webSocketPortfolio.addOnClose(() => console.log('Websocket connection closed.'));
        webSocketPortfolio.addOnClose(() => connectWebSocket(channelPortfolio, 'private', webSocketPortfolio, settings));
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
        const channel = `book.${settings.SYMBOL}.100ms`;
        const webSocket = WebSocket();
        await connectWebSocket(channel, 'public', webSocket, settings);
        // Order book functionality
        let prevChangeId = null;
        webSocket.addOnMessage(message => {
          const messageParse = JSON.parse(message);
          if (!messageParse.params || !messageParse.params.data) { return };
          if (messageParse.params.data.type === 'snapshot') {
            return synchronizeOrderBookSnapshot(messageParse.params.data, ws.orderBook.info);
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
            ws.orderBook.info._updateOrderByPriceAsk(update);
          });
          messageParse.params.data.bids.forEach(v => {
            const update = { id: +v[1], price: +v[1], quantity: +v[2] };
            ws.orderBook.info._updateOrderByPriceBid(update);
          });
        });
        webSocket.addOnError(() => console.log('Websocket connection error.'));
        webSocket.addOnClose(() => console.log('Websocket connection closed.'));
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(ws.orderBook.info);
          connectWebSocket(channel, 'public', webSocket, settings);
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
    },
  };
  return ws;
}
module.exports = Ws;
