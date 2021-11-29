

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
  * @param {number} price
  * @param {WsN.orderBookOrder[]} orders 
  */
function findOrderUpdateAskIndex(price, orders) {
  return orders.findIndex(v => v.price <= price);
};
/**
 * @param {number} price
 * @param {WsN.orderBookOrder[]} orders 
 */
function findOrderUpdateBidIndex(price, orders) {
  return orders.findIndex(v => v.price >= price);
};
/**
 * @param {'asks' | 'bids'} side 
 * @param {WsN.orderBookOrder[]} orders
 * @returns {(update: WsN.orderBookOrder) => void}
 */
function getUpdateOrderFunction(side, orders) {
  const findOrderUpdateIndex = side === 'asks' ? findOrderUpdateAskIndex : findOrderUpdateBidIndex;
  return function updateOrderFunction(update) {
    const index = findOrderUpdateIndex(update.price, orders);
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
    _updateOrderAsk: getUpdateOrderFunction('asks', asks),
    _updateOrderBid: getUpdateOrderFunction('bids', bids),
    _insertSnapshotAsks: getInsertSnapshotFunction(asks),
    _insertSnapshotBids: getInsertSnapshotFunction(bids),
  };
};
module.exports = OrderBook;
