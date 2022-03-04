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
 * @param {import('../../../typings/_ws').WebSocket} webSocket 
 * @param {import('../../../typings/settings')} settings
 */
function connectWebSocket(stream, webSocket, settings) {
  return new Promise((resolve) => {
    const url = settings.WS.URL;
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
 * @param {import('../../../typings/_rest').Rest} rest
 * @param {import('../../../typings/_ws').flags} flags
 */
async function getOrderBookSnapshot(rest, flags) {
  flags.synchronizing = true;
  flags.snapshot = (await rest._getOrderBook()).data;
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
 * @param {import('../../../typings/settings')} settings
 */
function Ws(settings) {
  // Default ws settings values
  settings.REST = settings.REST || {};
  settings.WS.URL = settings.WS.URL || 'wss://dstream.binance.com';
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
      events: new Events.EventEmitter(),
      connect: async () => {
        const stream = (await rest._getListenKey()).data;
        const webSocket = WebSocket();
        setInterval(() => rest._getListenKey(), 1800000);
        await connectWebSocket(stream, webSocket, settings);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.e !== 'ORDER_TRADE_UPDATE' || messageParse.o.s !== settings.SYMBOL) { return };
          if (messageParse.o.x === 'NEW') {
            ws.orders.events.emit('creations-updates', [createCreationUpdate(messageParse)]);
          }
          if (messageParse.o.x === 'TRADE' || messageParse.o.x === 'CALCULATED') {
            ws.orders.events.emit('executions', [createExecution(messageParse)]);
          }
          if (messageParse.o.x === 'CANCELED' || messageParse.o.x === 'EXPIRED') {
            ws.orders.events.emit('cancelations', [createCancelation(messageParse)]);
          }
        });
        webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, settings) });
      },
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
      events: new Events.EventEmitter(),
      connect: async () => {
        const stream = (await rest._getListenKey()).data;
        const webSocket = WebSocket();
        setInterval(() => rest._getListenKey(), 1800000);
        await connectWebSocket(stream, webSocket, settings);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        /** @type {import('../../../typings/_ws').dataPosition} */
        ws.position.info = Object.assign({}, positionRestData);
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.e !== 'ACCOUNT_UPDATE') { return };
          const positionEvent = messageParse.a.P.find(v => v.s === settings.SYMBOL);
          if (!positionEvent) { return };
          ws.position.info.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
          ws.position.info.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
          ws.position.info.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
          ws.position.info.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
          ws.position.events.emit('update', ws.position.info);
        });
        webSocket.addOnClose(() => { connectWebSocket(stream, webSocket, settings) });
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
      events: new Events.EventEmitter(),
      connect: async () => {
        // Mark price websocket
        const streamMarkPrice = `${settings.SYMBOL.toLowerCase()}@markPrice@1s`;
        const webSocketMarkPrice = WebSocket();
        // Position websocket
        const streamPosition = (await rest._getListenKey()).data;
        const webSocketPosition = WebSocket();
        setInterval(() => rest._getListenKey(), 1800000);
        await Promise.all([
          connectWebSocket(streamMarkPrice, webSocketMarkPrice, settings),
          connectWebSocket(streamPosition, webSocketPosition, settings),
        ]);
        // Load rest info
        const positionRestData = (await rest.getPosition()).data;
        const liquidationRestData = (await rest.getLiquidation()).data;
        // Liquidation info
        /** @type {import('../../../typings/_ws').dataLiquidation} */
        ws.liquidation.info = Object.assign({}, positionRestData, liquidationRestData);
        webSocketMarkPrice.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          console.log(messageParse);
          if (messageParse.e !== 'markPriceUpdate') { return };
          ws.liquidation.info.markPx = +messageParse.p;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        webSocketPosition.addOnMessage((message) => {
          const messageParsed = JSON.parse(message);
          console.log(messageParsed);
          if (messageParsed.e !== 'ACCOUNT_UPDATE') { return };
          const positionEvent = messageParsed.a.P.find(v => v.s === settings.SYMBOL);
          if (!positionEvent) { return };
          ws.liquidation.info.pxS = +positionEvent.pa < 0 ? +positionEvent.ep : 0;
          ws.liquidation.info.pxB = +positionEvent.pa > 0 ? +positionEvent.ep : 0;
          ws.liquidation.info.qtyS = +positionEvent.pa < 0 ? Math.abs(+positionEvent.pa) : 0;
          ws.liquidation.info.qtyB = +positionEvent.pa > 0 ? Math.abs(+positionEvent.pa) : 0;
          ws.liquidation.info.liqPxS = +positionEvent.pa < 0 ? ws.liquidation.info.liqPxS : 0;
          ws.liquidation.info.liqPxB = +positionEvent.pa > 0 ? ws.liquidation.info.liqPxB : 0;
          ws.liquidation.events.emit('update', ws.liquidation.info);
        });
        setInterval(async () => {
          if (!ws.liquidation.info.qtyS && !ws.liquidation.info.qtyB) { return };
          const liquidationInfo = await rest.getLiquidation();
          ws.liquidation.info.markPx = liquidationInfo.data.markPx;
          ws.liquidation.info.liqPxS = liquidationInfo.data.liqPxS;
          ws.liquidation.info.liqPxB = liquidationInfo.data.liqPxB;
        }, 2000);
        webSocketMarkPrice.addOnClose(() => connectWebSocket(streamMarkPrice, webSocketMarkPrice, settings));
        webSocketPosition.addOnClose(() => connectWebSocket(streamPosition, webSocketPosition, settings));
      },
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
        const stream = `${settings.SYMBOL.toLowerCase()}@depth`;
        const webSocket = WebSocket();
        await connectWebSocket(stream, webSocket, settings);
        // Order book functionality
        const flags = { synchronized: false, synchronizing: false, snapshot: null };
        webSocket.addOnMessage((message) => {
          const messageParse = JSON.parse(message);
          if (!flags.synchronized) {
            if (!flags.synchronizing) {
              if (!flags.snapshot) {
                getOrderBookSnapshot(rest, flags);
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
                  synchronizeOrderBookSnapshot(snapshot, ws.orderBook.info);
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
            ws.orderBook.info._updateOrderByPriceAsk(update);
          });
          messageParse.b.forEach(v => {
            const update = { id: +v[0], price: +v[0], quantity: +v[1] };
            ws.orderBook.info._updateOrderByPriceBid(update);
          })
        });
        webSocket.addOnClose(() => {
          desynchronizeOrderBook(flags, ws.orderBook.info);
          connectWebSocket(stream, webSocket, settings);
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
