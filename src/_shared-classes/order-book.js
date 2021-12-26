const WebSocket = require('ws');
/**
  * 
  * 
  * 
  * HELPER FUNCTIONS
  * 
  * 
  * 
  */
/**
 * @param {number} id
 * @param {import('../../typings').WsN.orderBookOrder[]} orders 
 */
function findOrderIndexById(id, orders) {
  return orders.findIndex(v => v.id === id);
};
/**
  * @param {number} price
  * @param {import('../../typings').WsN.orderBookOrder[]} orders 
  */
function findOrderIndexByPriceAsk(price, orders) {
  return orders.findIndex(v => v.price >= price);
};
/**
 * @param {number} price
 * @param {import('../../typings').WsN.orderBookOrder[]} orders 
 */
function findOrderIndexByPriceBid(price, orders) {
  return orders.findIndex(v => v.price <= price);
};
/**
 * @param {import('../../typings').WsN.orderBookOrder[]} orders
 * @returns {(update: import('../../typings').WsN.orderBookOrder) => void}
 */
function getDeleteOrderById(orders) {
  return function deleteOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToDelete = orders[index];
    if (orderToDelete) {
      orders.splice(index, 1);
    }
  };
};
/**
 * @param {import('../../typings').WsN.orderBookOrder[]} orders
 * @returns {(update: import('../../typings').WsN.orderBookOrder) => void}
 */
function getUpdateOrderById(orders) {
  return function updateOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (update.price) {
        orderToUpdate.price = update.price;
      }
      if (update.quantity) {
        orderToUpdate.quantity = update.quantity;
      }
    }
  };
};
/**
 * @param {'asks' | 'bids'} side 
 * @param {import('../../typings').WsN.orderBookOrder[]} orders
 * @returns {(update: import('../../typings').WsN.orderBookOrder) => void}
 */
function getUpdateOrderByPrice(side, orders) {
  const findOrderIndexByPrice = side === 'asks' ? findOrderIndexByPriceAsk : findOrderIndexByPriceBid;
  return function updateOrderByPrice(update) {
    const index = findOrderIndexByPrice(update.price, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (orderToUpdate.price === update.price) {
        if (!update.quantity) {
          orders.splice(index, 1);
        } else {
          orderToUpdate.quantity = update.quantity;
        }
      } else {
        if (update.quantity) {
          orders.splice(index, 0, update);
        }
      }
    } else {
      if (update.quantity) {
        orders.splice(orders.length, 0, update);
      }
    }
  };
};
/** 
 * @param {import('../../typings').WsN.orderBookOrder[]} orders
 * @returns {(snapshot: import('../../typings').WsN.orderBookOrder[]) => void}
 */
function getInsertSnapshotFunction(orders) {
  return function insertSnapshotFunction(snapshot) {
    orders.length = 0;
    snapshot.forEach(v => orders.push(v));
  };
};
/**
 * 
 * @param {import('../../typings').WsN.orderBookOrder[]} asks 
 * @param {import('../../typings').WsN.orderBookOrder[]} bids 
 * @returns 
 */
function getCreateServer(asks, bids) {
  /**
   * @param {import('../../typings').WsN.serverParams} serverParams 
   */
  function createServer(serverParams) {
    const wss = new WebSocket.Server({
      port: serverParams.port,
      host: serverParams.host,
      clientTracking: true,
    });
    wss.on('listening', function listening() {
      console.log(`Order Book Server listening on: ${serverParams.port}.`);
    });
    wss.on('connection', function connection(ws) {
      ws.on('ping', () => { ws.pong() });
    });
    wss.on('error', function error() {
      throw new Error('Websocket server connection error...');
    });
    wss.on('close', function close() {
      throw new Error('Websocket server connection closed...');
    });
    setInterval(() => {
      wss.clients.forEach((client) => {
        client.send(JSON.stringify({
          asks: asks.slice(0, 100),
          bids: bids.slice(0, 100),
          timestamp: Date.now(),
        }))
      });
    }, serverParams.broadcast);
  };
  return createServer;
};
function OrderBook() {
  /** @type {import('../../typings').WsN.orderBookOrder[]} */
  const asks = [];
  /** @type {import('../../typings').WsN.orderBookOrder[]} */
  const bids = [];
  /**
   * 
   * 
   * 
   * @type {import('../../typings').WsN.dataOrderBook}
   * 
   * 
   * 
   */
  const orderBook = {
    asks: asks,
    bids: bids,
    getFirstAsk: () => asks[0],
    getFirstBid: () => bids[0],
    createServer: getCreateServer(asks, bids),
    // Action by id
    _deleteOrderByIdAsk: getDeleteOrderById(asks),
    _deleteOrderByIdBid: getDeleteOrderById(bids),
    _updateOrderByIdAsk: getUpdateOrderById(asks),
    _updateOrderByIdBid: getUpdateOrderById(bids),
    // Action by price
    _updateOrderByPriceAsk: getUpdateOrderByPrice('asks', asks),
    _updateOrderByPriceBid: getUpdateOrderByPrice('bids', bids),
    // Insert snapshot
    _insertSnapshotAsks: getInsertSnapshotFunction(asks),
    _insertSnapshotBids: getInsertSnapshotFunction(bids),
  };
  let lastSnapshotAsks = '';
  let lastSnapshotBids = '';
  setInterval(() => {
    if (!orderBook.asks[0] || !orderBook.bids[0]) { return };
    if (orderBook.asks[0].price <= orderBook.bids[0].price) {
      throw { error: { type: 'order-book-price-overlaps', params: null, exchange: null } };
    }
  }, 5000);
  setInterval(() => {
    if (!orderBook.asks[0] || !orderBook.bids[0]) { return };
    const currentSnapshotAsks = JSON.stringify(orderBook.asks.slice(0, 10));
    const currentSnapshotBids = JSON.stringify(orderBook.bids.slice(0, 10));
    if (lastSnapshotAsks === currentSnapshotAsks || lastSnapshotBids === currentSnapshotBids) {
      throw { error: { type: 'order-book-static', params: null, exchange: null } };
    }
    lastSnapshotAsks = currentSnapshotAsks;
    lastSnapshotBids = currentSnapshotBids;
  }, 60000);
  return orderBook;
};
module.exports = OrderBook;
