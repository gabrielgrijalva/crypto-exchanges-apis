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
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.p;
  eventData.quantity = +data.o.q;
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.L;
  eventData.quantity = +data.o.l;
  eventData.timestamp = moment(+data.o.T).utc().format('YYYY-MM-DD HH:mm:ss');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.id = data.o.c;
  return eventData;
};
/**
 * 
 * @param {string} stream
 * @param {WsN.WebSocket} webSocket 
 * @param {WsN.wsOptions} wsOptions 
 */
function connectWebSocket(stream, webSocket, wsOptions) {
  return new Promise((resolve) => {
    const url = wsOptions.url;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/ws/${stream}`);
    webSocket.addOnOpen(function connectFunction() {
      resolve();
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connectFunction);
    });
  });
};
/**
 * @param {RestN.Rest} rest
 * @param {WsN.flags} flags
 * @param {string} symbol
 */
async function getOrderBookSnapshot(rest, flags, symbol) {
  flags.synchronizing = true;
  flags.snapshot = (await rest._getOrderBook({ symbol: symbol })).data;
  flags.synchronizing = false;
};
/**
 * 
 * @param {WsN.flags} flags
 * @param {WsN.dataOrderBook} orderBook 
 */
function desynchronizeOrderBook(flags, orderBook) {
  flags.snapshot = null;
  flags.synchronized = false;
  flags.synchronizing = false;
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
    return { id: +v[0], price: +v[0], quantity: +v[1] };
  }));
  orderBook._insertSnapshotBids(snapshot.bids.map(v => {
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
 * @param {WsN.wsOptions} [wsOptions]
 */
function Ws(wsOptions) {
  // Default wsOptions values
  wsOptions = wsOptions || {};
  wsOptions.url = wsOptions.url || 'wss://dstream.binance.com';
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
      const stream = (await rest._getListenKey()).data;
      const webSocket = WebSocket();
      setInterval(() => rest._getListenKey(), 1800000);
      await connectWebSocket(stream, webSocket, wsOptions);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.e !== 'ORDER_TRADE_UPDATE' || messageParse.o.s !== ordersParams.symbol) { return };
        if (messageParse.o.x === 'NEW') {
          eventEmitter.emit('creations-updates', [createCreationUpdate(messageParse)]);
        }
        if (messageParse.o.x === 'TRADE' || messageParse.o.x === 'CALCULATED') {
          eventEmitter.emit('executions', [createExecution(messageParse)]);
        }
        if (messageParse.o.x === 'CANCELED' || messageParse.o.x === 'EXPIRED') {
          eventEmitter.emit('cancelations', [createCancelation(messageParse)]);
        }
      });
      webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, wsOptions) });
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
      const stream = (await rest._getListenKey()).data;
      const webSocket = WebSocket();
      setInterval(() => rest._getListenKey(), 1800000);
      await connectWebSocket(stream, webSocket, wsOptions);
      // Load rest info
      const positionRestParams = { symbol: positionParams.symbol };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      /** @type {WsN.dataPosition} */
      const position = Object.assign({}, positionRestData);
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.e !== 'ACCOUNT_UPDATE') { return };
        const positionEvent = messageParse.a.P.find(v => v.s === positionParams.symbol);
        if (!positionEvent) { return };
        position.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
        position.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
        position.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
        position.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
        eventEmitter.emit('update', position);
      });
      webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, wsOptions) });
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
      // Mark price websocket
      const streamMarkPrice = `${liquidationParams.symbol.toLowerCase()}@markPrice@1s`;
      const webSocketMarkPrice = WebSocket();
      // Position websocket
      const streamPosition = (await rest._getListenKey()).data;
      const webSocketPosition = WebSocket();
      setInterval(() => rest._getListenKey(), 1800000);
      await Promise.all([
        connectWebSocket(streamMarkPrice, webSocketMarkPrice, wsOptions),
        connectWebSocket(streamPosition, webSocketPosition, wsOptions),
      ]);
      // Load rest info
      const positionRestParams = { symbol: liquidationParams.symbol };
      const liquidationRestParams = { symbol: liquidationParams.symbol, asset: liquidationParams.asset };
      const positionRestData = (await rest.getPosition(positionRestParams)).data;
      const liquidationRestData = (await rest.getLiquidation(liquidationRestParams)).data;
      // Liquidation info
      /** @type {WsN.dataLiquidation} */
      const liquidation = Object.assign({}, positionRestData, liquidationRestData);
      webSocketMarkPrice.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (messageParse.e !== 'markPriceUpdate') { return };
        liquidation.markPx = +messageParse.p;
        eventEmitter.emit('update', liquidation);
      });
      webSocketPosition.addOnMessage((message) => {
        const messageParsed = JSON.parse(message);
        if (messageParsed.e !== 'ACCOUNT_UPDATE') { return };
        const positionEvent = messageParsed.a.P.find(v => v.s === liquidationParams.symbol);
        if (!positionEvent) { return };
        liquidation.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
        liquidation.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
        liquidation.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
        liquidation.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
        eventEmitter.emit('update', liquidation);
      });
      webSocketMarkPrice.addOnClose(() => connectWebSocket(streamMarkPrice, webSocketMarkPrice, wsOptions));
      webSocketPosition.addOnClose(() => connectWebSocket(streamPosition, webSocketPosition, wsOptions));
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
      const stream = `${orderBookParams.symbol.toLowerCase()}@depth`;
      const webSocket = WebSocket();
      await connectWebSocket(stream, webSocket, wsOptions);
      // Order book functionality
      const flags = { synchronized: false, synchronizing: false, snapshot: null };
      const orderBook = OrderBook();
      webSocket.addOnMessage((message) => {
        const messageParse = JSON.parse(message);
        if (!flags.synchronized) {
          if (!flags.synchronizing) {
            if (!flags.snapshot) {
              getOrderBookSnapshot(rest, flags, orderBookParams.symbol);
            } else {
              const snapshot = flags.snapshot;
              if (snapshot.lastUpdateId < messageParse.U) {
                flags.snapshot = null;
                flags.synchronized = false;
                flags.synchronizing = false;
              }
              if (snapshot.lastUpdateId >= messageParse.U && snapshot.lastUpdateId <= messageParse.u) {
                flags.snapshot = null;
                flags.synchronized = true;
                synchronizeOrderBookSnapshot(snapshot, orderBook);
              }
            }
          }
        }
        if (!flags.synchronized) { return };
        const timestamp = Date.now();
        const orderBookTimestamp = +messageParse.E;
        if (timestamp - orderBookTimestamp > 5000) {
          webSocket.disconnect();
        }
        messageParse.a.forEach(v => {
          const update = { id: +v[0], price: +v[0], quantity: +v[1] };
          orderBook._updateOrderByPriceAsk(update);
        });
        messageParse.b.forEach(v => {
          const update = { id: +v[0], price: +v[0], quantity: +v[1] };
          orderBook._updateOrderByPriceBid(update);
        })
      });
      webSocket.addOnClose(() => {
        desynchronizeOrderBook(flags, orderBook);
        connectWebSocket(stream, webSocket, wsOptions);
      });
      return { info: orderBook, };
    },
  };
  return ws;
}
module.exports = Ws;
