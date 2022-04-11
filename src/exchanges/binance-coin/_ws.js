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
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.p;
  eventData.quantity = +data.o.q;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createExecution(data) {
  const eventData = {};
  eventData.event = 'executions';
  eventData.id = data.o.c;
  eventData.side = data.o.S.toLowerCase();
  eventData.price = +data.o.L;
  eventData.quantity = +data.o.l;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
function createCancelation(data) {
  const eventData = {};
  eventData.event = 'cancelations';
  eventData.id = data.o.c;
  eventData.timestamp = moment(+data.T).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
  return eventData;
};
/**
 * 
 * @param {string} stream
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/_ws').wsSettings} wsSettings
 */
function connectWebSocket(stream, webSocket, wsSettings) {
  return new Promise((resolve) => {
    const url = wsSettings.URL;
    const connectTimeout = setTimeout(() => { throw new Error('Could not connect websocket.') }, 60000);
    webSocket.connect(`${url}/ws/${stream}`);
    function connectFunction() {
      resolve();
      clearTimeout(connectTimeout);
      webSocket.removeOnOpen(connectFunction);
    };
    webSocket.addOnOpen(connectFunction, false);
  });
};
/**
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').flags} flags
 * @param {string} symbol
 */
async function getOrderBookSnapshot(rest, flags, symbol) {
  flags.synchronizing = true;
  flags.snapshot = (await rest._getOrderBook({ symbol })).data;
  flags.synchronizing = false;
};
/**
 * 
 * @param {import('../../../typings/_ws').flags} flags
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
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
 * @param {import('../../../typings/_ws').dataOrderBook} orderBook 
 */
function synchronizeOrderBookSnapshot(snapshot, orderBook) {
  orderBook._insertSnapshotAsks(snapshot.asks.map(v => {
    return { id: +v.id, price: +v.price, quantity: +v.quantity };
  }));
  orderBook._insertSnapshotBids(snapshot.bids.map(v => {
    return { id: +v.id, price: +v.price, quantity: +v.quantity };
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
  wsSettings.URL = wsSettings.URL || 'wss://dstream.binance.com';
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
      const webSocket = WebSocket('binance-coin:orders:orders', wsSettings);
      /** @type {import('../../../typings/_ws').ordersWsObjectReturn} */
      const ordersWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          const stream = (await rest._getListenKey()).data;
          setInterval(() => rest._getListenKey(), 1800000);
          await connectWebSocket(stream, webSocket, wsSettings);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.e !== 'ORDER_TRADE_UPDATE' || messageParse.o.s !== params.symbol) { return };
            if (messageParse.o.x === 'NEW') {
              ordersWsObject.events.emit('creations-updates', [createCreationUpdate(messageParse)]);
            }
            if (messageParse.o.x === 'TRADE' || messageParse.o.x === 'CALCULATED') {
              ordersWsObject.events.emit('executions', [createExecution(messageParse)]);
            }
            if (messageParse.o.x === 'CANCELED' || messageParse.o.x === 'EXPIRED') {
              ordersWsObject.events.emit('cancelations', [createCancelation(messageParse)]);
            }
          });
          webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, wsSettings) });
        },
      }
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
      const webSocket = WebSocket('binance-coin:position:position', wsSettings);
      /** @type {import('../../../typings/_ws').positionWsObjectReturn} */
      const positionWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          const stream = (await rest._getListenKey()).data;
          setInterval(() => rest._getListenKey(), 1800000);
          await connectWebSocket(stream, webSocket, wsSettings);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          /** @type {import('../../../typings/_ws').dataPosition} */
          positionWsObject.data = Object.assign({}, positionRestData);
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.e !== 'ACCOUNT_UPDATE') { return };
            const positionEvent = messageParse.a.P.find(v => v.s === params.symbol);
            if (!positionEvent) { return };
            positionWsObject.data.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
            positionWsObject.data.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
            positionWsObject.data.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
            positionWsObject.data.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
            positionWsObject.events.emit('update', positionWsObject.data);
          });
          webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, wsSettings) });
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
      const webSocketMarkPrice = WebSocket('binance-coin:liquidation:mark-price', wsSettings);
      const webSocketPosition = WebSocket('binance-coin:liquidation:position', wsSettings);
      /** @type {import('../../../typings/_ws').liquidationWsObjectReturn} */
      const liquidationWsObject = {
        data: null,
        events: new Events.EventEmitter(),
        connect: async () => {
          const streamMarkPrice = `${params.symbol.toLowerCase()}@markPrice@1s`;
          const streamPosition = (await rest._getListenKey()).data;
          setInterval(() => rest._getListenKey(), 1800000);
          await Promise.all([
            connectWebSocket(streamMarkPrice, webSocketMarkPrice, wsSettings),
            connectWebSocket(streamPosition, webSocketPosition, wsSettings),
          ]);
          // Load rest data
          const positionRestData = (await rest.getPosition(params)).data;
          const liquidationRestData = (await rest.getLiquidation(params)).data;
          // Liquidation data
          /** @type {import('../../../typings/_ws').dataLiquidation} */
          liquidationWsObject.data = Object.assign({}, positionRestData, liquidationRestData);
          webSocketMarkPrice.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            console.log(messageParse);
            if (messageParse.e !== 'markPriceUpdate') { return };
            liquidationWsObject.data.markPx = +messageParse.p;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          webSocketPosition.addOnMessage((message) => {
            const messageParsed = JSON.parse(message);
            console.log(messageParsed);
            if (messageParsed.e !== 'ACCOUNT_UPDATE') { return };
            const positionEvent = messageParsed.a.P.find(v => v.s === params.symbol);
            if (!positionEvent) { return };
            liquidationWsObject.data.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
            liquidationWsObject.data.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
            liquidationWsObject.data.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
            liquidationWsObject.data.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
            liquidationWsObject.data.liqPxS = +positionEvent.pa < 0 ? liquidationWsObject.data.liqPxS : 0;
            liquidationWsObject.data.liqPxB = +positionEvent.pa > 0 ? liquidationWsObject.data.liqPxB : 0;
            liquidationWsObject.events.emit('update', liquidationWsObject.data);
          });
          setInterval(async () => {
            if (!liquidationWsObject.data.qtyS && !liquidationWsObject.data.qtyB) { return };
            const liquidationInfo = await rest.getLiquidation(params);
            liquidationWsObject.data.markPx = liquidationInfo.data.markPx;
            liquidationWsObject.data.liqPxS = liquidationInfo.data.liqPxS;
            liquidationWsObject.data.liqPxB = liquidationInfo.data.liqPxB;
          }, 2000);
          webSocketMarkPrice.addOnClose(() => connectWebSocket(streamMarkPrice, webSocketMarkPrice, wsSettings));
          webSocketPosition.addOnClose(() => connectWebSocket(streamPosition, webSocketPosition, wsSettings));
        },
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
      const webSocket = WebSocket('binance-coin:order-book:order-book', wsSettings);
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
          const stream = `${params.symbol.toLowerCase()}@depth`;
          await connectWebSocket(stream, webSocket, wsSettings);
          // Order book functionality
          const flags = { synchronized: false, synchronizing: false, snapshot: null };
          webSocket.addOnMessage((message) => {
            const messageParse = JSON.parse(message);
            if (!flags.synchronized) {
              if (!flags.synchronizing) {
                if (!flags.snapshot) {
                  getOrderBookSnapshot(rest, flags, params.symbol);
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
                    synchronizeOrderBookSnapshot(snapshot, orderBookWsObject.data);
                  }
                }
              }
            }
            if (!flags.synchronized) { return };
            const timestamp = Date.now();
            const orderBookTimestamp = +messageParse.E;
            if (timestamp - orderBookTimestamp > 5000) {
              webSocket.close();
            }
            messageParse.a.forEach(v => {
              const update = { id: +v[0], price: +v[0], quantity: +v[1] };
              orderBookWsObject.data._updateOrderByPriceAsk(update);
            });
            messageParse.b.forEach(v => {
              const update = { id: +v[0], price: +v[0], quantity: +v[1] };
              orderBookWsObject.data._updateOrderByPriceBid(update);
            })
          });
          webSocket.addOnClose(() => {
            desynchronizeOrderBook(flags, orderBookWsObject.data);
            connectWebSocket(stream, webSocket, wsSettings);
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
