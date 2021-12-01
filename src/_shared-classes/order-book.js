
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
 * @param {WsN.orderBookOrder[]} orders 
 */
function findOrderIndexById(id, orders) {
  return orders.findIndex(v => v.id === id);
};
/**
  * @param {number} price
  * @param {WsN.orderBookOrder[]} orders 
  */
function findOrderIndexByPriceAsk(price, orders) {
  return orders.findIndex(v => v.price <= price);
};
/**
 * @param {number} price
 * @param {WsN.orderBookOrder[]} orders 
 */
function findOrderIndexByPriceBid(price, orders) {
  return orders.findIndex(v => v.price >= price);
};
/**
 * @param {WsN.orderBookOrder[]} orders
 * @returns {(update: WsN.orderBookOrder) => void}
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
 * @param {WsN.orderBookOrder[]} orders
 * @returns {(update: WsN.orderBookOrder) => void}
 */
function getUpdateOrderById(orders) {
  return function updateOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      orderToUpdate.price = update.price;
      orderToUpdate.quantity = update.quantity;
    }
  };
};
/**
 * @param {'asks' | 'bids'} side 
 * @param {WsN.orderBookOrder[]} orders
 * @returns {(update: WsN.orderBookOrder) => void}
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
 * @param {WsN.orderBookOrder[]} orders
 * @returns {(snapshot: WsN.orderBookOrder[]) => void}
 */
function getInsertSnapshotFunction(orders) {
  return function insertSnapshotFunction(snapshot) {
    orders.length = 0;
    snapshot.forEach(v => orders.push(v));
  };
};
function OrderBook() {
  /** @type {WsN.orderBookOrder[]} */
  const asks = [];
  /** @type {WsN.orderBookOrder[]} */
  const bids = [];
  /**
   * 
   * 
   * 
   * @type {WsN.dataOrderBook}
   * 
   * 
   * 
   */
  const orderBook = {
    asks: asks,
    bids: bids,
    getFirstAsk: () => asks[0],
    getFirstBid: () => bids[0],
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
  setInterval(() => {
    if (!orderBook.asks[0] || !orderBook.bids[0]) { return };
    if (orderBook.asks[0].price <= orderBook.bids[0].price) {
      throw { error: { type: 'order-book-price-overlaps', params: null, exchange: null } };
    }
  }, 1000);
  return orderBook;
};
module.exports = OrderBook;
